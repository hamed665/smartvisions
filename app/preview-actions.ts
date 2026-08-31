'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { generateProductionAsset } from '@/lib/preview/production-service';
import { verifyControlledPreviewPilot } from '@/lib/preview/controlled-pilot';
import { transitionPreview } from '@/lib/preview/persistence';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Preview production');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeMessage(value: unknown, fallback = 'Controlled Preview production pilot failed') {
  return (value instanceof Error ? value.message : fallback)
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .slice(0, 220);
}

function payloadBusinessCategory(value: unknown) {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {};
  const growth = metadata.growth_source && typeof metadata.growth_source === 'object' ? metadata.growth_source as Record<string, unknown> : {};
  const business = growth.business && typeof growth.business === 'object' ? growth.business as Record<string, unknown> : {};
  return String(business.category ?? '');
}

export async function generateControlledPreviewPilot() {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/preview-studio';
  let sourceLeadId: string | null = null;

  try {
    const { data: pilotBusinesses, error: businessError } = await db
      .from('businesses')
      .select('id,category,leads(id,status,agent_mode)')
      .eq('organization_id', ctx.organizationId)
      .eq('category', 'INTERNAL_TEST')
      .not('whatsapp', 'is', null)
      .limit(2);
    if (businessError) throw businessError;
    if (!pilotBusinesses || pilotBusinesses.length !== 1) {
      throw new Error('Controlled Preview pilot requires exactly one INTERNAL_TEST WhatsApp business');
    }

    const pilotBusiness = pilotBusinesses[0];
    const leads = Array.isArray(pilotBusiness.leads) ? pilotBusiness.leads : [];
    if (leads.length !== 1) throw new Error('Controlled Preview pilot requires exactly one INTERNAL_TEST WhatsApp lead');
    const pilotLead = leads[0] as { id: string; status: string; agent_mode: string };
    sourceLeadId = pilotLead.id;

    const [controlsResult, voiceResult, directorResult, growthResult] = await Promise.all([
      db.from('system_controls')
        .select('shadow_mode,global_kill_switch')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle(),
      db.from('voice_transcriptions')
        .select('id,lead_id,status,transcript,provider_message_id,updated_at')
        .eq('organization_id', ctx.organizationId)
        .eq('lead_id', pilotLead.id)
        .eq('status', 'SUCCEEDED')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('agent_settings')
        .select('enabled')
        .eq('organization_id', ctx.organizationId)
        .eq('agent_name', 'preview_director')
        .maybeSingle(),
      db.from('growth_opportunities')
        .select('sales_lane,recommended_services,next_action_can_spend_money')
        .eq('organization_id', ctx.organizationId)
        .eq('business_id', pilotBusiness.id)
        .maybeSingle(),
    ]);

    if (controlsResult.error) throw controlsResult.error;
    if (voiceResult.error) throw voiceResult.error;
    if (directorResult.error) throw directorResult.error;
    if (growthResult.error) throw growthResult.error;

    const verification = verifyControlledPreviewPilot({
      shadowMode: controlsResult.data?.shadow_mode === true,
      globalKillSwitch: controlsResult.data?.global_kill_switch === true,
      businessCategory: String(pilotBusiness.category ?? ''),
      leadId: pilotLead.id,
      voiceLeadId: voiceResult.data?.lead_id ?? null,
      leadStatus: pilotLead.status,
      leadAgentMode: pilotLead.agent_mode,
      voiceStatus: voiceResult.data?.status ?? null,
      voiceTranscript: voiceResult.data?.transcript ?? null,
      previewDirectorEnabled: directorResult.data?.enabled === true,
      salesLane: growthResult.data?.sales_lane ?? null,
      recommendedServices: growthResult.data?.recommended_services ?? [],
      nextActionCanSpendMoney: growthResult.data?.next_action_can_spend_money === true,
    });
    if (!verification.verified) throw new Error(`Controlled Preview pilot blocked: ${verification.reason}`);

    const result = await generateProductionAsset({
      organizationId: ctx.organizationId,
      leadId: pilotLead.id,
      explicitRequest: true,
      ownerApprovedHeavyGeneration: false,
    });
    if (!result.eligible) throw new Error(`Controlled Preview generation blocked: ${result.eligibility.reasons.join(',')}`);

    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'CONTROLLED_PREVIEW_PRODUCTION_GENERATION',
      entity_type: 'preview',
      entity_id: result.previewId,
      after_data: {
        leadId: pilotLead.id,
        businessId: pilotBusiness.id,
        voiceTranscriptionId: voiceResult.data?.id ?? null,
        voiceProviderMessageId: voiceResult.data?.provider_message_id ?? null,
        previewId: result.previewId,
        status: result.status,
        reused: result.reused,
        generationCostUsd: 0,
        providerCalls: 0,
        outboundTriggered: false,
        shadowModePreserved: true,
        reconciliationRequired: 'reconciliationRequired' in result ? result.reconciliationRequired : false,
      },
    });
    if (auditError) throw new Error(`Controlled Preview audit failed: ${auditError.message}`);

    destination = `/preview-studio?pilot=generated&previewId=${encodeURIComponent(result.previewId)}&previewStatus=${encodeURIComponent(result.status)}&reused=${result.reused ? '1' : '0'}`;
  } catch (error) {
    const message = safeMessage(error);
    await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'CONTROLLED_PREVIEW_PRODUCTION_GENERATION_FAILED',
      entity_type: sourceLeadId ? 'lead' : 'preview',
      entity_id: sourceLeadId ?? ctx.organizationId,
      after_data: {
        leadId: sourceLeadId,
        error: message,
        generationCostUsd: 0,
        providerCalls: 0,
        outboundTriggered: false,
      },
    });
    destination = `/preview-studio?pilot=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/preview-studio');
  revalidatePath('/cost-usage');
  redirect(destination);
}

export async function approvePreview(formData: FormData) {
  const previewId = String(formData.get('preview_id') ?? '').trim();
  if (!previewId) throw new Error('preview_id is required');
  const { organizationId, userId } = await getCurrentOrganization(true);
  await transitionPreview({ organizationId, previewId, action: 'APPROVE', actorId: userId, metadata: { source: 'preview_studio' } });
  revalidatePath('/preview-studio');
}

export async function markPreviewSent(formData: FormData) {
  const previewId = String(formData.get('preview_id') ?? '').trim();
  if (!previewId) throw new Error('preview_id is required');
  const { organizationId, userId } = await getCurrentOrganization(true);
  await transitionPreview({ organizationId, previewId, action: 'SEND', actorId: userId, metadata: { source: 'preview_studio', manual_share: true } });
  revalidatePath('/preview-studio');
}

export async function markControlledPreviewShared(formData: FormData) {
  const previewId = String(formData.get('preview_id') ?? '').trim();
  if (!previewId) throw new Error('preview_id is required');
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();

  const [{ data: preview, error: previewError }, { data: generationAudit, error: auditLookupError }] = await Promise.all([
    db.from('previews')
      .select('id,status,payload')
      .eq('organization_id', ctx.organizationId)
      .eq('id', previewId)
      .maybeSingle(),
    db.from('audit_logs')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('action', 'CONTROLLED_PREVIEW_PRODUCTION_GENERATION')
      .eq('entity_id', previewId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (previewError || !preview) throw new Error(previewError?.message ?? 'Preview not found');
  if (auditLookupError) throw auditLookupError;
  if (!generationAudit || payloadBusinessCategory(preview.payload) !== 'INTERNAL_TEST') {
    throw new Error('Controlled internal share is allowed only for the verified INTERNAL_TEST Preview pilot');
  }

  const result = await transitionPreview({
    organizationId: ctx.organizationId,
    previewId,
    action: 'SEND',
    actorId: ctx.userId,
    metadata: {
      source: 'preview_studio',
      manual_share: true,
      controlled_internal_share: true,
      external_recipient: false,
      provider_calls: 0,
    },
  });

  const { error: auditError } = await db.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'CONTROLLED_PREVIEW_INTERNAL_SHARE_MARKED',
    entity_type: 'preview',
    entity_id: previewId,
    after_data: {
      previewId,
      status: result.status,
      externalRecipient: false,
      providerCalls: 0,
      outboundTriggered: false,
      shadowModePreserved: true,
    },
  });
  if (auditError) throw new Error(`Controlled Preview share audit failed: ${auditError.message}`);

  revalidatePath('/preview-studio');
}

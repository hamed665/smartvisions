'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

const SAHRA_ORG = '4824ef22-a53e-480f-b40e-be901e891a03';
const SAHRA_BUSINESS = 'c0db8ad8-04d5-40b8-843f-59b87a88bc0d';
const SAHRA_BINDING = '417d76e7-b228-4bfd-a20c-73dc660f8ebe';
const DAILY_CAP = 200;

/**
 * OWNER-authenticated activation only. This is not callable by cron and
 * cannot be activated by editing the old 90-minute pilot's expiry.
 * Neither Shadow Mode nor global approval are switched off.
 */
export async function configureSahraInboundService(formData: FormData) {
  const owner = await getCurrentOrganization(true);
  if (owner.organizationId !== SAHRA_ORG) throw new Error('SAHRA_OWNER_SCOPE_REQUIRED');
  const enabled = formData.get('enable') === 'true';
  const db = owner.supabase;
  const [{ data: rule, error: ruleError }, { data: binding, error: bindingError },
    { data: controls, error: controlsError }] = await Promise.all([
    db.from('approval_rules').select('id,config,requires_approval')
      .eq('organization_id', SAHRA_ORG).eq('action_key', 'WHATSAPP_OUTBOUND').maybeSingle(),
    db.from('communication_channel_bindings')
      .select('id,tenant_business_id,provider,channel,status,provider_account_id,provider_destination_id,provider_secret_ref,last_error_code')
      .eq('organization_id', SAHRA_ORG).eq('id', SAHRA_BINDING).maybeSingle(),
    db.from('system_controls').select('shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused')
      .eq('organization_id', SAHRA_ORG).maybeSingle(),
  ]);
  if (ruleError || bindingError || controlsError || !rule || !binding || !controls) {
    throw new Error('SAHRA_INBOUND_READINESS_UNAVAILABLE');
  }
  if (!rule.requires_approval || !controls.shadow_mode) throw new Error('GLOBAL_SAFETY_MUST_STAY_ACTIVE');
  if (binding.tenant_business_id !== SAHRA_BUSINESS || binding.provider !== 'META'
    || binding.channel !== 'WHATSAPP' || binding.status !== 'ACTIVE'
    || binding.last_error_code || !binding.provider_secret_ref
    || !binding.provider_destination_id || !binding.provider_account_id) {
    throw new Error('SAHRA_CANONICAL_META_BINDING_NOT_READY');
  }
  const current = rule.config && typeof rule.config === 'object' && !Array.isArray(rule.config)
    ? rule.config as Record<string, unknown> : {};
  const previous = current.permanentInboundReply && typeof current.permanentInboundReply === 'object'
    ? current.permanentInboundReply as Record<string, unknown> : {};
  const dailyCap = enabled ? DAILY_CAP : Number(previous.dailyCap ?? DAILY_CAP);
  let consentAuditId = typeof previous.consentAuditId === 'string' ? previous.consentAuditId : '';
  if (enabled) {
    if (controls.global_kill_switch || controls.agents_paused || controls.whatsapp_ai_paused) {
      throw new Error('SAHRA_AI_PAUSED_OR_KILLED');
    }
    // The user is explicitly approving customer-initiated replies, not
    // marketing, templates, proactive texts, unsupervised payments or bookings.
    const { data: audit, error: auditError } = await db.from('audit_logs').insert({
      organization_id: SAHRA_ORG, actor_type: 'USER', actor_id: owner.userId,
      action: 'SAHRA_INBOUND_SERVICE_OWNER_APPROVED',
      entity_type: 'communication_channel_binding', entity_id: SAHRA_BINDING,
      after_data: {
        ownerReportedConsent: true, inboundOnly: true, allowAllCustomerInitiated: true,
        noUnsolicited: true, tenantBusinessId: SAHRA_BUSINESS, channelBindingId: SAHRA_BINDING,
        senderPhoneNumberId: binding.provider_destination_id, senderWabaId: binding.provider_account_id,
        dailyCap: DAILY_CAP, textRepliesOnly: true, humanTakeoverRequired: true,
        shadowModeRemainsOn: true, globalApprovalRemainsOn: true,
      },
    }).select('id').single();
    if (auditError || !audit?.id) throw new Error('SAHRA_OWNER_CONSENT_AUDIT_FAILED');
    consentAuditId = String(audit.id);
  }
  const next = {
    ...current,
    permanentInboundReply: {
      ...previous,
      enabled, inboundOnly: true, allowAllCustomerInitiated: true,
      noUnsolicited: true, tenantBusinessId: SAHRA_BUSINESS, bindingId: SAHRA_BINDING,
      senderPhoneNumberId: binding.provider_destination_id, senderWabaId: binding.provider_account_id,
      deliveryMode: 'TEXT', dailyCap, consentAuditId,
    },
  };
  const { data: updated, error: writeError } = await db.from('approval_rules')
    .update({ config: next, updated_at: new Date().toISOString() })
    .eq('organization_id', SAHRA_ORG).eq('id', rule.id).eq('requires_approval', true)
    .select('id,config').maybeSingle();
  if (writeError || !updated?.id) throw new Error('SAHRA_INBOUND_POLICY_UPDATE_FAILED');
  const actual = updated.config && typeof updated.config === 'object'
    ? (updated.config as Record<string, unknown>).permanentInboundReply : null;
  if (!actual || typeof actual !== 'object' || (actual as Record<string, unknown>).enabled !== enabled
    || (actual as Record<string, unknown>).dailyCap !== dailyCap
    || (actual as Record<string, unknown>).consentAuditId !== consentAuditId) {
    throw new Error('SAHRA_INBOUND_POLICY_READBACK_MISMATCH');
  }
  revalidatePath('/system');
}

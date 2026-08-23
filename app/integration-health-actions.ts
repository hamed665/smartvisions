'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { Crawl4AiAuditor } from '@/lib/audit/crawl4ai';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
import { recordUsage } from '@/lib/reliability/cost-guard';
import { getCurrentOrganization } from '@/lib/supabase/org';

const TEST_URL = 'https://example.com';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for integration verification');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeMessage(value: unknown) {
  const message = value instanceof Error ? value.message : 'Integration verification failed';
  return message.replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 220);
}

function requiredEmail(formData: FormData) {
  const value = String(formData.get('test_email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('A valid test email is required');
  return value;
}

export async function verifyEmailIntegration(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/integrations';
  const startedAt = Date.now();

  try {
    const recipient = requiredEmail(formData);
    const provider = String(process.env.EMAIL_PROVIDER ?? '').trim().toUpperCase();
    const apiKeyPresent = Boolean(process.env.EMAIL_PROVIDER_API_KEY?.trim());
    if (provider !== 'RESEND' || !apiKeyPresent) throw new Error('Resend email credentials are not configured');

    const { data: mailbox, error: mailboxError } = await db
      .from('mailboxes')
      .select('id,address,enabled,daily_limit,sent_today')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', 'RESEND')
      .eq('enabled', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mailboxError) throw mailboxError;
    if (!mailbox) throw new Error('No enabled Resend mailbox is configured');
    if (Number(mailbox.sent_today ?? 0) >= Number(mailbox.daily_limit ?? 0)) throw new Error('Mailbox daily limit reached');

    const idempotencyKey = `email-provider-verification:${ctx.organizationId}:${recipient}:${new Date().toISOString().slice(0, 10)}`;
    const result = await new ResendEmailProvider().sendEmail({
      mailboxId: String(mailbox.id),
      to: recipient,
      subject: 'Smart Visions email verification',
      text: 'This is a controlled production verification email from Smart Visions Growth OS. No action is required.',
      idempotencyKey,
    });

    const checkedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;
    const { error: mailboxUpdateError } = await db.from('mailboxes').update({
      sent_today: Number(mailbox.sent_today ?? 0) + 1,
      health_status: 'VERIFYING',
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('id', mailbox.id);
    if (mailboxUpdateError) throw mailboxUpdateError;

    const { error: integrationUpdateError } = await db.from('integration_connections').update({
      enabled: false,
      status: 'NOT_CONFIGURED',
      account_label: mailbox.address,
      last_checked_at: checkedAt,
      last_error: null,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'EMAIL_PROVIDER').eq('channel', 'EMAIL');
    if (integrationUpdateError) throw integrationUpdateError;

    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'EMAIL_PROVIDER_CONTROLLED_VERIFICATION_SENT',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: {
        provider: 'RESEND',
        mailbox: mailbox.address,
        recipient_domain: recipient.split('@')[1],
        providerMessageId: result.providerMessageId,
        latencyMs,
        providerCalls: 1,
        outreachTriggered: false,
        integrationEnabled: false,
        awaitingHumanDeliveryConfirmation: true,
      },
    });
    if (auditError) throw auditError;

    await recordUsage({
      organizationId: ctx.organizationId,
      provider: 'EMAIL',
      operation: 'EMAIL_PROVIDER_VERIFICATION',
      costUsd: 0,
      units: 1,
      metadata: { provider: 'RESEND', provider_message_id: result.providerMessageId, verification_only: true },
    });

    destination = `/integrations?email=sent&latencyMs=${latencyMs}`;
  } catch (error) {
    const message = safeMessage(error);
    const checkedAt = new Date().toISOString();
    await db.from('integration_connections').update({
      enabled: false,
      status: 'NOT_CONFIGURED',
      last_checked_at: checkedAt,
      last_error: message,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'EMAIL_PROVIDER').eq('channel', 'EMAIL');
    await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'EMAIL_PROVIDER_CONTROLLED_VERIFICATION_FAILED',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: { provider: 'RESEND', error: message, outreachTriggered: false },
    });
    destination = `/integrations?email=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  redirect(destination);
}

export async function verifyCrawl4AiIntegration() {
  const ctx = await getCurrentOrganization(true);
  let destination = '/integrations';
  const baseUrl = String(process.env.CRAWL4AI_URL ?? '').trim();
  if (!baseUrl) {
    await ctx.supabase.from('integration_connections').update({ status: 'NOT_CONFIGURED', enabled: false, last_checked_at: new Date().toISOString(), last_error: 'CRAWL4AI_URL is not configured', updated_at: new Date().toISOString() }).eq('organization_id', ctx.organizationId).eq('provider', 'CRAWL4AI');
    redirect('/integrations?crawl4ai=not-configured');
  }

  const startedAt = Date.now();
  try {
    const result = await new Crawl4AiAuditor(baseUrl).audit(TEST_URL);
    const latencyMs = Date.now() - startedAt;
    const checkedAt = new Date().toISOString();
    const { error: updateError } = await ctx.supabase.from('integration_connections').update({ status: 'CONNECTED', enabled: true, last_checked_at: checkedAt, last_error: null, updated_at: checkedAt }).eq('organization_id', ctx.organizationId).eq('provider', 'CRAWL4AI');
    if (updateError) throw updateError;
    const { error: auditError } = await ctx.supabase.from('audit_logs').insert({ organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId, action: 'CRAWL4AI_CONTROLLED_SMOKE_TEST', entity_type: 'integration', entity_id: ctx.organizationId, after_data: { provider: 'CRAWL4AI', testUrl: TEST_URL, latencyMs, titleReturned: Boolean(result.title), providerCalls: 1, llmCalls: 0, outreachTriggered: false } });
    if (auditError) throw auditError;
    destination = `/integrations?crawl4ai=success&latencyMs=${latencyMs}`;
  } catch (error) {
    const message = safeMessage(error);
    const checkedAt = new Date().toISOString();
    await ctx.supabase.from('integration_connections').update({ status: 'ERROR', enabled: false, last_checked_at: checkedAt, last_error: message, updated_at: checkedAt }).eq('organization_id', ctx.organizationId).eq('provider', 'CRAWL4AI');
    await ctx.supabase.from('audit_logs').insert({ organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId, action: 'CRAWL4AI_CONTROLLED_SMOKE_TEST_FAILED', entity_type: 'integration', entity_id: ctx.organizationId, after_data: { provider: 'CRAWL4AI', error: message, providerCalls: 1, outreachTriggered: false } });
    destination = `/integrations?crawl4ai=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  redirect(destination);
}

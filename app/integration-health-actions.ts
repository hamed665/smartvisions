'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { Crawl4AiAuditor } from '@/lib/audit/crawl4ai';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
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

export async function verifyEmailIntegration() {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/integrations';
  try {
    const provider = String(process.env.EMAIL_PROVIDER ?? '').trim().toUpperCase();
    if (provider !== 'RESEND' || !process.env.EMAIL_PROVIDER_API_KEY?.trim()) {
      throw new Error('Resend email credentials are not configured');
    }
    const { data: mailbox, error } = await db.from('mailboxes')
      .select('id,daily_limit').eq('organization_id', ctx.organizationId)
      .eq('provider', 'RESEND').eq('enabled', true).order('created_at', { ascending: true })
      .limit(1).maybeSingle();
    if (error) throw error;
    if (!mailbox) throw new Error('No enabled Resend mailbox is configured');
    const usage = await countMailboxSendsLast24Hours({ supabase: db, organizationId: ctx.organizationId, mailboxId: mailbox.id });
    const { data: evidence, error: evidenceError } = await db.from('email_events')
      .select('event_type,created_at').eq('organization_id', ctx.organizationId)
      .in('event_type', ['email.sent', 'email.delivered'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (evidenceError) throw evidenceError;
    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId,
      action: 'EMAIL_PROVIDER_EVIDENCE_CHECKED', entity_type: 'integration', entity_id: ctx.organizationId,
      after_data: { provider: 'RESEND', quotaUsedLast24Hours: usage, dailyLimit: mailbox.daily_limit,
        latestEvidenceAt: evidence?.created_at ?? null, latestEvidenceType: evidence?.event_type ?? null,
        providerCalls: 0, outreachTriggered: false, liveConnectivityTested: false },
    });
    if (auditError) throw auditError;
    // A local evidence read must never refresh the date of a real provider verification.
    const message = evidence
      ? `Configuration present; quota used in 24h: ${usage}/${mailbox.daily_limit}. Latest provider evidence: ${evidence.created_at}. No email sent.`
      : 'Configuration present; no sent/delivered evidence yet. Use the approved conversation send flow for a controlled delivery test.';
    destination = `/integrations?email=checked&detail=${encodeURIComponent(message)}`;
  } catch (error) {
    destination = `/integrations?email=error&message=${encodeURIComponent(safeMessage(error))}`;
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

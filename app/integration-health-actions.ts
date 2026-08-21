'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Crawl4AiAuditor } from '@/lib/audit/crawl4ai';
import { getCurrentOrganization } from '@/lib/supabase/org';

const TEST_URL = 'https://example.com';

function safeMessage(value: unknown) {
  const message = value instanceof Error ? value.message : 'Integration verification failed';
  return message.replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 220);
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

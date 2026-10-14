import { processPendingWhatsAppChatwootSync } from './chatwoot-inbound-sync';
import { processPendingChatwootInboxEvents } from '@/lib/chatwoot/unified-inbox-reconciler';
import { createClient } from '@supabase/supabase-js';
import { stableAgentRequestKey } from '@/lib/operations/executor-core';
import { runInternalTestLiveReply } from './internal-test-live-reply';
import { runSahraFastWindow, SAHRA_FAST_SCOPE, SAHRA_FRESH_INBOUND_MS, type FastInboundCandidate } from './sahra-fast-inbound-core';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function runSahraFastInbound(env: { DEPLOYMENT_ENV?: string; INTERNAL_API_KEY?: string }, scheduledTime?: number) {
  if (env.DEPLOYMENT_ENV !== 'production' || !env.INTERNAL_API_KEY) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('FAST_INBOUND_RUNTIME_UNAVAILABLE');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const startedAt = Date.now();
  const metrics = await runSahraFastWindow(env.DEPLOYMENT_ENV, scheduledTime, {
    now: Date.now,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    async scan() {
      const [rule, controls] = await Promise.all([
        supabase.from('approval_rules').select('requires_approval,config')
          .eq('organization_id', SAHRA_FAST_SCOPE.organizationId).eq('action_key', 'WHATSAPP_OUTBOUND').maybeSingle(),
        supabase.from('system_controls').select('shadow_mode,global_kill_switch,whatsapp_ai_paused,agents_paused')
          .eq('organization_id', SAHRA_FAST_SCOPE.organizationId).maybeSingle(),
      ]);
      if (rule.error || controls.error) throw new Error('FAST_INBOUND_POLICY_READ_FAILED');
      const policy = record(record(rule.data?.config).permanentInboundReply);
      const safe = controls.data;
      if (rule.data?.requires_approval !== true || policy.enabled !== true
        || policy.tenantBusinessId !== SAHRA_FAST_SCOPE.tenantBusinessId
        || policy.bindingId !== SAHRA_FAST_SCOPE.bindingId || policy.inboundOnly !== true
        || policy.noUnsolicited !== true || safe?.shadow_mode !== true
        || safe.global_kill_switch !== false || safe.whatsapp_ai_paused !== false || safe.agents_paused !== false) {
        return { active: false, candidates: [] };
      }
      const now = new Date();
      const inbound = await supabase.from('outreach_messages')
        .select('id,organization_id,provider_message_id,received_at,metadata')
        .eq('organization_id', SAHRA_FAST_SCOPE.organizationId)
        .eq('channel', 'WHATSAPP').eq('direction', 'INBOUND')
        .eq('metadata->>tenant_business_id', SAHRA_FAST_SCOPE.tenantBusinessId)
        .eq('metadata->>communication_channel_binding_id', SAHRA_FAST_SCOPE.bindingId)
        .gte('received_at', new Date(now.getTime() - SAHRA_FRESH_INBOUND_MS).toISOString())
        .lte('received_at', now.toISOString()).order('received_at', { ascending: false }).limit(10);
      if (inbound.error) throw new Error('FAST_INBOUND_READ_FAILED');
      const rows = (inbound.data ?? []).map((row) => ({ ...row, metadata: record(row.metadata) })) as FastInboundCandidate[];
      if (!rows.length) return { active: true, candidates: [] };
      // Prepare the existing signed journal/projection before admission. Customer
      // first messages must not depend on two separate full-operation ticks.
      const inbox = await supabase.from('chatwoot_inbox_mappings').select('id')
        .eq('organization_id', SAHRA_FAST_SCOPE.organizationId)
        .eq('tenant_business_id', SAHRA_FAST_SCOPE.tenantBusinessId)
        .eq('communication_channel_binding_id', SAHRA_FAST_SCOPE.bindingId)
        .eq('status', 'ACTIVE').maybeSingle();
      if (inbox.error || !inbox.data?.id) throw new Error('FAST_INBOUND_INBOX_UNAVAILABLE');
      const receivedAfter = new Date(now.getTime() - SAHRA_FRESH_INBOUND_MS).toISOString();
      await processPendingWhatsAppChatwootSync({
        service: supabase, organizationId: SAHRA_FAST_SCOPE.organizationId,
        bindingId: SAHRA_FAST_SCOPE.bindingId, receivedAfter, inboundOnly: true, limit: 2,
      });
      await processPendingChatwootInboxEvents({
        supabase, limit: 10, scope: {
          organizationId: SAHRA_FAST_SCOPE.organizationId,
          tenantBusinessId: SAHRA_FAST_SCOPE.tenantBusinessId,
          inboxMappingId: String(inbox.data.id), receivedAfter,
        },
      });
      const [runs, claims] = await Promise.all([
        supabase.from('agent_runs').select('request_key')
          .eq('organization_id', SAHRA_FAST_SCOPE.organizationId)
          .in('request_key', rows.map((row) => stableAgentRequestKey('WHATSAPP', row.provider_message_id))),
        supabase.from('audit_logs').select('entity_id')
          .eq('organization_id', SAHRA_FAST_SCOPE.organizationId)
          .eq('action', 'WHATSAPP_INBOUND_SERVICE_CLAIMED').eq('entity_type', 'outreach_message')
          .in('entity_id', rows.map((row) => row.id)),
      ]);
      if (runs.error || claims.error) throw new Error('FAST_INBOUND_CLAIM_READ_FAILED');
      const runKeys = new Set((runs.data ?? []).map((row) => row.request_key));
      const claimedIds = new Set((claims.data ?? []).map((row) => row.entity_id));
      return {
        active: true,
        candidates: rows.filter((row) => !claimedIds.has(row.id)
          && !runKeys.has(stableAgentRequestKey('WHATSAPP', row.provider_message_id))),
      };
    },
    run: (row) => runInternalTestLiveReply({
      organizationId: row.organization_id, providerMessageId: row.provider_message_id,
      messageType: String(row.metadata.type),
    }),
  });
  console.info('SAHRA_FAST_INBOUND_WINDOW', JSON.stringify({ scheduledTime, durationMs: Date.now() - startedAt, ...metrics }));
  // Sample idle runtime evidence every five minutes; attempted/error outcomes
  // are always visible. This is observability, never claim/send authority.
  if (metrics.attempted || metrics.failed || metrics.deferred || (scheduledTime != null && Math.floor(scheduledTime / 60_000) % 5 === 0)) {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        organization_id: SAHRA_FAST_SCOPE.organizationId,
        actor_type: 'SYSTEM', actor_id: 'sahra_fast_inbound_scheduler',
        action: 'SAHRA_FAST_INBOUND_WINDOW', entity_type: 'communication_channel_binding',
        entity_id: SAHRA_FAST_SCOPE.bindingId,
        after_data: { scheduledTime, startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
          intervalMs: 30_000, permanentInbound: true, ...metrics },
      });
      if (error) console.error('SAHRA_FAST_INBOUND_AUDIT_FAILED');
    } catch { /* Observability must never retry paid work. */ }
  }
  return metrics;
}

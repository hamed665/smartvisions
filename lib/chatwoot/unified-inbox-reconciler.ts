import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  parseChatwootUnifiedInboxEvent,
  type ChatwootWebhookJournalEvent,
} from '@/lib/chatwoot/unified-inbox-event';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type ReconcileRpcRow = {
  outcome: 'CREATED' | 'UPDATED' | 'NOOP' | 'STALE_IGNORED';
  projection_id: string;
  projection_version: number;
  event_status: 'PROCESSED' | 'IGNORED';
};

function oneRow(value: unknown): ReconcileRpcRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const candidate = row as Record<string, unknown>;
  if (
    !['CREATED','UPDATED','NOOP','STALE_IGNORED'].includes(String(candidate.outcome)) ||
    typeof candidate.projection_id !== 'string' ||
    !Number.isInteger(Number(candidate.projection_version)) ||
    !['PROCESSED','IGNORED'].includes(String(candidate.event_status))
  ) return null;
  return candidate as unknown as ReconcileRpcRow;
}

async function finalizeEvent(
  supabase: SupabaseClient,
  eventId: string,
  status: 'IGNORED' | 'FAILED',
  errorCode: string,
) {
  const result = await supabase.rpc('finalize_chatwoot_webhook_event', {
    p_event_id: eventId,
    p_status: status,
    p_error_code: errorCode,
  });
  if (result.error) throw new Error('Chatwoot webhook finalization failed');
}

export async function reconcileChatwootWebhookEvent(
  supabase: SupabaseClient,
  event: ChatwootWebhookJournalEvent,
) {
  const decision = parseChatwootUnifiedInboxEvent(event);

  if (decision.kind === 'IGNORE') {
    await finalizeEvent(supabase, event.id, 'IGNORED', decision.code);
    return { action: 'IGNORED' as const, code: decision.code };
  }

  if (decision.kind === 'FAIL') {
    await finalizeEvent(supabase, event.id, 'FAILED', decision.code);
    return { action: 'FAILED' as const, code: decision.code };
  }

  const snapshot = decision.snapshot;
  const result = await supabase.rpc('reconcile_unified_inbox_projection_event', {
    p_event_id: snapshot.eventId,
    p_conversation_id: snapshot.conversationId,
    p_chatwoot_conversation_display_id: snapshot.chatwootConversationDisplayId,
    p_chatwoot_contact_id: snapshot.chatwootContactId,
    p_chatwoot_assignee_user_id: snapshot.chatwootAssigneeUserId,
    p_chatwoot_team_id: snapshot.chatwootTeamId,
    p_chatwoot_status: snapshot.chatwootStatus,
    p_labels: snapshot.labels,
    p_last_activity_at: snapshot.lastActivityAt,
    p_chatwoot_updated_at: snapshot.chatwootUpdatedAt,
  });

  if (result.error) {
    try {
      await finalizeEvent(supabase, event.id, 'FAILED', 'RECONCILIATION_FAILED');
    } catch {
      // Journal evidence remains authoritative if finalization also fails.
    }
    return { action: 'FAILED' as const, code: 'RECONCILIATION_FAILED' as const };
  }

  const row = oneRow(result.data);
  if (!row) {
    try {
      await finalizeEvent(supabase, event.id, 'FAILED', 'INVALID_RECONCILIATION_RESULT');
    } catch {
      // Preserve journal evidence for operator recovery.
    }
    return { action: 'FAILED' as const, code: 'INVALID_RECONCILIATION_RESULT' as const };
  }

  return {
    action: row.outcome,
    projectionId: row.projection_id,
    projectionVersion: row.projection_version,
  };
}

export async function processPendingChatwootInboxEvents(input?: {
  limit?: number;
  supabase?: SupabaseClient;
}) {
  const supabase = input?.supabase ?? createSupabaseServiceClient();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(input?.limit ?? DEFAULT_LIMIT)));

  const pending = await supabase
    .from('chatwoot_webhook_events')
    .select('id,event_type,payload,status,received_at')
    .eq('status', 'RECEIVED')
    .order('received_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (pending.error) throw new Error('Chatwoot webhook journal discovery failed');

  const events = (pending.data ?? []) as ChatwootWebhookJournalEvent[];
  const summary = { discovered: events.length, processed: 0, ignored: 0, failed: 0 };

  for (const event of events) {
    try {
      const result = await reconcileChatwootWebhookEvent(supabase, event);
      if (result.action === 'IGNORED' || result.action === 'STALE_IGNORED') {
        summary.ignored += 1;
      } else if (result.action === 'FAILED') {
        summary.failed += 1;
      } else {
        summary.processed += 1;
      }
    } catch {
      // No second queue: a transient failure leaves the durable journal for a later pass.
      summary.failed += 1;
    }
  }

  return summary;
}

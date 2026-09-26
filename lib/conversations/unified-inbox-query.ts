import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Z0-9_:-]{1,40}$/;

export type UnifiedInboxCursor = {
  activityAt: string;
  conversationId: string;
};

export type UnifiedInboxQuery = {
  limit: number;
  stage: string | null;
  channel: string | null;
  humanOnly: boolean;
  unreadOnly: boolean;
  query: string | null;
  branchId: string | null;
  teamId: string | null;
  label: string | null;
  chatwootStatus: string | null;
  cursor: UnifiedInboxCursor | null;
};

export type UnifiedInboxRow = {
  conversation_id: string;
  lead_id: string | null;
  customer_name: string | null;
  channel: string;
  stage: string;
  priority: number;
  unread_count: number;
  requires_human: boolean;
  agent_mode: string | null;
  detected_language: string | null;
  detected_dialect: string | null;
  persian_summary: string | null;
  intent_label: string | null;
  sentiment_label: string | null;
  stage_reason: string | null;
  activity_at: string;
  tenant_business_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  team_id: string | null;
  chatwoot_status: string | null;
  labels: string[];
  chatwoot_assignee_user_id: number | null;
  last_read_at: string | null;
};

export type UnifiedInboxCounters = {
  total: number;
  unread: number;
  human: number;
  stages: Record<string, number>;
};

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid inbox cursor');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isCanonicalUuid(value: string) {
  return UUID_RE.test(value);
}

export function encodeUnifiedInboxCursor(cursor: UnifiedInboxCursor) {
  if (!isCanonicalUuid(cursor.conversationId) || !Number.isFinite(Date.parse(cursor.activityAt))) {
    throw new Error('Invalid inbox cursor payload');
  }
  return base64UrlEncode(JSON.stringify({ a: cursor.activityAt, c: cursor.conversationId }));
}

export function decodeUnifiedInboxCursor(value: string | null | undefined): UnifiedInboxCursor | null {
  const raw = value?.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(raw));
  } catch {
    throw new Error('Invalid inbox cursor');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid inbox cursor');
  const row = parsed as Record<string, unknown>;
  const activityAt = typeof row.a === 'string' ? row.a : '';
  const conversationId = typeof row.c === 'string' ? row.c : '';
  if (!Number.isFinite(Date.parse(activityAt)) || !isCanonicalUuid(conversationId)) {
    throw new Error('Invalid inbox cursor');
  }
  return { activityAt: new Date(activityAt).toISOString(), conversationId };
}

function optionalUuid(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim() ?? '';
  if (!value) return null;
  if (!isCanonicalUuid(value)) throw new Error(`Invalid ${key} filter`);
  return value;
}

function optionalToken(params: URLSearchParams, key: string, lower = false) {
  const value = params.get(key)?.trim() ?? '';
  if (!value) return null;
  const normalized = lower ? value.toLowerCase() : value.toUpperCase();
  const validation = lower ? normalized.toUpperCase() : normalized;
  if (!TOKEN_RE.test(validation)) throw new Error(`Invalid ${key} filter`);
  return normalized;
}

export function parseUnifiedInboxQuery(params: URLSearchParams): UnifiedInboxQuery {
  const rawLimit = params.get('limit')?.trim();
  const limit = rawLimit ? Number(rawLimit) : 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid inbox page limit');

  const query = params.get('q')?.trim() ?? '';
  if (query.length > 100) throw new Error('Inbox search is too long');

  const label = params.get('label')?.trim() ?? '';
  if (label.length > 120) throw new Error('Inbox label filter is too long');

  return {
    limit,
    stage: optionalToken(params, 'stage'),
    channel: optionalToken(params, 'channel'),
    humanOnly: ['1', 'true'].includes((params.get('human') ?? '').toLowerCase()),
    unreadOnly: ['1', 'true'].includes((params.get('unread') ?? '').toLowerCase()),
    query: query || null,
    branchId: optionalUuid(params, 'branch'),
    teamId: optionalUuid(params, 'team'),
    label: label || null,
    chatwootStatus: optionalToken(params, 'chatwootStatus', true),
    cursor: decodeUnifiedInboxCursor(params.get('cursor')),
  };
}

function normalizeCounters(value: unknown): UnifiedInboxCounters {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const stagesRaw = row.stages && typeof row.stages === 'object' && !Array.isArray(row.stages)
    ? row.stages as Record<string, unknown>
    : {};
  return {
    total: Math.max(0, Number(row.total ?? 0)),
    unread: Math.max(0, Number(row.unread ?? 0)),
    human: Math.max(0, Number(row.human ?? 0)),
    stages: Object.fromEntries(
      Object.entries(stagesRaw).map(([key, count]) => [key, Math.max(0, Number(count ?? 0))]),
    ),
  };
}

export async function loadUnifiedInboxPage(input: {
  supabase: SupabaseClient;
  organizationId: string;
  query: UnifiedInboxQuery;
}) {
  const rpcArgs = {
    p_organization_id: input.organizationId,
    p_limit: input.query.limit,
    p_before_activity: input.query.cursor?.activityAt ?? null,
    p_before_conversation_id: input.query.cursor?.conversationId ?? null,
    p_stage: input.query.stage,
    p_channel: input.query.channel,
    p_requires_human: input.query.humanOnly ? true : null,
    p_unread_only: input.query.unreadOnly,
    p_query: input.query.query,
    p_branch_id: input.query.branchId,
    p_team_id: input.query.teamId,
    p_label: input.query.label,
    p_chatwoot_status: input.query.chatwootStatus,
  };

  const [pageResult, countersResult] = await Promise.all([
    input.supabase.rpc('list_unified_inbox_conversations', rpcArgs),
    input.supabase.rpc('get_unified_inbox_counters', {
      p_organization_id: input.organizationId,
    }),
  ]);

  if (pageResult.error) throw new Error(`Unified Inbox query failed: ${pageResult.error.message}`);
  if (countersResult.error) throw new Error(`Unified Inbox counters failed: ${countersResult.error.message}`);

  const page = (pageResult.data ?? []) as UnifiedInboxRow[];
  const hasMore = page.length > input.query.limit;
  const items = page.slice(0, input.query.limit);
  const last = hasMore ? items.at(-1) : null;
  const nextCursor = last
    ? encodeUnifiedInboxCursor({
      activityAt: last.activity_at,
      conversationId: last.conversation_id,
    })
    : null;

  return {
    items,
    hasMore,
    nextCursor,
    counters: normalizeCounters(countersResult.data),
  };
}

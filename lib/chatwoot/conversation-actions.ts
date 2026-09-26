import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateChatwootProvisioningActivation } from '@/lib/chatwoot/activation-contract';
import {
  ChatwootHttpError,
  chatwootAccountProvisioningRequest,
  chatwootPlatformProvisioningRequest,
} from '@/lib/chatwoot/http';
import { normalizeChatwootAccessToken } from '@/lib/chatwoot/http-contract';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
} from '@/lib/chatwoot/tenant-bridge-slice-b';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9:_-]{8,140}$/;
const ALLOWED_STATUSES = new Set(['open', 'resolved', 'pending', 'snoozed']);
const MAX_LABELS = 50;
const MAX_LABEL_LENGTH = 120;
const MAX_INTERNAL_NOTE_LENGTH = 10_000;
const MANAGE_ROLES = new Set(['OWNER', 'ADMIN', 'SALES_MANAGER']);
const ASSIGNEE_ROLES = new Set([
  'OWNER',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
]);

export type UnifiedInboxConversationAction =
  | {
      action: 'STATUS';
      status: 'open' | 'resolved' | 'pending' | 'snoozed';
      snoozedUntil: number | null;
    }
  | {
      action: 'LABELS';
      labels: string[];
    }
  | {
      action: 'ASSIGNEE';
      smartUserId: string | null;
    }
  | {
      action: 'TEAM';
      teamId: string | null;
    };

export type UnifiedInboxConversationActionInput = {
  conversationId: string;
  requestId: string;
  action: UnifiedInboxConversationAction;
};

export type UnifiedInboxInternalNoteInput = {
  conversationId: string;
  requestId: string;
  content: string;
};

export type UnifiedInboxConversationActionOptions = {
  statuses: Array<'open' | 'resolved' | 'pending' | 'snoozed'>;
  current: {
    status: string | null;
    snoozedUntil: number | null;
    labels: string[];
    smartUserId: string | null;
    teamId: string | null;
  };
  labels: string[];
  assignees: Array<{
    smartUserId: string;
    name: string;
    availabilityStatus: string | null;
  }>;
  teams: Array<{
    teamId: string;
    name: string;
  }>;
  notes: Array<{
    id: number;
    content: string;
    createdAt: number;
    senderName: string | null;
  }>;
};

export type UnifiedInboxActionErrorCode =
  | 'INVALID_INPUT'
  | 'FORBIDDEN'
  | 'NOT_READY'
  | 'ACTIVATION_BLOCKED'
  | 'RECONCILIATION_REQUIRED'
  | 'UPSTREAM_FAILED';

export class UnifiedInboxActionError extends Error {
  code: UnifiedInboxActionErrorCode;

  constructor(code: UnifiedInboxActionErrorCode, message: string) {
    super(message);
    this.name = 'UnifiedInboxActionError';
    this.code = code;
  }
}

type ProjectionRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  brand_id: string;
  tenant_business_id: string;
  branch_id: string;
  department_id: string | null;
  team_id: string | null;
  chatwoot_conversation_display_id: number;
  lifecycle_status: 'ACTIVE' | 'DEGRADED';
  version: number;
};

type ActionClaim = {
  is_new: boolean;
  projection_id: string;
  claimed_projection_version: number;
  current_projection_version: number;
  brand_id: string;
  tenant_business_id: string;
  branch_id: string;
  department_id: string | null;
  team_id: string | null;
  chatwoot_conversation_display_id: number;
};

type AdminProxy = {
  accountId: number;
  token: string;
  accountMappingId: string;
};

type ExternalConversationState = {
  status: string | null;
  snoozedUntil: number | null;
  labels: string[];
  assigneeId: number | null;
  teamId: string | null;
};

type ExternalTarget =
  | { kind: 'STATUS'; status: string; snoozedUntil: number | null }
  | { kind: 'LABELS'; labels: string[] }
  | { kind: 'ASSIGNEE'; chatwootUserId: number | null; smartUserId: string | null }
  | { kind: 'TEAM'; chatwootTeamId: string | null; teamId: string | null };

function fail(code: UnifiedInboxActionErrorCode, message: string): never {
  throw new UnifiedInboxActionError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalUuid(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : null;
}

function canonicalRequestId(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return REQUEST_ID_RE.test(normalized) ? normalized : null;
}

function canonicalLabels(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_LABELS) return null;

  const labels: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const label = item.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) return null;
    labels.push(label);
  }

  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

function chatwootRows(value: unknown) {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];
  if (Array.isArray(value.payload)) return value.payload.filter(isObject);
  return [];
}

function labelCatalog(value: unknown) {
  return [...new Set(
    chatwootRows(value)
      .map((row) => typeof row.title === 'string' ? row.title.trim() : '')
      .filter((label) => label.length > 0 && label.length <= MAX_LABEL_LENGTH),
  )].sort((a, b) => a.localeCompare(b));
}

function agentCatalog(value: unknown) {
  return chatwootRows(value)
    .map((row) => {
      const id = normalizeChatwootInt32Id(row.id);
      const name = typeof row.name === 'string' && row.name.trim()
        ? row.name.trim()
        : typeof row.available_name === 'string' && row.available_name.trim()
          ? row.available_name.trim()
          : null;
      const availabilityStatus = typeof row.availability_status === 'string'
        ? row.availability_status.trim()
        : null;
      return id === null || !name ? null : { id, name, availabilityStatus };
    })
    .filter((row): row is { id: number; name: string; availabilityStatus: string | null } => Boolean(row));
}


function privateNoteCatalog(value: unknown) {
  return chatwootRows(value)
    .map((row) => {
      const id = normalizeChatwootInt32Id(row.id);
      const conversationId = normalizeChatwootInt32Id(row.conversation_id);
      const content = typeof row.content === 'string' ? row.content : null;
      const createdAt = Number(row.created_at);
      const sender = isObject(row.sender) ? row.sender : null;
      const senderName = sender && typeof sender.name === 'string' && sender.name.trim()
        ? sender.name.trim()
        : null;
      if (
        id === null
        || conversationId === null
        || row.private !== true
        || content === null
        || !Number.isFinite(createdAt)
        || createdAt <= 0
      ) {
        return null;
      }
      return {
        id,
        conversationId,
        content,
        createdAt,
        senderName,
        contentAttributes: isObject(row.content_attributes) ? row.content_attributes : {},
      };
    })
    .filter((row): row is {
      id: number;
      conversationId: number;
      content: string;
      createdAt: number;
      senderName: string | null;
      contentAttributes: Record<string, unknown>;
    } => Boolean(row));
}

export function parseUnifiedInboxConversationActionBody(
  conversationId: string,
  value: unknown,
): UnifiedInboxConversationActionInput {
  const normalizedConversationId = canonicalUuid(conversationId);
  const body = isObject(value) ? value : null;
  const requestId = canonicalRequestId(body?.requestId);
  const action = typeof body?.action === 'string'
    ? body.action.trim().toUpperCase()
    : '';

  if (!normalizedConversationId || !body || !requestId) {
    return fail('INVALID_INPUT', 'Invalid Unified Inbox action payload');
  }

  if (action === 'STATUS') {
    const status = typeof body.status === 'string'
      ? body.status.trim().toLowerCase()
      : '';
    const snoozedUntil = body.snoozedUntil === undefined || body.snoozedUntil === null
      ? null
      : Number(body.snoozedUntil);

    if (
      !ALLOWED_STATUSES.has(status)
      || (snoozedUntil !== null && (
        !Number.isSafeInteger(snoozedUntil)
        || snoozedUntil <= 0
      ))
      || (status !== 'snoozed' && snoozedUntil !== null)
    ) {
      return fail('INVALID_INPUT', 'Invalid Unified Inbox status action');
    }

    return {
      conversationId: normalizedConversationId,
      requestId,
      action: {
        action: 'STATUS',
        status: status as 'open' | 'resolved' | 'pending' | 'snoozed',
        snoozedUntil,
      },
    };
  }

  if (action === 'LABELS') {
    const labels = canonicalLabels(body.labels);
    if (!labels) return fail('INVALID_INPUT', 'Invalid Unified Inbox label action');
    return {
      conversationId: normalizedConversationId,
      requestId,
      action: { action: 'LABELS', labels },
    };
  }

  if (action === 'ASSIGNEE') {
    const smartUserId = body.smartUserId === null
      ? null
      : canonicalUuid(body.smartUserId);
    if (body.smartUserId !== null && !smartUserId) {
      return fail('INVALID_INPUT', 'Invalid Unified Inbox assignee action');
    }
    return {
      conversationId: normalizedConversationId,
      requestId,
      action: { action: 'ASSIGNEE', smartUserId },
    };
  }

  if (action === 'TEAM') {
    const teamId = body.teamId === null ? null : canonicalUuid(body.teamId);
    if (body.teamId !== null && !teamId) {
      return fail('INVALID_INPUT', 'Invalid Unified Inbox team action');
    }
    return {
      conversationId: normalizedConversationId,
      requestId,
      action: { action: 'TEAM', teamId },
    };
  }

  return fail('INVALID_INPUT', 'Unsupported Unified Inbox action');
}


export function parseUnifiedInboxInternalNoteBody(
  conversationId: string,
  value: unknown,
): UnifiedInboxInternalNoteInput {
  const normalizedConversationId = canonicalUuid(conversationId);
  const body = isObject(value) ? value : null;
  const requestId = canonicalRequestId(body?.requestId);
  const action = typeof body?.action === 'string'
    ? body.action.trim().toUpperCase()
    : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (
    !normalizedConversationId
    || !body
    || !requestId
    || action !== 'INTERNAL_NOTE'
    || content.length < 1
    || content.length > MAX_INTERNAL_NOTE_LENGTH
  ) {
    return fail('INVALID_INPUT', 'Invalid Unified Inbox internal note payload');
  }

  return {
    conversationId: normalizedConversationId,
    requestId,
    content,
  };
}

function activationReady() {
  const activation = evaluateChatwootProvisioningActivation({
    deploymentEnvironment: process.env.DEPLOYMENT_ENV,
    provisioningEnabled: process.env.CHATWOOT_PROVISIONING_ENABLED,
    baseUrl: process.env.CHATWOOT_BASE_URL,
    platformToken: process.env.CHATWOOT_PLATFORM_TOKEN,
  });

  if (!activation.ready) {
    fail(
      'ACTIVATION_BLOCKED',
      `Chatwoot action bridge is not activated: ${activation.blockers.join(', ')}`,
    );
  }
}

function oneClaim(value: unknown): ActionClaim {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isObject(row)) {
    return fail('UPSTREAM_FAILED', 'Unified Inbox action claim response is invalid');
  }

  const displayId = normalizeChatwootInt32Id(row.chatwoot_conversation_display_id);
  if (
    typeof row.is_new !== 'boolean'
    || !canonicalUuid(row.projection_id)
    || !Number.isInteger(Number(row.claimed_projection_version))
    || Number(row.claimed_projection_version) < 1
    || !Number.isInteger(Number(row.current_projection_version))
    || Number(row.current_projection_version) < 1
    || !canonicalUuid(row.brand_id)
    || !canonicalUuid(row.tenant_business_id)
    || !canonicalUuid(row.branch_id)
    || (row.department_id !== null && !canonicalUuid(row.department_id))
    || (row.team_id !== null && !canonicalUuid(row.team_id))
    || displayId === null
  ) {
    return fail('UPSTREAM_FAILED', 'Unified Inbox action claim response is incomplete');
  }

  return {
    is_new: row.is_new,
    projection_id: String(row.projection_id),
    claimed_projection_version: Number(row.claimed_projection_version),
    current_projection_version: Number(row.current_projection_version),
    brand_id: String(row.brand_id),
    tenant_business_id: String(row.tenant_business_id),
    branch_id: String(row.branch_id),
    department_id: row.department_id === null ? null : String(row.department_id),
    team_id: row.team_id === null ? null : String(row.team_id),
    chatwoot_conversation_display_id: displayId,
  };
}

async function loadManageableProjection(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
}) {
  const projection = await input.supabase
    .from('unified_inbox_conversation_projections')
    .select(
      'id,organization_id,conversation_id,brand_id,tenant_business_id,branch_id,department_id,team_id,chatwoot_conversation_display_id,lifecycle_status,version',
    )
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .in('lifecycle_status', ['ACTIVE', 'DEGRADED'])
    .maybeSingle();

  if (projection.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox projection lookup failed');
  }
  if (!projection.data) {
    fail('NOT_READY', 'Conversation has no active Unified Inbox projection');
  }

  const data = projection.data as ProjectionRow;
  const manageable = await input.supabase.rpc('can_manage_unified_inbox_projection', {
    p_organization_id: input.organizationId,
    p_projection_id: data.id,
  });
  if (manageable.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox action authorization lookup failed');
  }
  if (manageable.data !== true) {
    fail('FORBIDDEN', 'Unified Inbox action is not permitted for this scope');
  }

  return data;
}

async function issueAdminProxy(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  fetchImpl?: typeof fetch;
}): Promise<AdminProxy> {
  const account = await input.service
    .from('chatwoot_account_mappings')
    .select('id,chatwoot_account_id,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  const accountId = normalizeChatwootInt32Id(account.data?.chatwoot_account_id);
  if (account.error || !account.data || accountId === null) {
    fail('NOT_READY', 'ACTIVE Chatwoot Account projection is required');
  }

  const memberships = await input.service
    .from('chatwoot_account_memberships')
    .select('smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('effective_smart_role', 'OWNER')
    .eq('chatwoot_role', 'administrator')
    .eq('status', 'ACTIVE')
    .limit(2);

  if (
    memberships.error
    || !Array.isArray(memberships.data)
    || memberships.data.length !== 1
    || memberships.data[0].chatwoot_account_mapping_id !== account.data.id
  ) {
    fail('NOT_READY', 'Exactly one ACTIVE owner Chatwoot administrator projection is required');
  }

  const membership = memberships.data[0];
  const userMapping = await input.service
    .from('chatwoot_user_mappings')
    .select('id,smart_user_id,chatwoot_user_id,status')
    .eq('id', membership.chatwoot_user_mapping_id)
    .eq('smart_user_id', membership.smart_user_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  const chatwootUserId = normalizeChatwootInt32Id(userMapping.data?.chatwoot_user_id);
  if (
    userMapping.error
    || !userMapping.data
    || userMapping.data.id !== membership.chatwoot_user_mapping_id
    || chatwootUserId === null
  ) {
    fail('NOT_READY', 'ACTIVE owner Chatwoot User projection is required');
  }

  const raw = await chatwootPlatformProvisioningRequest<unknown>({
    path: `/platform/api/v1/users/${chatwootUserId}/token`,
    method: 'POST',
    fetchImpl: input.fetchImpl,
  });
  if (!isObject(raw)) {
    fail('UPSTREAM_FAILED', 'Chatwoot temporary administrator token response is invalid');
  }

  const token = normalizeChatwootAccessToken(raw.access_token);
  const returnedUser = isObject(raw.user)
    ? normalizeChatwootInt32Id(raw.user.id)
    : null;
  if (!token || returnedUser !== chatwootUserId) {
    fail('UPSTREAM_FAILED', 'Chatwoot temporary administrator token did not match projection');
  }

  return {
    accountId,
    token,
    accountMappingId: account.data.id,
  };
}

async function accountRequest<T>(input: {
  proxy: AdminProxy;
  resourcePath: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  fetchImpl?: typeof fetch;
}) {
  return chatwootAccountProvisioningRequest<T>({
    path: `/api/v1/accounts/${input.proxy.accountId}${input.resourcePath}`,
    accessToken: input.proxy.token,
    method: input.method,
    body: input.body,
    fetchImpl: input.fetchImpl,
  });
}

function applicableAssignment(row: Record<string, unknown>, projection: ProjectionRow) {
  const type = String(row.scope_type ?? '');
  const id = type === 'TEAM'
    ? row.team_id
    : type === 'DEPARTMENT'
      ? row.department_id
      : type === 'BRANCH'
        ? row.branch_id
        : type === 'BUSINESS'
          ? row.tenant_business_id
          : type === 'BRAND'
            ? row.brand_id
            : null;
  const targetId = type === 'TEAM'
    ? projection.team_id
    : type === 'DEPARTMENT'
      ? projection.department_id
      : type === 'BRANCH'
        ? projection.branch_id
        : type === 'BUSINESS'
          ? projection.tenant_business_id
          : type === 'BRAND'
            ? projection.brand_id
            : null;

  return Boolean(id && targetId && id === targetId);
}

function assignmentRank(value: unknown) {
  const type = String(value ?? '');
  return type === 'TEAM'
    ? 5
    : type === 'DEPARTMENT'
      ? 4
      : type === 'BRANCH'
        ? 3
        : type === 'BUSINESS'
          ? 2
          : type === 'BRAND'
            ? 1
            : 0;
}

async function targetEffectiveRole(input: {
  service: SupabaseClient;
  organizationId: string;
  userId: string;
  projection: ProjectionRow;
}) {
  const [member, assignments] = await Promise.all([
    input.service
      .from('organization_members')
      .select('organization_id,user_id,role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.userId)
      .maybeSingle(),
    input.service
      .from('member_scope_assignments')
      .select(
        'scope_type,role,brand_id,tenant_business_id,branch_id,department_id,team_id,attributes',
      )
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.userId),
  ]);

  if (
    member.error
    || !member.data
    || assignments.error
    || !Array.isArray(assignments.data)
  ) {
    return null;
  }

  const orgRole = String(member.data.role ?? '');
  if (orgRole === 'OWNER') return 'OWNER';

  const applicable = assignments.data
    .filter((row) => applicableAssignment(row as Record<string, unknown>, input.projection))
    .sort((a, b) => assignmentRank(b.scope_type) - assignmentRank(a.scope_type));

  const deepest = applicable[0];
  if (deepest) {
    const attributes = isObject(deepest.attributes) ? deepest.attributes : null;
    if (!attributes || Object.keys(attributes).length > 0) return null;
    return String(deepest.role ?? '');
  }

  const scopedOnly = orgRole === 'VIEWER' && assignments.data.length > 0;
  return scopedOnly ? null : orgRole;
}

async function resolveExternalTarget(input: {
  service: SupabaseClient;
  organizationId: string;
  projection: ProjectionRow;
  proxy: AdminProxy;
  action: UnifiedInboxConversationAction;
  fetchImpl?: typeof fetch;
}): Promise<ExternalTarget> {
  if (input.action.action === 'STATUS') {
    return {
      kind: 'STATUS',
      status: input.action.status,
      snoozedUntil: input.action.snoozedUntil,
    };
  }

  if (input.action.action === 'LABELS') {
    if (input.action.labels.length > 0) {
      const raw = await accountRequest<unknown>({
        proxy: input.proxy,
        resourcePath: '/labels',
        fetchImpl: input.fetchImpl,
      });
      const payload = isObject(raw) && Array.isArray(raw.payload) ? raw.payload : null;
      if (!payload) {
        fail('RECONCILIATION_REQUIRED', 'Chatwoot label catalog could not be verified');
      }
      const available = new Set(
        payload
          .filter(isObject)
          .map((row) => typeof row.title === 'string' ? row.title.trim() : '')
          .filter(Boolean),
      );
      const missing = input.action.labels.filter((label) => !available.has(label));
      if (missing.length > 0) {
        fail('INVALID_INPUT', 'Requested Chatwoot labels are not in the governed account catalog');
      }
    }
    return { kind: 'LABELS', labels: input.action.labels };
  }

  if (input.action.action === 'ASSIGNEE') {
    if (!input.action.smartUserId) {
      return { kind: 'ASSIGNEE', chatwootUserId: null, smartUserId: null };
    }

    const effectiveRole = await targetEffectiveRole({
      service: input.service,
      organizationId: input.organizationId,
      userId: input.action.smartUserId,
      projection: input.projection,
    });
    if (!effectiveRole || !ASSIGNEE_ROLES.has(effectiveRole)) {
      fail('INVALID_INPUT', 'Target assignee is not authorized for the conversation scope');
    }

    const mapping = await input.service
      .from('chatwoot_user_mappings')
      .select('id,smart_user_id,chatwoot_user_id,status')
      .eq('smart_user_id', input.action.smartUserId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    const chatwootUserId = normalizeChatwootInt32Id(mapping.data?.chatwoot_user_id);
    if (mapping.error || !mapping.data || chatwootUserId === null) {
      fail('NOT_READY', 'Target assignee has no ACTIVE Chatwoot User projection');
    }

    const membership = await input.service
      .from('chatwoot_account_memberships')
      .select('chatwoot_user_mapping_id,chatwoot_account_mapping_id,status')
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.projection.tenant_business_id)
      .eq('smart_user_id', input.action.smartUserId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (
      membership.error
      || !membership.data
      || membership.data.chatwoot_user_mapping_id !== mapping.data.id
      || membership.data.chatwoot_account_mapping_id !== input.proxy.accountMappingId
    ) {
      fail('NOT_READY', 'Target assignee has no matching ACTIVE Chatwoot Account membership');
    }

    return {
      kind: 'ASSIGNEE',
      chatwootUserId,
      smartUserId: input.action.smartUserId,
    };
  }

  if (!input.action.teamId) {
    return { kind: 'TEAM', chatwootTeamId: null, teamId: null };
  }

  const team = await input.service
    .from('teams')
    .select('id,organization_id,department_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.action.teamId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (team.error || !team.data) {
    fail('INVALID_INPUT', 'Target team is not an ACTIVE canonical team');
  }

  const department = await input.service
    .from('departments')
    .select('id,organization_id,branch_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', team.data.department_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (
    department.error
    || !department.data
    || department.data.branch_id !== input.projection.branch_id
  ) {
    fail('INVALID_INPUT', 'Cross-branch team transfer is not permitted');
  }

  const mapping = await input.service
    .from('chatwoot_team_mappings')
    .select(
      'id,organization_id,tenant_business_id,smart_team_id,chatwoot_account_mapping_id,chatwoot_team_id,status',
    )
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.projection.tenant_business_id)
    .eq('smart_team_id', input.action.teamId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  const chatwootTeamId = normalizeChatwootInt64Id(mapping.data?.chatwoot_team_id);
  if (
    mapping.error
    || !mapping.data
    || mapping.data.chatwoot_account_mapping_id !== input.proxy.accountMappingId
    || chatwootTeamId === null
  ) {
    fail('NOT_READY', 'Target team has no matching ACTIVE Chatwoot Team projection');
  }

  return {
    kind: 'TEAM',
    chatwootTeamId,
    teamId: input.action.teamId,
  };
}

type UnifiedInboxClaimAction =
  | UnifiedInboxConversationAction
  | { action: 'INTERNAL_NOTE'; content: string };

function claimPayload(action: UnifiedInboxClaimAction) {
  if (action.action === 'STATUS') {
    return {
      status: action.status,
      ...(action.snoozedUntil === null ? {} : { snoozedUntil: action.snoozedUntil }),
    };
  }
  if (action.action === 'LABELS') return { labels: action.labels };
  if (action.action === 'ASSIGNEE') return { smartUserId: action.smartUserId };
  if (action.action === 'TEAM') return { teamId: action.teamId };
  return { content: action.content };
}

function normalizeSnoozedUntil(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[1-9][0-9]*$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    const millis = Date.parse(trimmed);
    return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
  }
  return null;
}

function parseExternalConversation(value: unknown): ExternalConversationState {
  if (!isObject(value)) {
    return fail('RECONCILIATION_REQUIRED', 'Chatwoot conversation response is invalid');
  }

  const meta = isObject(value.meta) ? value.meta : {};
  const assignee = isObject(meta.assignee) ? meta.assignee : null;
  const team = isObject(meta.team) ? meta.team : null;
  const status = typeof value.status === 'string' ? value.status.trim().toLowerCase() : null;
  const labels = canonicalLabels(value.labels) ?? [];

  return {
    status,
    snoozedUntil: normalizeSnoozedUntil(value.snoozed_until),
    labels,
    assigneeId: assignee ? normalizeChatwootInt32Id(assignee.id) : null,
    teamId: team ? normalizeChatwootInt64Id(team.id) : null,
  };
}

export function externalConversationMatchesTarget(
  state: ExternalConversationState,
  target: ExternalTarget,
) {
  if (target.kind === 'STATUS') {
    if (state.status !== target.status) return false;
    return target.status !== 'snoozed'
      || target.snoozedUntil === null
      || state.snoozedUntil === target.snoozedUntil;
  }
  if (target.kind === 'LABELS') {
    return JSON.stringify(state.labels) === JSON.stringify(target.labels);
  }
  if (target.kind === 'ASSIGNEE') {
    return state.assigneeId === target.chatwootUserId;
  }
  return state.teamId === target.chatwootTeamId;
}

export function mutationRequestForUnifiedInboxAction(
  displayId: number,
  target: ExternalTarget,
) {
  if (target.kind === 'STATUS') {
    return {
      resourcePath: `/conversations/${displayId}/toggle_status`,
      body: {
        status: target.status,
        ...(target.snoozedUntil === null
          ? {}
          : { snoozed_until: target.snoozedUntil }),
      },
    };
  }
  if (target.kind === 'LABELS') {
    return {
      resourcePath: `/conversations/${displayId}/labels`,
      body: { labels: target.labels },
    };
  }
  if (target.kind === 'ASSIGNEE') {
    return {
      resourcePath: `/conversations/${displayId}/assignments`,
      body: { assignee_id: target.chatwootUserId },
    };
  }
  return {
    resourcePath: `/conversations/${displayId}/assignments`,
    body: { team_id: target.chatwootTeamId === null ? 0 : target.chatwootTeamId },
  };
}

async function readExternalConversation(input: {
  proxy: AdminProxy;
  displayId: number;
  fetchImpl?: typeof fetch;
}) {
  const raw = await accountRequest<unknown>({
    proxy: input.proxy,
    resourcePath: `/conversations/${input.displayId}`,
    fetchImpl: input.fetchImpl,
  });
  return parseExternalConversation(raw);
}


export async function getUnifiedInboxConversationActionOptions(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  service?: SupabaseClient;
  fetchImpl?: typeof fetch;
}): Promise<UnifiedInboxConversationActionOptions> {
  activationReady();

  const projection = await loadManageableProjection({
    supabase: input.supabase,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
  });
  const service = input.service ?? createSupabaseServiceClient();
  const proxy = await issueAdminProxy({
    service,
    organizationId: input.organizationId,
    tenantBusinessId: projection.tenant_business_id,
    fetchImpl: input.fetchImpl,
  });

  const [external, rawLabels, rawAgents, rawMessages, memberships, teamMappings] = await Promise.all([
    readExternalConversation({
      proxy,
      displayId: projection.chatwoot_conversation_display_id,
      fetchImpl: input.fetchImpl,
    }),
    accountRequest<unknown>({
      proxy,
      resourcePath: '/labels',
      fetchImpl: input.fetchImpl,
    }),
    accountRequest<unknown>({
      proxy,
      resourcePath: '/agents',
      fetchImpl: input.fetchImpl,
    }),
    accountRequest<unknown>({
      proxy,
      resourcePath: `/conversations/${projection.chatwoot_conversation_display_id}/messages`,
      fetchImpl: input.fetchImpl,
    }),
    service
      .from('chatwoot_account_memberships')
      .select('smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,effective_smart_role,status')
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', projection.tenant_business_id)
      .eq('chatwoot_account_mapping_id', proxy.accountMappingId)
      .eq('status', 'ACTIVE'),
    service
      .from('chatwoot_team_mappings')
      .select('smart_team_id,chatwoot_account_mapping_id,chatwoot_team_id,status')
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', projection.tenant_business_id)
      .eq('chatwoot_account_mapping_id', proxy.accountMappingId)
      .eq('status', 'ACTIVE'),
  ]);

  if (memberships.error || teamMappings.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox action option lookup failed');
  }

  const eligibleMemberships = (memberships.data ?? []).filter((row) => (
    typeof row.smart_user_id === 'string'
    && typeof row.chatwoot_user_mapping_id === 'string'
    && ASSIGNEE_ROLES.has(String(row.effective_smart_role ?? ''))
  ));
  const mappingIds = [...new Set(
    eligibleMemberships.map((row) => String(row.chatwoot_user_mapping_id)),
  )];
  const userMappings = mappingIds.length > 0
    ? await service
      .from('chatwoot_user_mappings')
      .select('id,smart_user_id,chatwoot_user_id,status')
      .in('id', mappingIds)
      .eq('status', 'ACTIVE')
    : { data: [], error: null };

  if (userMappings.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox assignee mapping lookup failed');
  }

  const externalAgents = new Map(
    agentCatalog(rawAgents).map((agent) => [agent.id, agent]),
  );
  const membershipByMapping = new Map(
    eligibleMemberships.map((membership) => [
      String(membership.chatwoot_user_mapping_id),
      membership,
    ]),
  );

  const assignees = (userMappings.data ?? [])
    .map((mapping) => {
      const chatwootUserId = normalizeChatwootInt32Id(mapping.chatwoot_user_id);
      const membership = membershipByMapping.get(String(mapping.id));
      const agent = chatwootUserId === null ? null : externalAgents.get(chatwootUserId);
      if (
        !membership
        || !agent
        || String(mapping.smart_user_id) !== String(membership.smart_user_id)
      ) {
        return null;
      }
      return {
        smartUserId: String(mapping.smart_user_id),
        name: agent.name,
        availabilityStatus: agent.availabilityStatus,
      };
    })
    .filter((row): row is {
      smartUserId: string;
      name: string;
      availabilityStatus: string | null;
    } => Boolean(row))
    .sort((a, b) => a.name.localeCompare(b.name));

  const externalAssigneeMapping = (userMappings.data ?? []).find((mapping) => (
    normalizeChatwootInt32Id(mapping.chatwoot_user_id) === external.assigneeId
  ));

  const validTeamMappings = (teamMappings.data ?? [])
    .map((row) => ({
      smartTeamId: canonicalUuid(row.smart_team_id),
      chatwootTeamId: normalizeChatwootInt64Id(row.chatwoot_team_id),
    }))
    .filter((row): row is { smartTeamId: string; chatwootTeamId: string } => (
      Boolean(row.smartTeamId) && row.chatwootTeamId !== null
    ));
  const smartTeamIds = validTeamMappings.map((row) => row.smartTeamId);
  const canonicalTeams = smartTeamIds.length > 0
    ? await service
      .from('teams')
      .select('id,name,department_id,status')
      .eq('organization_id', input.organizationId)
      .in('id', smartTeamIds)
      .eq('status', 'ACTIVE')
    : { data: [], error: null };

  if (canonicalTeams.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox team catalog lookup failed');
  }

  const departmentIds = [...new Set(
    (canonicalTeams.data ?? [])
      .map((team) => canonicalUuid(team.department_id))
      .filter((id): id is string => Boolean(id)),
  )];
  const allowedDepartments = departmentIds.length > 0
    ? await service
      .from('departments')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('branch_id', projection.branch_id)
      .in('id', departmentIds)
      .eq('status', 'ACTIVE')
    : { data: [], error: null };

  if (allowedDepartments.error) {
    fail('UPSTREAM_FAILED', 'Unified Inbox team scope lookup failed');
  }

  const allowedDepartmentIds = new Set(
    (allowedDepartments.data ?? []).map((department) => String(department.id)),
  );
  const validTeamIds = new Set(validTeamMappings.map((mapping) => mapping.smartTeamId));
  const teams = (canonicalTeams.data ?? [])
    .filter((team) => (
      validTeamIds.has(String(team.id))
      && allowedDepartmentIds.has(String(team.department_id))
    ))
    .map((team) => ({
      teamId: String(team.id),
      name: String(team.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const externalTeamMapping = validTeamMappings.find(
    (mapping) => mapping.chatwootTeamId === external.teamId,
  );

  return {
    statuses: ['open', 'pending', 'resolved', 'snoozed'],
    current: {
      status: external.status,
      snoozedUntil: external.snoozedUntil,
      labels: external.labels,
      smartUserId: externalAssigneeMapping
        ? String(externalAssigneeMapping.smart_user_id)
        : null,
      teamId: externalTeamMapping?.smartTeamId ?? null,
    },
    labels: labelCatalog(rawLabels),
    assignees,
    teams,
    notes: privateNoteCatalog(rawMessages)
      .filter((note) => note.conversationId === projection.chatwoot_conversation_display_id)
      .slice(-20)
      .reverse()
      .map((note) => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        senderName: note.senderName,
      })),
  };
}

async function claimAction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  requestId: string;
  action: UnifiedInboxClaimAction;
}) {
  const result = await input.supabase.rpc('claim_unified_inbox_action', {
    p_organization_id: input.organizationId,
    p_conversation_id: input.conversationId,
    p_request_key: `unified-inbox-action:${input.requestId}`,
    p_action: input.action.action,
    p_payload: claimPayload(input.action),
  });

  if (result.error) {
    if (/not permitted/i.test(result.error.message)) {
      fail('FORBIDDEN', 'Unified Inbox action is not permitted');
    }
    if (/request key already used/i.test(result.error.message)) {
      fail('INVALID_INPUT', 'Action requestId was already used with a different payload');
    }
    fail('UPSTREAM_FAILED', 'Unified Inbox action claim failed');
  }

  return oneClaim(result.data);
}

function auditAfterData(input: {
  requestId: string;
  claim: ActionClaim;
  target: ExternalTarget;
  replayed: boolean;
}) {
  const base = {
    request_id: input.requestId,
    external_verified: true,
    replayed: input.replayed,
    claimed_projection_version: input.claim.claimed_projection_version,
    current_projection_version: input.claim.current_projection_version,
  };

  if (input.target.kind === 'STATUS') {
    return { ...base, action: 'STATUS', status: input.target.status };
  }
  if (input.target.kind === 'LABELS') {
    return { ...base, action: 'LABELS', label_count: input.target.labels.length };
  }
  if (input.target.kind === 'ASSIGNEE') {
    return {
      ...base,
      action: 'ASSIGNEE',
      target_smart_user_id: input.target.smartUserId,
    };
  }
  return { ...base, action: 'TEAM', target_team_id: input.target.teamId };
}


function privateNoteMatchesRequest(input: {
  value: unknown;
  displayId: number;
  requestId: string;
  content: string;
}) {
  return privateNoteCatalog(input.value).find((note) => (
    note.conversationId === input.displayId
    && note.content === input.content
    && note.contentAttributes.smartvisions_request_id === input.requestId
    && note.contentAttributes.smartvisions_origin === 'SMART_CORE'
  )) ?? null;
}

async function readPrivateNoteByRequestId(input: {
  proxy: AdminProxy;
  displayId: number;
  requestId: string;
  content: string;
  afterMessageId?: number | null;
  fetchImpl?: typeof fetch;
}) {
  const after = input.afterMessageId && input.afterMessageId > 1
    ? `?after=${input.afterMessageId - 1}`
    : '';
  const raw = await accountRequest<unknown>({
    proxy: input.proxy,
    resourcePath: `/conversations/${input.displayId}/messages${after}`,
    fetchImpl: input.fetchImpl,
  });
  return privateNoteMatchesRequest({
    value: raw,
    displayId: input.displayId,
    requestId: input.requestId,
    content: input.content,
  });
}

export async function performUnifiedInboxInternalNote(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  request: UnifiedInboxInternalNoteInput;
  service?: SupabaseClient;
  fetchImpl?: typeof fetch;
}) {
  activationReady();

  const projection = await loadManageableProjection({
    supabase: input.supabase,
    organizationId: input.organizationId,
    conversationId: input.request.conversationId,
  });
  const service = input.service ?? createSupabaseServiceClient();
  const proxy = await issueAdminProxy({
    service,
    organizationId: input.organizationId,
    tenantBusinessId: projection.tenant_business_id,
    fetchImpl: input.fetchImpl,
  });
  const noteAction = {
    action: 'INTERNAL_NOTE' as const,
    content: input.request.content,
  };
  const claim = await claimAction({
    supabase: input.supabase,
    organizationId: input.organizationId,
    conversationId: input.request.conversationId,
    requestId: input.request.requestId,
    action: noteAction,
  });

  if (claim.projection_id !== projection.id) {
    fail('RECONCILIATION_REQUIRED', 'Internal note claim no longer matches the loaded projection');
  }

  let createdMessageId: number | null = null;
  let mutationError: unknown = null;

  if (claim.is_new) {
    try {
      const created = await accountRequest<unknown>({
        proxy,
        resourcePath: `/conversations/${claim.chatwoot_conversation_display_id}/messages`,
        method: 'POST',
        body: {
          content: input.request.content,
          message_type: 'outgoing',
          content_type: 'text',
          private: true,
          content_attributes: {
            smartvisions_request_id: input.request.requestId,
            smartvisions_origin: 'SMART_CORE',
          },
        },
        fetchImpl: input.fetchImpl,
      });
      if (isObject(created)) {
        createdMessageId = normalizeChatwootInt32Id(created.id);
      }
    } catch (error) {
      mutationError = error;
      if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
        throw error;
      }
    }
  }

  let verifiedNote;
  try {
    verifiedNote = await readPrivateNoteByRequestId({
      proxy,
      displayId: claim.chatwoot_conversation_display_id,
      requestId: input.request.requestId,
      content: input.request.content,
      afterMessageId: createdMessageId,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (mutationError) {
      fail(
        'RECONCILIATION_REQUIRED',
        'Internal note outcome is ambiguous and exact reconciliation failed',
      );
    }
    throw error;
  }

  if (!verifiedNote) {
    fail(
      'RECONCILIATION_REQUIRED',
      claim.is_new
        ? 'Internal note was not confirmed by exact Chatwoot reconciliation; do not resend blindly'
        : 'Replayed internal note claim is not yet confirmed in Chatwoot',
    );
  }

  const audit = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'USER',
    actor_id: input.userId,
    action: 'CHATWOOT_INTERNAL_NOTE_VERIFIED',
    entity_type: 'unified_inbox_projection',
    entity_id: claim.projection_id,
    brand_id: claim.brand_id,
    tenant_business_id: claim.tenant_business_id,
    branch_id: claim.branch_id,
    department_id: claim.department_id,
    team_id: claim.team_id,
    correlation_id: input.request.requestId,
    after_data: {
      external_verified: true,
      replayed: !claim.is_new,
      chatwoot_message_id: verifiedNote.id,
      private: true,
      content_length: input.request.content.length,
      claimed_projection_version: claim.claimed_projection_version,
      current_projection_version: claim.current_projection_version,
    },
  });

  return {
    ok: true as const,
    action: 'INTERNAL_NOTE' as const,
    replayed: !claim.is_new,
    externallyVerified: true as const,
    chatwootMessageId: verifiedNote.id,
    ...(audit.error
      ? { warning: 'Internal note verified; audit reconciliation needs attention' }
      : {}),
  };
}

export async function performUnifiedInboxConversationAction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  request: UnifiedInboxConversationActionInput;
  service?: SupabaseClient;
  fetchImpl?: typeof fetch;
}) {
  activationReady();

  const projection = await loadManageableProjection({
    supabase: input.supabase,
    organizationId: input.organizationId,
    conversationId: input.request.conversationId,
  });

  const service = input.service ?? createSupabaseServiceClient();
  const proxy = await issueAdminProxy({
    service,
    organizationId: input.organizationId,
    tenantBusinessId: projection.tenant_business_id,
    fetchImpl: input.fetchImpl,
  });

  const target = await resolveExternalTarget({
    service,
    organizationId: input.organizationId,
    projection,
    proxy,
    action: input.request.action,
    fetchImpl: input.fetchImpl,
  });

  const claim = await claimAction({
    supabase: input.supabase,
    organizationId: input.organizationId,
    conversationId: input.request.conversationId,
    requestId: input.request.requestId,
    action: input.request.action,
  });

  if (claim.projection_id !== projection.id) {
    fail('RECONCILIATION_REQUIRED', 'Action claim no longer matches the loaded projection');
  }

  let mutationError: unknown = null;
  if (claim.is_new) {
    const mutation = mutationRequestForUnifiedInboxAction(
      claim.chatwoot_conversation_display_id,
      target,
    );

    try {
      await accountRequest<unknown>({
        proxy,
        resourcePath: mutation.resourcePath,
        method: 'POST',
        body: mutation.body,
        fetchImpl: input.fetchImpl,
      });
    } catch (error) {
      mutationError = error;
      if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
        throw error;
      }
    }
  }

  let external: ExternalConversationState;
  try {
    external = await readExternalConversation({
      proxy,
      displayId: claim.chatwoot_conversation_display_id,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (mutationError) {
      fail(
        'RECONCILIATION_REQUIRED',
        'Chatwoot mutation outcome is ambiguous and exact reconciliation failed',
      );
    }
    throw error;
  }

  if (!externalConversationMatchesTarget(external, target)) {
    fail(
      'RECONCILIATION_REQUIRED',
      claim.is_new
        ? 'Chatwoot mutation was not confirmed by exact reconciliation'
        : 'Replayed action is not currently confirmed in Chatwoot',
    );
  }

  const audit = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'USER',
    actor_id: input.userId,
    action: 'CHATWOOT_CONVERSATION_ACTION_VERIFIED',
    entity_type: 'unified_inbox_projection',
    entity_id: claim.projection_id,
    brand_id: claim.brand_id,
    tenant_business_id: claim.tenant_business_id,
    branch_id: claim.branch_id,
    department_id: claim.department_id,
    team_id: claim.team_id,
    correlation_id: input.request.requestId,
    after_data: auditAfterData({
      requestId: input.request.requestId,
      claim,
      target,
      replayed: !claim.is_new,
    }),
  });

  return {
    ok: true as const,
    action: input.request.action.action,
    replayed: !claim.is_new,
    externallyVerified: true as const,
    projectionPendingWebhookReconciliation: true as const,
    ...(audit.error
      ? { warning: 'External action verified; audit reconciliation needs attention' }
      : {}),
  };
}

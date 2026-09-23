import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmSegmentStatus = 'ACTIVE' | 'ARCHIVED';
export type CrmSegmentEvaluationMode = 'DYNAMIC';
export type CrmSegmentSource = 'CANONICAL' | 'CUSTOM_FIELD';

export type CrmSegmentPredicateNode =
  | {
      kind: 'GROUP';
      op: 'AND' | 'OR';
      children: CrmSegmentPredicateNode[];
    }
  | {
      kind: 'PREDICATE';
      source: CrmSegmentSource;
      [key: string]: unknown;
    };

export type CrmSegmentRow = {
  id: string;
  organization_id: string;
  entity_type: 'LEAD';
  status: CrmSegmentStatus;
  current_definition_version: number;
  version: number;
  name: string;
  predicate_tree: CrmSegmentPredicateNode;
  predicate_hash: string;
  predicate_leaf_count: number;
  last_request_key: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type CrmSegmentEvaluation = {
  segmentId: string;
  segmentVersion: number;
  evaluationMode: CrmSegmentEvaluationMode;
  predicateHash: string;
  evaluatedAt: string;
  leadIds: string[];
  hasMore: boolean;
  nextCursor: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOM_TYPES = new Set([
  'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
  'SINGLE_SELECT','MULTI_SELECT','URL','CURRENCY',
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed);
  return Object.keys(value).every(key => set.has(key));
}

function isStringArray(value: unknown, min = 1, max = 20) {
  return Array.isArray(value)
    && value.length >= min
    && value.length <= max
    && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function isNumberPair(value: unknown) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(item => typeof item === 'number' && Number.isFinite(item))
    && value[0] <= value[1];
}

function isStringPair(value: unknown) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function validIso(value: unknown) {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}

function validateCanonical(node: Record<string, unknown>) {
  if (!exactKeys(node, ['kind','source','field','operator','value'])) return false;
  const field = node.field;
  const operator = node.operator;
  const value = node.value;

  if (typeof field !== 'string' || typeof operator !== 'string') return false;

  if (field === 'status') {
    if (operator === 'EQ' || operator === 'NEQ') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    return (operator === 'IN' || operator === 'NOT_IN') && isStringArray(value);
  }

  if (field === 'opportunity_score' || field === 'intent_score') {
    if (['EQ','NEQ','GT','GTE','LT','LTE'].includes(operator)) {
      return typeof value === 'number' && Number.isFinite(value);
    }
    return operator === 'BETWEEN' && isNumberPair(value);
  }

  if (field === 'business_id') {
    if (operator === 'IS_SET' || operator === 'IS_NOT_SET') return value === undefined || value === null;
    if (operator === 'EQ') return typeof value === 'string' && UUID_RE.test(value);
    return (operator === 'IN' || operator === 'NOT_IN')
      && isStringArray(value)
      && (value as string[]).every(item => UUID_RE.test(item));
  }

  if (field === 'created_at' || field === 'updated_at') {
    if (operator === 'BEFORE' || operator === 'AFTER') return validIso(value);
    return operator === 'BETWEEN'
      && isStringPair(value)
      && (value as string[]).every(validIso)
      && Date.parse((value as string[])[0]) <= Date.parse((value as string[])[1]);
  }

  return false;
}

function validateCurrency(value: unknown, between: boolean) {
  const row = object(value);
  if (!row) return false;
  if (between) {
    if (!exactKeys(row, ['min','max','currency'])) return false;
    return typeof row.min === 'number'
      && Number.isFinite(row.min)
      && typeof row.max === 'number'
      && Number.isFinite(row.max)
      && row.min <= row.max
      && typeof row.currency === 'string'
      && /^[A-Z]{3}$/.test(row.currency);
  }
  if (!exactKeys(row, ['amount','currency'])) return false;
  return typeof row.amount === 'number'
    && Number.isFinite(row.amount)
    && typeof row.currency === 'string'
    && /^[A-Z]{3}$/.test(row.currency);
}

function validateCustom(node: Record<string, unknown>) {
  if (!exactKeys(node, [
    'kind','source','definitionId','definitionVersion','dataType','operator','value',
  ])) return false;
  if (typeof node.definitionId !== 'string' || !UUID_RE.test(node.definitionId)) return false;
  if (!Number.isInteger(node.definitionVersion) || Number(node.definitionVersion) < 1) return false;
  if (typeof node.dataType !== 'string' || !CUSTOM_TYPES.has(node.dataType)) return false;
  if (typeof node.operator !== 'string') return false;

  const type = node.dataType;
  const operator = node.operator;
  const value = node.value;

  if (operator === 'IS_SET' || operator === 'IS_NOT_SET') return value === undefined || value === null;

  if (type === 'TEXT' || type === 'LONG_TEXT' || type === 'URL') {
    return (operator === 'EQ' || operator === 'NEQ') && typeof value === 'string';
  }
  if (type === 'NUMBER') {
    if (['EQ','NEQ','GT','GTE','LT','LTE'].includes(operator)) {
      return typeof value === 'number' && Number.isFinite(value);
    }
    return operator === 'BETWEEN' && isNumberPair(value);
  }
  if (type === 'BOOLEAN') return operator === 'EQ' && typeof value === 'boolean';
  if (type === 'DATE' || type === 'DATETIME') {
    if (['EQ','BEFORE','AFTER'].includes(operator)) return validIso(value);
    return operator === 'BETWEEN'
      && isStringPair(value)
      && (value as string[]).every(validIso);
  }
  if (type === 'SINGLE_SELECT') {
    if (operator === 'EQ') return typeof value === 'string' && value.trim().length > 0;
    return (operator === 'IN' || operator === 'NOT_IN') && isStringArray(value);
  }
  if (type === 'MULTI_SELECT') return operator === 'CONTAINS_ANY' && isStringArray(value);
  if (type === 'CURRENCY') {
    if (operator === 'BETWEEN') return validateCurrency(value, true);
    return ['EQ','NEQ','GT','GTE','LT','LTE'].includes(operator)
      && validateCurrency(value, false);
  }
  return false;
}

function validateNode(value: unknown, depth: number): { node: CrmSegmentPredicateNode; leaves: number } | null {
  if (depth > 4) return null;
  const node = object(value);
  if (!node || node.kind === undefined) return null;

  if (node.kind === 'GROUP') {
    if (!exactKeys(node, ['kind','op','children'])) return null;
    if (node.op !== 'AND' && node.op !== 'OR') return null;
    if (!Array.isArray(node.children) || node.children.length < 1 || node.children.length > 8) return null;
    const children: CrmSegmentPredicateNode[] = [];
    let leaves = 0;
    for (const child of node.children) {
      const parsed = validateNode(child, depth + 1);
      if (!parsed) return null;
      leaves += parsed.leaves;
      if (leaves > 20) return null;
      children.push(parsed.node);
    }
    return { node: { kind: 'GROUP', op: node.op, children }, leaves };
  }

  if (node.kind !== 'PREDICATE' || (node.source !== 'CANONICAL' && node.source !== 'CUSTOM_FIELD')) {
    return null;
  }
  const valid = node.source === 'CANONICAL' ? validateCanonical(node) : validateCustom(node);
  if (!valid) return null;
  return { node: node as CrmSegmentPredicateNode, leaves: 1 };
}

export function parseCrmSegmentPredicateTree(value: unknown) {
  const parsed = validateNode(value, 0);
  return parsed && parsed.leaves >= 1 && parsed.leaves <= 20 ? parsed.node : null;
}

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), 100);
}

export class CrmSegmentMutationError extends Error {
  code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'FORBIDDEN' | 'INVALID';

  constructor(code: CrmSegmentMutationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function mapMutationError(message: string) {
  if (/not found/i.test(message)) return new CrmSegmentMutationError('NOT_FOUND', message);
  if (/version conflict|changed concurrently/i.test(message)) {
    return new CrmSegmentMutationError('VERSION_CONFLICT', message);
  }
  if (/not permitted|row-level security|permission denied/i.test(message)) {
    return new CrmSegmentMutationError('FORBIDDEN', message);
  }
  return new CrmSegmentMutationError('INVALID', message);
}

export async function listCrmSegments(input: {
  supabase: SupabaseClient;
  organizationId: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: { updatedAt: string; id: string } | null;
}) {
  const limit = clampLimit(input.limit);
  const { data, error } = await input.supabase.rpc('get_crm_segments', {
    p_organization_id: input.organizationId,
    p_include_archived: input.includeArchived === true,
    p_limit: limit + 1,
    p_before_updated_at: input.cursor?.updatedAt ?? null,
    p_before_id: input.cursor?.id ?? null,
  });
  if (error) throw new Error(`CRM Segment query failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as CrmSegmentRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasMore ? items.at(-1) : null;
  return {
    items,
    nextCursor: last ? { updatedAt: last.updated_at, id: last.id } : null,
  };
}

export async function createCrmLeadSegment(input: {
  supabase: SupabaseClient;
  organizationId: string;
  name: string;
  predicateTree: CrmSegmentPredicateNode;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('create_crm_lead_segment', {
    p_organization_id: input.organizationId,
    p_name: input.name.trim(),
    p_predicate_tree: input.predicateTree,
    p_request_key: input.requestKey.trim(),
  });
  if (error) throw mapMutationError(error.message);
  return data as CrmSegmentRow;
}

export async function updateCrmLeadSegmentDefinition(input: {
  supabase: SupabaseClient;
  organizationId: string;
  segmentId: string;
  expectedVersion: number;
  name: string;
  predicateTree: CrmSegmentPredicateNode;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('update_crm_lead_segment_definition', {
    p_organization_id: input.organizationId,
    p_segment_id: input.segmentId,
    p_expected_version: input.expectedVersion,
    p_name: input.name.trim(),
    p_predicate_tree: input.predicateTree,
    p_request_key: input.requestKey.trim(),
  });
  if (error) throw mapMutationError(error.message);
  return data as CrmSegmentRow;
}

export async function setCrmLeadSegmentLifecycle(input: {
  supabase: SupabaseClient;
  organizationId: string;
  segmentId: string;
  expectedVersion: number;
  status: CrmSegmentStatus;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('set_crm_lead_segment_lifecycle', {
    p_organization_id: input.organizationId,
    p_segment_id: input.segmentId,
    p_expected_version: input.expectedVersion,
    p_status: input.status,
    p_request_key: input.requestKey.trim(),
  });
  if (error) throw mapMutationError(error.message);
  return data as CrmSegmentRow;
}

export async function evaluateCrmLeadSegment(input: {
  supabase: SupabaseClient;
  organizationId: string;
  segmentId: string;
  segmentVersion?: number | null;
  limit?: number;
  afterLeadId?: string | null;
}) {
  const { data, error } = await input.supabase.rpc('evaluate_crm_lead_segment', {
    p_organization_id: input.organizationId,
    p_segment_id: input.segmentId,
    p_segment_version: input.segmentVersion ?? null,
    p_limit: clampLimit(input.limit),
    p_after_lead_id: input.afterLeadId ?? null,
  });
  if (error) throw mapMutationError(error.message);

  const row = object(data);
  if (!row
      || typeof row.segmentId !== 'string'
      || typeof row.segmentVersion !== 'number'
      || row.evaluationMode !== 'DYNAMIC'
      || typeof row.predicateHash !== 'string'
      || typeof row.evaluatedAt !== 'string'
      || !Array.isArray(row.leadIds)
      || !row.leadIds.every(id => typeof id === 'string' && UUID_RE.test(id))
      || typeof row.hasMore !== 'boolean'
      || (row.nextCursor !== null && row.nextCursor !== undefined
        && (typeof row.nextCursor !== 'string' || !UUID_RE.test(row.nextCursor)))) {
    throw new Error('CRM Segment evaluation returned invalid evidence');
  }

  return row as unknown as CrmSegmentEvaluation;
}

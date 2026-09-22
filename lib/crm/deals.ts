import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmDealState = 'OPEN' | 'WON' | 'LOST';
export type CrmStageCategory = CrmDealState;
export type CrmPipelineStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type CrmPipelineRow = {
  id: string;
  organization_id: string;
  name: string;
  status: CrmPipelineStatus;
  is_default: boolean;
  created_by_user_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CrmPipelineStageRow = {
  id: string;
  organization_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  category: CrmStageCategory;
  is_active: boolean;
  created_by_user_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CrmDealRow = {
  id: string;
  organization_id: string;
  business_id: string;
  lead_id: string | null;
  pipeline_id: string;
  stage_id: string;
  title: string;
  state: CrmDealState;
  amount: number | null;
  currency: string | null;
  expected_close_at: string | null;
  owner_user_id: string;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  source_type: string;
  source_id: string | null;
  request_key: string;
  creator_type: 'USER' | 'SYSTEM';
  created_by_user_id: string | null;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CrmDealCursor = { updatedAt: string; id: string };

export class CrmDealMutationError extends Error {
  code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'FORBIDDEN';
  constructor(code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'FORBIDDEN', message: string) {
    super(message);
    this.code = code;
  }
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);
}

function normalizeCursor(cursor: CrmDealCursor | null | undefined) {
  if (!cursor) return null;
  const time = Date.parse(cursor.updatedAt);
  if (!Number.isFinite(time) || !/^[0-9a-f-]{36}$/i.test(cursor.id)) return null;
  return { updatedAt: new Date(time).toISOString(), id: cursor.id };
}

async function assertPipelineManagePermission(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data, error } = await input.supabase.rpc('crm_pipeline_can_manage', {
    p_organization_id: input.organizationId,
  });
  if (error) throw new Error(`CRM pipeline permission check failed: ${error.message}`);
  if (data !== true) {
    throw new CrmDealMutationError('FORBIDDEN', 'CRM pipeline mutation not permitted');
  }
}

async function assertDealManagePermission(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
}) {
  const { data, error } = await input.supabase.rpc('crm_deal_can_manage', {
    p_organization_id: input.organizationId,
    p_owner_user_id: input.ownerUserId,
  });
  if (error) throw new Error(`CRM Deal permission check failed: ${error.message}`);
  if (data !== true) {
    throw new CrmDealMutationError('FORBIDDEN', 'CRM Deal mutation not permitted');
  }
}

export async function listCrmPipelines(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const [pipelines, stages] = await Promise.all([
    input.supabase
      .from('crm_pipelines')
      .select('*')
      .eq('organization_id', input.organizationId)
      .order('created_at', { ascending: true }),
    input.supabase
      .from('crm_pipeline_stages')
      .select('*')
      .eq('organization_id', input.organizationId)
      .order('position', { ascending: true }),
  ]);

  if (pipelines.error) throw new Error(`CRM pipeline query failed: ${pipelines.error.message}`);
  if (stages.error) throw new Error(`CRM pipeline stage query failed: ${stages.error.message}`);

  return {
    pipelines: (pipelines.data ?? []) as CrmPipelineRow[],
    stages: (stages.data ?? []) as CrmPipelineStageRow[],
  };
}

export async function createCrmPipeline(input: {
  supabase: SupabaseClient;
  organizationId: string;
  name: string;
  isDefault?: boolean;
  stages: Array<{ name: string; position: number; category: CrmStageCategory }>;
}) {
  const { data, error } = await input.supabase.rpc('create_crm_pipeline_with_stages', {
    p_organization_id: input.organizationId,
    p_name: input.name.trim(),
    p_is_default: input.isDefault === true,
    p_stages: input.stages,
  });

  if (error) throw new Error(`CRM pipeline create failed: ${error.message}`);
  return String(data);
}

export async function updateCrmPipeline(input: {
  supabase: SupabaseClient;
  organizationId: string;
  pipelineId: string;
  expectedVersion: number;
  patch: Partial<Pick<CrmPipelineRow, 'name' | 'status' | 'is_default'>>;
}) {
  await assertPipelineManagePermission({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const { data, error } = await input.supabase
    .from('crm_pipelines')
    .update(input.patch)
    .eq('organization_id', input.organizationId)
    .eq('id', input.pipelineId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`CRM pipeline update failed: ${error.message}`);
  if (data) return data as CrmPipelineRow;

  const current = await input.supabase
    .from('crm_pipelines')
    .select('id,version')
    .eq('organization_id', input.organizationId)
    .eq('id', input.pipelineId)
    .maybeSingle();

  if (current.error) throw new Error(`CRM pipeline conflict lookup failed: ${current.error.message}`);
  if (!current.data) throw new CrmDealMutationError('NOT_FOUND', 'CRM pipeline not found');
  throw new CrmDealMutationError(
    'VERSION_CONFLICT',
    `CRM pipeline version conflict; current version is ${current.data.version}`,
  );
}

export async function updateCrmPipelineStage(input: {
  supabase: SupabaseClient;
  organizationId: string;
  stageId: string;
  expectedVersion: number;
  patch: Partial<Pick<CrmPipelineStageRow, 'name' | 'position' | 'is_active'>>;
}) {
  await assertPipelineManagePermission({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const { data, error } = await input.supabase
    .from('crm_pipeline_stages')
    .update(input.patch)
    .eq('organization_id', input.organizationId)
    .eq('id', input.stageId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`CRM pipeline stage update failed: ${error.message}`);
  if (data) return data as CrmPipelineStageRow;

  const current = await input.supabase
    .from('crm_pipeline_stages')
    .select('id,version')
    .eq('organization_id', input.organizationId)
    .eq('id', input.stageId)
    .maybeSingle();

  if (current.error) throw new Error(`CRM stage conflict lookup failed: ${current.error.message}`);
  if (!current.data) throw new CrmDealMutationError('NOT_FOUND', 'CRM pipeline stage not found');
  throw new CrmDealMutationError(
    'VERSION_CONFLICT',
    `CRM pipeline stage version conflict; current version is ${current.data.version}`,
  );
}

export async function listCrmDeals(input: {
  supabase: SupabaseClient;
  organizationId: string;
  pipelineId?: string | null;
  businessId?: string | null;
  ownerUserId?: string | null;
  state?: CrmDealState | null;
  limit?: number;
  cursor?: CrmDealCursor | null;
}) {
  const limit = clampLimit(input.limit);
  const cursor = normalizeCursor(input.cursor);

  const { data, error } = await input.supabase.rpc('get_crm_deals', {
    p_organization_id: input.organizationId,
    p_pipeline_id: input.pipelineId ?? null,
    p_business_id: input.businessId ?? null,
    p_owner_user_id: input.ownerUserId ?? null,
    p_state: input.state ?? null,
    p_limit: limit + 1,
    p_before_updated_at: cursor?.updatedAt ?? null,
    p_before_id: cursor?.id ?? null,
  });

  if (error) throw new Error(`CRM deal query failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as CrmDealRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasMore ? items.at(-1) : null;

  return {
    items,
    nextCursor: last ? { updatedAt: last.updated_at, id: last.id } : null,
  };
}


export async function createCrmDealFromLead(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  amount?: number | null;
  currency?: string | null;
  expectedCloseAt?: string | null;
  ownerUserId: string;
  requestKey: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase.rpc('create_crm_deal_from_lead', {
    p_organization_id: input.organizationId,
    p_lead_id: input.leadId,
    p_pipeline_id: input.pipelineId,
    p_stage_id: input.stageId,
    p_title: input.title.trim(),
    p_amount: input.amount ?? null,
    p_currency: input.currency?.trim().toUpperCase() ?? null,
    p_expected_close_at: input.expectedCloseAt ?? null,
    p_owner_user_id: input.ownerUserId,
    p_request_key: input.requestKey.trim(),
    p_metadata: input.metadata ?? {},
  });

  if (error) throw new Error(`CRM Deal Lead conversion failed: ${error.message}`);
  return String(data);
}

export async function listCrmDealStageHistory(input: {
  supabase: SupabaseClient;
  organizationId: string;
  dealId: string;
}) {
  const { data, error } = await input.supabase
    .from('crm_deal_stage_history')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('deal_id', input.dealId)
    .order('occurred_at', { ascending: true });

  if (error) throw new Error(`CRM Deal stage history query failed: ${error.message}`);
  return data ?? [];
}

export async function createCrmDeal(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  leadId?: string | null;
  pipelineId: string;
  stageId: string;
  title: string;
  amount?: number | null;
  currency?: string | null;
  expectedCloseAt?: string | null;
  ownerUserId: string;
  lostReason?: string | null;
  requestKey: string;
  metadata?: Record<string, unknown>;
}) {
  const existing = await input.supabase
    .from('crm_deals')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('request_key', input.requestKey)
    .maybeSingle();

  if (existing.error) throw new Error(`CRM deal idempotency lookup failed: ${existing.error.message}`);
  if (existing.data) return existing.data as CrmDealRow;

  const { data, error } = await input.supabase
    .from('crm_deals')
    .insert({
      organization_id: input.organizationId,
      business_id: input.businessId,
      lead_id: input.leadId ?? null,
      pipeline_id: input.pipelineId,
      stage_id: input.stageId,
      title: input.title.trim(),
      amount: input.amount ?? null,
      currency: input.currency?.trim().toUpperCase() ?? null,
      expected_close_at: input.expectedCloseAt ?? null,
      owner_user_id: input.ownerUserId,
      lost_reason: input.lostReason?.trim() || null,
      source_type: 'MANUAL',
      source_id: null,
      request_key: input.requestKey.trim(),
      creator_type: 'USER',
      created_by_user_id: input.actorUserId,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (!error && data) return data as CrmDealRow;

  if (error?.code === '23505') {
    const retry = await input.supabase
      .from('crm_deals')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('request_key', input.requestKey)
      .maybeSingle();
    if (!retry.error && retry.data) return retry.data as CrmDealRow;
  }

  throw new Error(`CRM deal create failed: ${error?.message ?? 'unknown error'}`);
}

export async function updateCrmDeal(input: {
  supabase: SupabaseClient;
  organizationId: string;
  dealId: string;
  expectedVersion: number;
  patch: {
    title?: string;
    stageId?: string;
    amount?: number | null;
    currency?: string | null;
    expectedCloseAt?: string | null;
    ownerUserId?: string;
    lostReason?: string | null;
    metadata?: Record<string, unknown>;
  };
}) {
  const currentOwner = await input.supabase
    .from('crm_deals')
    .select('owner_user_id')
    .eq('organization_id', input.organizationId)
    .eq('id', input.dealId)
    .maybeSingle();

  if (currentOwner.error) {
    throw new Error(`CRM Deal owner lookup failed: ${currentOwner.error.message}`);
  }
  if (!currentOwner.data) {
    throw new CrmDealMutationError('NOT_FOUND', 'CRM Deal not found');
  }

  await assertDealManagePermission({
    supabase: input.supabase,
    organizationId: input.organizationId,
    ownerUserId: String(currentOwner.data.owner_user_id),
  });

  const update: Record<string, unknown> = {};
  if (input.patch.title !== undefined) update.title = input.patch.title.trim();
  if (input.patch.stageId !== undefined) update.stage_id = input.patch.stageId;
  if (input.patch.amount !== undefined) update.amount = input.patch.amount;
  if (input.patch.currency !== undefined) {
    update.currency = input.patch.currency?.trim().toUpperCase() || null;
  }
  if (input.patch.expectedCloseAt !== undefined) update.expected_close_at = input.patch.expectedCloseAt;
  if (input.patch.ownerUserId !== undefined) update.owner_user_id = input.patch.ownerUserId;
  if (input.patch.lostReason !== undefined) update.lost_reason = input.patch.lostReason?.trim() || null;
  if (input.patch.metadata !== undefined) update.metadata = input.patch.metadata;

  const { data, error } = await input.supabase
    .from('crm_deals')
    .update(update)
    .eq('organization_id', input.organizationId)
    .eq('id', input.dealId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`CRM deal update failed: ${error.message}`);
  if (data) return data as CrmDealRow;

  const current = await input.supabase
    .from('crm_deals')
    .select('id,version')
    .eq('organization_id', input.organizationId)
    .eq('id', input.dealId)
    .maybeSingle();

  if (current.error) throw new Error(`CRM deal conflict lookup failed: ${current.error.message}`);
  if (!current.data) throw new CrmDealMutationError('NOT_FOUND', 'CRM deal not found');
  throw new CrmDealMutationError(
    'VERSION_CONFLICT',
    `CRM deal version conflict; current version is ${current.data.version}`,
  );
}

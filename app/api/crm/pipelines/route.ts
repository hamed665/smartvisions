import { NextResponse } from 'next/server';
import {
  createCrmPipeline,
  listCrmPipelines,
  updateCrmPipeline,
  updateCrmPipelineStage,
  type CrmPipelineStatus,
  type CrmStageCategory,
  type CrmForecastCategory,
} from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES: CrmStageCategory[] = ['OPEN','WON','LOST'];
const PIPELINE_STATUSES: CrmPipelineStatus[] = ['ACTIVE','ARCHIVED'];
const FORECAST_CATEGORIES: CrmForecastCategory[] = ['PIPELINE','BEST_CASE','COMMIT','CLOSED','OMITTED'];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function mutationStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  if (/version conflict/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  if (!isUuid(organizationId)) {
    return NextResponse.json({ error: 'Valid organizationId is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const result = await listCrmPipelines({ supabase, organizationId });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM pipeline query failed', error);
    return NextResponse.json({ error: 'CRM pipeline query failed' }, { status: mutationStatus(error) });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const isDefault = body.isDefault === true;
  const stages = Array.isArray(body.stages) ? body.stages : null;

  if (!isUuid(organizationId)
      || name.length < 1
      || name.length > 160
      || !stages
      || stages.length < 3
      || stages.length > 20
      || stages.some(stage => {
        if (!isObject(stage)) return true;
        const stageName = typeof stage.name === 'string' ? stage.name.trim() : '';
        const position = Number(stage.position);
        const category = stage.category as CrmStageCategory;
        const probability = stage.defaultProbabilityPercent === undefined
          ? undefined
          : Number(stage.defaultProbabilityPercent);
        const forecast = stage.forecastCategory as CrmForecastCategory | undefined;
        return stageName.length < 1
          || stageName.length > 120
          || !Number.isInteger(position)
          || position < 1
          || !CATEGORIES.includes(category)
          || (probability !== undefined && (!Number.isInteger(probability) || probability < 0 || probability > 100))
          || (forecast !== undefined && !FORECAST_CATEGORIES.includes(forecast))
          || (stage.requiresAmount !== undefined && typeof stage.requiresAmount !== 'boolean')
          || (stage.requiresExpectedClose !== undefined && typeof stage.requiresExpectedClose !== 'boolean')
          || (category === 'WON' && probability !== undefined && probability !== 100)
          || (category === 'LOST' && probability !== undefined && probability !== 0);
      })) {
    return NextResponse.json({ error: 'Invalid CRM pipeline payload' }, { status: 400 });
  }

  try {
    const pipelineId = await createCrmPipeline({
      supabase,
      organizationId,
      name,
      isDefault,
      stages: stages.map(stage => ({
        name: String((stage as Record<string, unknown>).name).trim(),
        position: Number((stage as Record<string, unknown>).position),
        category: (stage as Record<string, unknown>).category as CrmStageCategory,
        defaultProbabilityPercent: (stage as Record<string, unknown>).defaultProbabilityPercent === undefined
          ? undefined
          : Number((stage as Record<string, unknown>).defaultProbabilityPercent),
        forecastCategory: (stage as Record<string, unknown>).forecastCategory as CrmForecastCategory | undefined,
        requiresAmount: (stage as Record<string, unknown>).requiresAmount as boolean | undefined,
        requiresExpectedClose: (stage as Record<string, unknown>).requiresExpectedClose as boolean | undefined,
      })),
    });
    return NextResponse.json({ pipelineId }, { status: 201 });
  } catch (error) {
    console.error('CRM pipeline create failed', error);
    return NextResponse.json({ error: 'CRM pipeline create failed' }, { status: mutationStatus(error) });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const entity = body.entity;
  const id = body.id;
  const expectedVersion = body.expectedVersion;
  const patch = body.patch;

  if (!isUuid(organizationId)
      || (entity !== 'PIPELINE' && entity !== 'STAGE')
      || !isUuid(id)
      || !Number.isInteger(expectedVersion)
      || Number(expectedVersion) < 1
      || !isObject(patch)
      || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid CRM pipeline update payload' }, { status: 400 });
  }

  try {
    if (entity === 'PIPELINE') {
      const allowed = new Set(['name','status','is_default']);
      if (Object.keys(patch).some(key => !allowed.has(key))
          || (patch.name !== undefined && (typeof patch.name !== 'string' || patch.name.trim().length < 1 || patch.name.trim().length > 160))
          || (patch.status !== undefined && !PIPELINE_STATUSES.includes(patch.status as CrmPipelineStatus))
          || (patch.is_default !== undefined && typeof patch.is_default !== 'boolean')) {
        return NextResponse.json({ error: 'Invalid CRM pipeline patch' }, { status: 400 });
      }

      const pipeline = await updateCrmPipeline({
        supabase,
        organizationId,
        pipelineId: id,
        expectedVersion: Number(expectedVersion),
        patch: patch as never,
      });
      return NextResponse.json({ pipeline });
    }

    const allowed = new Set([
      'name','position','is_active','defaultProbabilityPercent',
      'forecastCategory','requiresAmount','requiresExpectedClose',
    ]);
    const probability = patch.defaultProbabilityPercent === undefined
      ? undefined
      : Number(patch.defaultProbabilityPercent);
    if (Object.keys(patch).some(key => !allowed.has(key))
        || (patch.name !== undefined && (typeof patch.name !== 'string' || patch.name.trim().length < 1 || patch.name.trim().length > 120))
        || (patch.position !== undefined && (!Number.isInteger(patch.position) || Number(patch.position) < 1))
        || (patch.is_active !== undefined && typeof patch.is_active !== 'boolean')
        || (probability !== undefined && (!Number.isInteger(probability) || probability < 0 || probability > 100))
        || (patch.forecastCategory !== undefined && !FORECAST_CATEGORIES.includes(patch.forecastCategory as CrmForecastCategory))
        || (patch.requiresAmount !== undefined && typeof patch.requiresAmount !== 'boolean')
        || (patch.requiresExpectedClose !== undefined && typeof patch.requiresExpectedClose !== 'boolean')) {
      return NextResponse.json({ error: 'Invalid CRM pipeline stage patch' }, { status: 400 });
    }

    const stagePatch: Record<string, unknown> = {};
    if (patch.name !== undefined) stagePatch.name = String(patch.name).trim();
    if (patch.position !== undefined) stagePatch.position = Number(patch.position);
    if (patch.is_active !== undefined) stagePatch.is_active = patch.is_active;
    if (probability !== undefined) stagePatch.default_probability_percent = probability;
    if (patch.forecastCategory !== undefined) stagePatch.forecast_category = patch.forecastCategory;
    if (patch.requiresAmount !== undefined) stagePatch.requires_amount = patch.requiresAmount;
    if (patch.requiresExpectedClose !== undefined) stagePatch.requires_expected_close = patch.requiresExpectedClose;

    const stage = await updateCrmPipelineStage({
      supabase,
      organizationId,
      stageId: id,
      expectedVersion: Number(expectedVersion),
      patch: stagePatch as never,
    });
    return NextResponse.json({ stage });
  } catch (error) {
    console.error('CRM pipeline update failed', error);
    return NextResponse.json({ error: 'CRM pipeline update failed' }, { status: mutationStatus(error) });
  }
}

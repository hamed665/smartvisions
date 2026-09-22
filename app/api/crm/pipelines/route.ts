import { NextResponse } from 'next/server';
import {
  createCrmPipeline,
  listCrmPipelines,
  updateCrmPipeline,
  updateCrmPipelineStage,
  type CrmPipelineStatus,
  type CrmStageCategory,
} from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES: CrmStageCategory[] = ['OPEN','WON','LOST'];
const PIPELINE_STATUSES: CrmPipelineStatus[] = ['ACTIVE','ARCHIVED'];

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
        return stageName.length < 1
          || stageName.length > 120
          || !Number.isInteger(position)
          || position < 1
          || !CATEGORIES.includes(stage.category as CrmStageCategory);
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

    const allowed = new Set(['name','position','is_active']);
    if (Object.keys(patch).some(key => !allowed.has(key))
        || (patch.name !== undefined && (typeof patch.name !== 'string' || patch.name.trim().length < 1 || patch.name.trim().length > 120))
        || (patch.position !== undefined && (!Number.isInteger(patch.position) || Number(patch.position) < 1))
        || (patch.is_active !== undefined && typeof patch.is_active !== 'boolean')) {
      return NextResponse.json({ error: 'Invalid CRM pipeline stage patch' }, { status: 400 });
    }

    const stage = await updateCrmPipelineStage({
      supabase,
      organizationId,
      stageId: id,
      expectedVersion: Number(expectedVersion),
      patch: patch as never,
    });
    return NextResponse.json({ stage });
  } catch (error) {
    console.error('CRM pipeline update failed', error);
    return NextResponse.json({ error: 'CRM pipeline update failed' }, { status: mutationStatus(error) });
  }
}

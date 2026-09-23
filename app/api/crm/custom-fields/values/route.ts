import { NextResponse } from 'next/server';
import {
  createCustomFieldValue,
  CustomFieldMutationError,
  listCustomFieldValues,
  updateCustomFieldValue,
  type CustomFieldEntityType,
  type CustomFieldValueState,
  type TypedCustomFieldValue,
} from '@/lib/crm/custom-fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_TYPES: CustomFieldEntityType[] = ['LEAD','DEAL'];
const STATES: CustomFieldValueState[] = ['SET','CLEARED'];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function parseBool(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}
function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value,10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed,1),100) : null;
}
function parseTypedValue(value: unknown): TypedCustomFieldValue | null {
  if (!isObject(value)) return null;
  const allowed = new Set([
    'text','number','boolean','date','datetime',
    'currencyAmount','currencyCode','optionKeys',
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) return null;

  if (value.text !== undefined && value.text !== null && typeof value.text !== 'string') return null;
  if (value.number !== undefined && value.number !== null && typeof value.number !== 'number') return null;
  if (value.boolean !== undefined && value.boolean !== null && typeof value.boolean !== 'boolean') return null;
  if (value.date !== undefined && value.date !== null && typeof value.date !== 'string') return null;
  if (value.datetime !== undefined && value.datetime !== null && typeof value.datetime !== 'string') return null;
  if (value.currencyAmount !== undefined && value.currencyAmount !== null && typeof value.currencyAmount !== 'number') return null;
  if (value.currencyCode !== undefined && value.currencyCode !== null && typeof value.currencyCode !== 'string') return null;
  if (value.optionKeys !== undefined && value.optionKeys !== null
      && (!Array.isArray(value.optionKeys) || value.optionKeys.some(v => typeof v !== 'string'))) return null;

  const slots = [
    value.text,
    value.number,
    value.boolean,
    value.date,
    value.datetime,
    value.currencyAmount,
    Array.isArray(value.optionKeys) && value.optionKeys.length > 0 ? value.optionKeys : null,
  ].filter(v => v !== undefined && v !== null).length;

  if (slots !== 1) return null;
  return value as TypedCustomFieldValue;
}
function statusFor(error: unknown) {
  if (error instanceof CustomFieldMutationError) {
    if (error.code === 'NOT_FOUND') return 404;
    return 409;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  if (/unique|duplicate|already exists/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const entityType = url.searchParams.get('entityType');
  const entityId = url.searchParams.get('entityId')?.trim() ?? '';
  const includeCleared = parseBool(url.searchParams.get('includeCleared'), false);
  const limit = parseLimit(url.searchParams.get('limit'));
  const afterDefinitionId = url.searchParams.get('afterDefinitionId');
  const afterId = url.searchParams.get('afterId');

  if (!isUuid(organizationId)
      || !ENTITY_TYPES.includes(entityType as CustomFieldEntityType)
      || !isUuid(entityId)
      || includeCleared === null
      || limit === null
      || ((afterDefinitionId === null) !== (afterId === null))
      || (afterDefinitionId !== null && !isUuid(afterDefinitionId))
      || (afterId !== null && !isUuid(afterId))) {
    return NextResponse.json({ error: 'Invalid custom-field value query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await listCustomFieldValues({
      supabase,
      organizationId,
      entityType: entityType as CustomFieldEntityType,
      entityId,
      includeCleared,
      limit,
      cursor: afterDefinitionId && afterId
        ? { definitionId: afterDefinitionId, id: afterId }
        : null,
    });
    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Custom-field value query failed', error);
    return NextResponse.json(
      { error: 'Custom-field value query failed' },
      { status: statusFor(error) },
    );
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
  const definitionId = body.definitionId;
  const entityType = body.entityType;
  const entityId = body.entityId;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const value = parseTypedValue(body.value);

  if (!isUuid(organizationId) || !isUuid(definitionId)
      || !ENTITY_TYPES.includes(entityType as CustomFieldEntityType)
      || !isUuid(entityId)
      || requestKey.length < 1 || requestKey.length > 200
      || value === null) {
    return NextResponse.json({ error: 'Invalid custom-field value payload' }, { status: 400 });
  }

  try {
    const row = await createCustomFieldValue({
      supabase,
      organizationId,
      definitionId,
      actorUserId: auth.user.id,
      entityType: entityType as CustomFieldEntityType,
      entityId,
      value,
      requestKey,
    });
    return NextResponse.json({ value: row }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomFieldMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusFor(error) },
      );
    }
    console.error('Custom-field value create failed', error);
    return NextResponse.json(
      { error: 'Custom-field value create failed' },
      { status: statusFor(error) },
    );
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
  const valueId = body.valueId;
  const expectedVersion = body.expectedVersion;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const state = body.state;
  const typedValue = state === 'SET' ? parseTypedValue(body.value) : undefined;

  if (!isUuid(organizationId) || !isUuid(valueId)
      || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1
      || requestKey.length < 1 || requestKey.length > 200
      || !STATES.includes(state as CustomFieldValueState)
      || (state === 'SET' && typedValue === null)
      || (state === 'CLEARED' && body.value !== undefined)) {
    return NextResponse.json({ error: 'Invalid custom-field value update' }, { status: 400 });
  }

  try {
    const row = await updateCustomFieldValue({
      supabase,
      organizationId,
      valueId,
      actorUserId: auth.user.id,
      expectedVersion: Number(expectedVersion),
      requestKey,
      state: state as CustomFieldValueState,
      value: typedValue ?? undefined,
    });
    return NextResponse.json({ value: row });
  } catch (error) {
    if (error instanceof CustomFieldMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusFor(error) },
      );
    }
    console.error('Custom-field value update failed', error);
    return NextResponse.json(
      { error: 'Custom-field value update failed' },
      { status: statusFor(error) },
    );
  }
}

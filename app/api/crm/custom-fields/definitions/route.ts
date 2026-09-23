import { NextResponse } from 'next/server';
import {
  createCustomFieldDefinition,
  CustomFieldMutationError,
  listCustomFieldDefinitions,
  updateCustomFieldDefinition,
  type CustomFieldDataType,
  type CustomFieldEntityType,
  type CustomFieldSensitivity,
  type CustomFieldStatus,
  type TypedCustomFieldValue,
} from '@/lib/crm/custom-fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_TYPES: CustomFieldEntityType[] = ['LEAD','DEAL'];
const DATA_TYPES: CustomFieldDataType[] = [
  'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
  'SINGLE_SELECT','MULTI_SELECT','EMAIL','PHONE','URL','CURRENCY',
];
const SENSITIVITY: CustomFieldSensitivity[] = ['INTERNAL','PII','SENSITIVE'];
const STATUSES: CustomFieldStatus[] = ['ACTIVE','DEPRECATED'];

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
function mutationStatus(error: unknown) {
  if (error instanceof CustomFieldMutationError) {
    return error.code === 'NOT_FOUND' ? 404 : 409;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  if (/unique|duplicate/i.test(message)) return 409;
  return 500;
}
function typedDefault(value: unknown): TypedCustomFieldValue | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return undefined;
  const allowed = new Set([
    'text','number','boolean','date','datetime',
    'currencyAmount','currencyCode','optionKeys',
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) return undefined;
  if (value.text !== undefined && value.text !== null && typeof value.text !== 'string') return undefined;
  if (value.number !== undefined && value.number !== null && typeof value.number !== 'number') return undefined;
  if (value.boolean !== undefined && value.boolean !== null && typeof value.boolean !== 'boolean') return undefined;
  if (value.date !== undefined && value.date !== null && typeof value.date !== 'string') return undefined;
  if (value.datetime !== undefined && value.datetime !== null && typeof value.datetime !== 'string') return undefined;
  if (value.currencyAmount !== undefined && value.currencyAmount !== null && typeof value.currencyAmount !== 'number') return undefined;
  if (value.currencyCode !== undefined && value.currencyCode !== null && typeof value.currencyCode !== 'string') return undefined;
  if (value.optionKeys !== undefined && value.optionKeys !== null
      && (!Array.isArray(value.optionKeys) || value.optionKeys.some(v => typeof v !== 'string'))) return undefined;
  return value as TypedCustomFieldValue;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const entityType = url.searchParams.get('entityType');
  const includeDeprecated = parseBool(url.searchParams.get('includeDeprecated'), false);
  const limit = parseLimit(url.searchParams.get('limit'));
  const afterFieldKey = url.searchParams.get('afterFieldKey');
  const afterId = url.searchParams.get('afterId');

  if (!isUuid(organizationId)
      || (entityType !== null && !ENTITY_TYPES.includes(entityType as CustomFieldEntityType))
      || includeDeprecated === null
      || limit === null
      || (afterId !== null && !isUuid(afterId))
      || ((afterFieldKey === null) !== (afterId === null))) {
    return NextResponse.json({ error: 'Invalid custom-field definition query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await listCustomFieldDefinitions({
      supabase,
      organizationId,
      entityType: entityType as CustomFieldEntityType | null,
      includeDeprecated,
      limit,
      cursor: afterFieldKey && afterId ? { fieldKey: afterFieldKey, id: afterId } : null,
    });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Custom-field definition query failed', error);
    return NextResponse.json({ error: 'Custom-field definition query failed' }, { status: mutationStatus(error) });
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
  const entityType = body.entityType;
  const fieldKey = typeof body.fieldKey === 'string' ? body.fieldKey.trim().toLowerCase() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const dataType = body.dataType;
  const sensitivityClass = body.sensitivityClass ?? 'INTERNAL';
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const defaultValue = body.defaultValue === undefined ? undefined : typedDefault(body.defaultValue);

  if (!isUuid(organizationId)
      || !ENTITY_TYPES.includes(entityType as CustomFieldEntityType)
      || !/^[a-z][a-z0-9_]{0,63}$/.test(fieldKey)
      || label.length < 1 || label.length > 160
      || !DATA_TYPES.includes(dataType as CustomFieldDataType)
      || !SENSITIVITY.includes(sensitivityClass as CustomFieldSensitivity)
      || requestKey.length < 1 || requestKey.length > 200
      || (body.defaultValue !== undefined && defaultValue === undefined)
      || (body.required !== undefined && typeof body.required !== 'boolean')
      || (body.searchable !== undefined && typeof body.searchable !== 'boolean')
      || (body.filterable !== undefined && typeof body.filterable !== 'boolean')
      || (body.uniqueValue !== undefined && typeof body.uniqueValue !== 'boolean')
      || (body.textMinLength !== undefined && body.textMinLength !== null && !Number.isInteger(body.textMinLength))
      || (body.textMaxLength !== undefined && body.textMaxLength !== null && !Number.isInteger(body.textMaxLength))
      || (body.numberMin !== undefined && body.numberMin !== null && typeof body.numberMin !== 'number')
      || (body.numberMax !== undefined && body.numberMax !== null && typeof body.numberMax !== 'number')) {
    return NextResponse.json({ error: 'Invalid custom-field definition payload' }, { status: 400 });
  }

  try {
    const definition = await createCustomFieldDefinition({
      supabase,
      organizationId,
      actorUserId: auth.user.id,
      entityType: entityType as CustomFieldEntityType,
      fieldKey,
      label,
      dataType: dataType as CustomFieldDataType,
      required: body.required as boolean | undefined,
      sensitivityClass: sensitivityClass as CustomFieldSensitivity,
      searchable: body.searchable as boolean | undefined,
      filterable: body.filterable as boolean | undefined,
      uniqueValue: body.uniqueValue as boolean | undefined,
      textMinLength: body.textMinLength as number | null | undefined,
      textMaxLength: body.textMaxLength as number | null | undefined,
      numberMin: body.numberMin as number | null | undefined,
      numberMax: body.numberMax as number | null | undefined,
      defaultValue,
      requestKey,
    });
    return NextResponse.json({ definition }, { status: 201 });
  } catch (error) {
    console.error('Custom-field definition create failed', error);
    return NextResponse.json({ error: 'Custom-field definition create failed' }, { status: mutationStatus(error) });
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
  const definitionId = body.definitionId;
  const expectedVersion = body.expectedVersion;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const patch = body.patch;

  if (!isUuid(organizationId) || !isUuid(definitionId)
      || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1
      || requestKey.length < 1 || requestKey.length > 200
      || !isObject(patch) || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid custom-field definition update' }, { status: 400 });
  }

  const allowed = new Set([
    'label','required','sensitivityClass','searchable','filterable',
    'textMinLength','textMaxLength','numberMin','numberMax',
    'defaultValue','status',
  ]);
  if (Object.keys(patch).some(key => !allowed.has(key))) {
    return NextResponse.json({ error: 'Unsupported custom-field definition patch field' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (typeof patch.label !== 'string' || patch.label.trim().length < 1 || patch.label.trim().length > 160) {
      return NextResponse.json({ error: 'Invalid label' }, { status: 400 });
    }
    update.label = patch.label.trim();
  }
  if (patch.required !== undefined) {
    if (typeof patch.required !== 'boolean') return NextResponse.json({ error: 'Invalid required' }, { status: 400 });
    update.required = patch.required;
  }
  if (patch.sensitivityClass !== undefined) {
    if (!SENSITIVITY.includes(patch.sensitivityClass as CustomFieldSensitivity)) return NextResponse.json({ error: 'Invalid sensitivity' }, { status: 400 });
    update.sensitivity_class = patch.sensitivityClass;
  }
  for (const [api, db] of [['searchable','searchable'],['filterable','filterable']] as const) {
    if (patch[api] !== undefined) {
      if (typeof patch[api] !== 'boolean') return NextResponse.json({ error: `Invalid ${api}` }, { status: 400 });
      update[db] = patch[api];
    }
  }
  for (const [api, db] of [['textMinLength','text_min_length'],['textMaxLength','text_max_length']] as const) {
    if (patch[api] !== undefined) {
      if (patch[api] !== null && !Number.isInteger(patch[api])) return NextResponse.json({ error: `Invalid ${api}` }, { status: 400 });
      update[db] = patch[api];
    }
  }
  for (const [api, db] of [['numberMin','number_min'],['numberMax','number_max']] as const) {
    if (patch[api] !== undefined) {
      if (patch[api] !== null && typeof patch[api] !== 'number') return NextResponse.json({ error: `Invalid ${api}` }, { status: 400 });
      update[db] = patch[api];
    }
  }
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as CustomFieldStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    update.status = patch.status;
  }
  if (patch.defaultValue !== undefined) {
    const value = typedDefault(patch.defaultValue);
    if (value === undefined) return NextResponse.json({ error: 'Invalid defaultValue' }, { status: 400 });
    update.default_text = value.text ?? null;
    update.default_number = value.number ?? null;
    update.default_boolean = value.boolean ?? null;
    update.default_date = value.date ?? null;
    update.default_datetime = value.datetime ?? null;
    update.default_currency_amount = value.currencyAmount ?? null;
    update.default_currency_code = value.currencyCode ?? null;
    update.default_option_keys = value.optionKeys ?? null;
  }

  try {
    const definition = await updateCustomFieldDefinition({
      supabase,
      organizationId,
      definitionId,
      actorUserId: auth.user.id,
      expectedVersion: Number(expectedVersion),
      requestKey,
      patch: update,
    });
    return NextResponse.json({ definition });
  } catch (error) {
    if (error instanceof CustomFieldMutationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: mutationStatus(error) });
    }
    console.error('Custom-field definition update failed', error);
    return NextResponse.json({ error: 'Custom-field definition update failed' }, { status: mutationStatus(error) });
  }
}

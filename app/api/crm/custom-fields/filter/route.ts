import { NextResponse } from 'next/server';
import {
  exactFilterCustomField,
  type TypedCustomFieldValue,
} from '@/lib/crm/custom-fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function parseTypedFilter(value: unknown): TypedCustomFieldValue | null {
  if (!isObject(value)) return null;
  const allowed = new Set([
    'text','number','boolean','date','datetime','currencyAmount','currencyCode',
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) return null;

  if (value.text !== undefined && value.text !== null && typeof value.text !== 'string') return null;
  if (value.number !== undefined && value.number !== null && typeof value.number !== 'number') return null;
  if (value.boolean !== undefined && value.boolean !== null && typeof value.boolean !== 'boolean') return null;
  if (value.date !== undefined && value.date !== null && typeof value.date !== 'string') return null;
  if (value.datetime !== undefined && value.datetime !== null && typeof value.datetime !== 'string') return null;
  if (value.currencyAmount !== undefined && value.currencyAmount !== null && typeof value.currencyAmount !== 'number') return null;
  if (value.currencyCode !== undefined && value.currencyCode !== null && typeof value.currencyCode !== 'string') return null;

  const scalarSlots = [
    value.text,
    value.number,
    value.boolean,
    value.date,
    value.datetime,
    value.currencyAmount,
  ].filter(v => v !== undefined && v !== null).length;

  if (scalarSlots !== 1) return null;
  if (value.currencyCode !== undefined && value.currencyAmount === undefined) return null;

  return value as TypedCustomFieldValue;
}
function parseLimit(value: unknown) {
  if (value === undefined) return 50;
  if (!Number.isInteger(value)) return null;
  return Math.min(Math.max(Number(value), 1), 100);
}
function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  if (/not filterable/i.test(message)) return 409;
  return 500;
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
  const optionKey = typeof body.optionKey === 'string'
    ? body.optionKey.trim().toLowerCase()
    : null;
  const value = body.value === undefined ? {} : parseTypedFilter(body.value);
  const limit = parseLimit(body.limit);
  const afterEntityId = body.afterEntityId ?? null;

  const hasOption = optionKey !== null && optionKey.length > 0;
  const hasTyped = value !== null && Object.keys(value).length > 0;

  if (!isUuid(organizationId) || !isUuid(definitionId)
      || limit === null
      || (afterEntityId !== null && !isUuid(afterEntityId))
      || (hasOption === hasTyped)
      || (optionKey !== null && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(optionKey))) {
    return NextResponse.json({ error: 'Invalid custom-field exact filter' }, { status: 400 });
  }

  try {
    const items = await exactFilterCustomField({
      supabase,
      organizationId,
      definitionId,
      value: hasTyped ? value as TypedCustomFieldValue : {},
      optionKey: hasOption ? optionKey : null,
      limit,
      afterEntityId: afterEntityId as string | null,
    });
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Custom-field exact filter failed', error);
    return NextResponse.json(
      { error: 'Custom-field exact filter failed' },
      { status: statusFor(error) },
    );
  }
}

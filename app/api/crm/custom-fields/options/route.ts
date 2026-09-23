import { NextResponse } from 'next/server';
import {
  createCustomFieldOption,
  CustomFieldMutationError,
  listCustomFieldOptions,
  updateCustomFieldOption,
  type CustomFieldStatus,
} from '@/lib/crm/custom-fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
function statusFor(error: unknown) {
  if (error instanceof CustomFieldMutationError) {
    return error.code === 'NOT_FOUND' ? 404 : 409;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  if (/unique|duplicate/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const definitionId = url.searchParams.get('definitionId')?.trim() ?? '';
  const includeDeprecated = parseBool(url.searchParams.get('includeDeprecated'), false);

  if (!isUuid(organizationId) || !isUuid(definitionId) || includeDeprecated === null) {
    return NextResponse.json({ error: 'Invalid custom-field option query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const items = await listCustomFieldOptions({
      supabase,
      organizationId,
      definitionId,
      includeDeprecated,
    });
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Custom-field option query failed', error);
    return NextResponse.json(
      { error: 'Custom-field option query failed' },
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
  const optionKey = typeof body.optionKey === 'string' ? body.optionKey.trim().toLowerCase() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const position = body.position;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';

  if (!isUuid(organizationId) || !isUuid(definitionId)
      || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(optionKey)
      || label.length < 1 || label.length > 160
      || !Number.isInteger(position) || Number(position) < 1
      || requestKey.length < 1 || requestKey.length > 200) {
    return NextResponse.json({ error: 'Invalid custom-field option payload' }, { status: 400 });
  }

  try {
    const option = await createCustomFieldOption({
      supabase,
      organizationId,
      definitionId,
      actorUserId: auth.user.id,
      optionKey,
      label,
      position: Number(position),
      requestKey,
    });
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    console.error('Custom-field option create failed', error);
    return NextResponse.json(
      { error: 'Custom-field option create failed' },
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
  const optionId = body.optionId;
  const expectedVersion = body.expectedVersion;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const patch = body.patch;

  if (!isUuid(organizationId) || !isUuid(optionId)
      || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1
      || requestKey.length < 1 || requestKey.length > 200
      || !isObject(patch) || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid custom-field option update' }, { status: 400 });
  }

  const allowed = new Set(['label','position','status']);
  if (Object.keys(patch).some(key => !allowed.has(key))) {
    return NextResponse.json({ error: 'Unsupported custom-field option patch field' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (typeof patch.label !== 'string' || patch.label.trim().length < 1 || patch.label.trim().length > 160) {
      return NextResponse.json({ error: 'Invalid option label' }, { status: 400 });
    }
    update.label = patch.label.trim();
  }
  if (patch.position !== undefined) {
    if (!Number.isInteger(patch.position) || Number(patch.position) < 1) {
      return NextResponse.json({ error: 'Invalid option position' }, { status: 400 });
    }
    update.position = Number(patch.position);
  }
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as CustomFieldStatus)) {
      return NextResponse.json({ error: 'Invalid option status' }, { status: 400 });
    }
    update.status = patch.status;
  }

  try {
    const option = await updateCustomFieldOption({
      supabase,
      organizationId,
      optionId,
      actorUserId: auth.user.id,
      expectedVersion: Number(expectedVersion),
      requestKey,
      patch: update,
    });
    return NextResponse.json({ option });
  } catch (error) {
    if (error instanceof CustomFieldMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusFor(error) },
      );
    }
    console.error('Custom-field option update failed', error);
    return NextResponse.json(
      { error: 'Custom-field option update failed' },
      { status: statusFor(error) },
    );
  }
}

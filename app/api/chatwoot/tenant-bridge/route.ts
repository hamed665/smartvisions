import { NextResponse } from 'next/server';
import {
  ChatwootTenantBridgeError,
  createChatwootAccountMapping,
  createCommunicationChannelBinding,
  isUuid,
  listChatwootTenantBridge,
  normalizeChatwootAccountId,
  normalizeChatwootErrorCode,
  normalizeRequestKey,
  setChatwootAccountMappingState,
  setCommunicationChannelBindingLifecycle,
  type ChatwootAccountMappingStatus,
  type CommunicationBindingStatus,
  type CommunicationChannel,
} from '@/lib/chatwoot/tenant-bridge';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : null;
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function mutationStatus(error: unknown) {
  if (error instanceof ChatwootTenantBridgeError) {
    if (error.code === 'NOT_FOUND') return 404;
    if (error.code === 'VERSION_CONFLICT' || error.code === 'CONFLICT') return 409;
    if (error.code === 'FORBIDDEN') return 403;
    return 400;
  }
  return 500;
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const tenantBusinessId = url.searchParams.get('tenantBusinessId')?.trim() || null;
  const includeArchived = parseBoolean(url.searchParams.get('includeArchived'), false);
  const limit = parseLimit(url.searchParams.get('limit'));

  if (
    !isUuid(organizationId)
    || (tenantBusinessId !== null && !isUuid(tenantBusinessId))
    || includeArchived === null
    || limit === null
  ) {
    return NextResponse.json({ error: 'Invalid Chatwoot tenant bridge query' }, { status: 400 });
  }

  try {
    const result = await listChatwootTenantBridge({
      supabase,
      organizationId,
      tenantBusinessId,
      includeArchived,
      limit,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Chatwoot tenant bridge query failed', error);
    return NextResponse.json(
      { error: 'Chatwoot tenant bridge query failed' },
      { status: mutationStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
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

  const mode = body.mode;
  const organizationId = body.organizationId;
  const tenantBusinessId = body.tenantBusinessId;
  const requestKey = normalizeRequestKey(body.requestKey);

  if (!isUuid(organizationId) || !isUuid(tenantBusinessId) || !requestKey) {
    return NextResponse.json({ error: 'Invalid Chatwoot tenant bridge payload' }, { status: 400 });
  }

  try {
    if (mode === 'CHANNEL_BINDING') {
      const branchId = body.branchId === null || body.branchId === undefined
        ? null
        : body.branchId;
      const integrationConnectionId = body.integrationConnectionId;
      const channel = typeof body.channel === 'string' ? body.channel.trim().toUpperCase() : '';

      if (
        (branchId !== null && !isUuid(branchId))
        || !isUuid(integrationConnectionId)
        || (channel !== 'EMAIL' && channel !== 'WHATSAPP')
      ) {
        return NextResponse.json({ error: 'Invalid communication binding payload' }, { status: 400 });
      }

      const binding = await createCommunicationChannelBinding({
        supabase,
        organizationId,
        tenantBusinessId,
        branchId: branchId as string | null,
        integrationConnectionId,
        channel: channel as CommunicationChannel,
        requestKey,
      });

      return NextResponse.json({ binding }, { status: 201 });
    }

    if (mode === 'ACCOUNT_MAPPING') {
      const accountMapping = await createChatwootAccountMapping({
        supabase,
        organizationId,
        tenantBusinessId,
        requestKey,
      });

      return NextResponse.json({ accountMapping }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported Chatwoot tenant bridge create mode' }, { status: 400 });
  } catch (error) {
    console.error('Chatwoot tenant bridge create failed', error);
    return NextResponse.json(
      { error: 'Chatwoot tenant bridge create failed' },
      { status: mutationStatus(error) },
    );
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
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

  const mode = body.mode;
  const organizationId = body.organizationId;
  const expectedVersion = body.expectedVersion;
  const requestKey = normalizeRequestKey(body.requestKey);

  if (
    !isUuid(organizationId)
    || !Number.isInteger(expectedVersion)
    || Number(expectedVersion) < 1
    || !requestKey
  ) {
    return NextResponse.json({ error: 'Invalid Chatwoot tenant bridge update payload' }, { status: 400 });
  }

  try {
    if (mode === 'CHANNEL_BINDING_LIFECYCLE') {
      const bindingId = body.bindingId;
      const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';

      if (!isUuid(bindingId) || (status !== 'ACTIVE' && status !== 'ARCHIVED')) {
        return NextResponse.json({ error: 'Invalid communication binding lifecycle payload' }, { status: 400 });
      }

      const binding = await setCommunicationChannelBindingLifecycle({
        supabase,
        organizationId,
        bindingId,
        expectedVersion: Number(expectedVersion),
        status: status as CommunicationBindingStatus,
        requestKey,
      });

      return NextResponse.json({ binding });
    }

    if (mode === 'ACCOUNT_MAPPING_STATE') {
      const mappingId = body.mappingId;
      const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
      const chatwootAccountId = normalizeChatwootAccountId(body.chatwootAccountId);
      const lastErrorCode = normalizeChatwootErrorCode(body.lastErrorCode);

      if (
        !isUuid(mappingId)
        || !['PROVISIONING', 'ACTIVE', 'DEGRADED', 'ARCHIVED'].includes(status)
        || (body.chatwootAccountId !== undefined && body.chatwootAccountId !== null
          && chatwootAccountId === null)
        || (body.lastErrorCode !== undefined && body.lastErrorCode !== null
          && body.lastErrorCode !== '' && lastErrorCode === null)
      ) {
        return NextResponse.json({ error: 'Invalid Chatwoot Account mapping payload' }, { status: 400 });
      }

      const accountMapping = await setChatwootAccountMappingState({
        supabase,
        organizationId,
        mappingId,
        expectedVersion: Number(expectedVersion),
        status: status as ChatwootAccountMappingStatus,
        chatwootAccountId,
        lastErrorCode,
        requestKey,
      });

      return NextResponse.json({ accountMapping });
    }

    return NextResponse.json({ error: 'Unsupported Chatwoot tenant bridge update mode' }, { status: 400 });
  } catch (error) {
    console.error('Chatwoot tenant bridge update failed', error);
    return NextResponse.json(
      { error: 'Chatwoot tenant bridge update failed' },
      { status: mutationStatus(error) },
    );
  }
}

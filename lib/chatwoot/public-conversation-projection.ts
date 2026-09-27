import 'server-only';

import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readChatwootVaultSecret } from './vault';

type ProjectionContext = {
  inboxIdentifier: string;
  sourceId: string;
  hmacToken: string;
};

type PublicContact = { source_id?: string; id?: number; name?: string | null };
type PublicConversation = { id?: number; uuid?: string; inbox_id?: number; status?: string };

function baseUrl() {
  const raw = process.env.CHATWOOT_BASE_URL?.trim();
  if (!raw) throw new Error('Chatwoot base URL is not configured');
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('Chatwoot base URL must use HTTPS');
  }
  return url.origin;
}

function hmac(token: string, identifier: string) {
  return createHmac('sha256', token).update(identifier).digest('hex');
}

class PublicProjectionHttpError extends Error { constructor(readonly status: number) { super(`Chatwoot public projection request failed (${status})`); } }

async function request<T>(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(new URL(path, baseUrl()), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new PublicProjectionHttpError(response.status);
  return await response.json() as T;
}

async function context(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  bindingId: string;
  canonicalIdentityId: string;
}): Promise<ProjectionContext> {
  const mapping = await input.service.from('chatwoot_inbox_mappings')
    .select('id,organization_id,tenant_business_id,communication_channel_binding_id,chatwoot_channel_identifier,hmac_token_ref,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('communication_channel_binding_id', input.bindingId)
    .eq('status', 'ACTIVE')
    .single();
  if (mapping.error || !mapping.data?.chatwoot_channel_identifier || !mapping.data.hmac_token_ref) {
    throw new Error('ACTIVE Chatwoot API Inbox projection is required');
  }
  const token = await readChatwootVaultSecret(mapping.data.hmac_token_ref);
  return {
    inboxIdentifier: mapping.data.chatwoot_channel_identifier,
    sourceId: `sv:${input.bindingId}:${input.canonicalIdentityId}`,
    hmacToken: token,
  };
}

async function getContact(ctx: ProjectionContext, fetchImpl?: typeof fetch) {
  const identifierHash = hmac(ctx.hmacToken, ctx.sourceId);
  const query = new URLSearchParams({ identifier: ctx.sourceId, identifier_hash: identifierHash });
  try {
    return await request<PublicContact>(
      `/public/api/v1/inboxes/${encodeURIComponent(ctx.inboxIdentifier)}/contacts/${encodeURIComponent(ctx.sourceId)}?${query}`,
      undefined,
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof PublicProjectionHttpError && error.status === 404) return null;
    throw error;
  }
}

async function createOrReconcileContact(ctx: ProjectionContext, contactDisplayName: string, fetchImpl?: typeof fetch) {
  const existing = await getContact(ctx, fetchImpl);
  if (existing?.source_id === ctx.sourceId) return existing;
  const body = {
    source_id: ctx.sourceId,
    identifier: ctx.sourceId,
    identifier_hash: hmac(ctx.hmacToken, ctx.sourceId),
    name: contactDisplayName,
  };
  try {
    const created = await request<PublicContact>(
      `/public/api/v1/inboxes/${encodeURIComponent(ctx.inboxIdentifier)}/contacts`,
      { method: 'POST', body: JSON.stringify(body) },
      fetchImpl,
    );
    if (created.source_id !== ctx.sourceId) throw new Error('Chatwoot contact source mismatch');
    return created;
  } catch (error) {
    const reconciled = await getContact(ctx, fetchImpl);
    if (reconciled?.source_id === ctx.sourceId) return reconciled;
    throw error;
  }
}

async function conversations(ctx: ProjectionContext, fetchImpl?: typeof fetch) {
  const value = await request<PublicConversation[]>(
    `/public/api/v1/inboxes/${encodeURIComponent(ctx.inboxIdentifier)}/contacts/${encodeURIComponent(ctx.sourceId)}/conversations`,
    undefined,
    fetchImpl,
  );
  return Array.isArray(value) ? value : [];
}

function activeConversation(rows: PublicConversation[]) {
  const active = rows.filter(row => ['open','pending','snoozed'].includes(String(row.status).toLowerCase()));
  if (active.length > 1) throw new Error('Multiple active Chatwoot conversations exist for canonical identity');
  return active[0] ?? null;
}

export async function ensureChatwootPublicConversationProjection(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  bindingId: string;
  canonicalIdentityId: string;
  fetchImpl?: typeof fetch;
  contactDisplayName?: string;
}) {
  const ctx = await context(input);
  const contactDisplayName = input.contactDisplayName?.trim().slice(0, 120) || 'Customer';
  const contact = await createOrReconcileContact(ctx, contactDisplayName, input.fetchImpl);
  const existing = activeConversation(await conversations(ctx, input.fetchImpl));
  if (existing) return { contactSourceId: ctx.sourceId, contact, conversation: existing, outcome: 'RECONCILED_EXISTING' as const };

  try {
    const created = await request<PublicConversation>(
      `/public/api/v1/inboxes/${encodeURIComponent(ctx.inboxIdentifier)}/contacts/${encodeURIComponent(ctx.sourceId)}/conversations`,
      { method: 'POST', body: JSON.stringify({ custom_attributes: {
        smartvisions_projection: true,
        smartvisions_binding_id: input.bindingId,
        smartvisions_identity_id: input.canonicalIdentityId,
      } }) },
      input.fetchImpl,
    );
    if (!Number.isInteger(created.id) || Number(created.id) <= 0) throw new Error('Chatwoot conversation response is invalid');
    return { contactSourceId: ctx.sourceId, contact, conversation: created, outcome: 'CREATED' as const };
  } catch (error) {
    const reconciled = activeConversation(await conversations(ctx, input.fetchImpl));
    if (reconciled && Number.isInteger(reconciled.id) && Number(reconciled.id) > 0) {
      return { contactSourceId: ctx.sourceId, contact, conversation: reconciled, outcome: 'RECONCILED_AFTER_AMBIGUOUS_CREATE' as const };
    }
    throw error;
  }
}

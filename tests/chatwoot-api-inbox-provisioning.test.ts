import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { adminRequest, vaultCreate, serviceFactory } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  vaultCreate: vi.fn(),
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/chatwoot/account-admin-request', () => ({
  chatwootAdminAccountRequest: adminRequest,
}));

vi.mock('@/lib/chatwoot/vault', () => ({
  createChatwootVaultSecret: vaultCreate,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { provisionChatwootApiInbox } from '@/lib/chatwoot/api-inbox-provisioning';

const ORG = '00000000-0000-4000-8000-000000001201';
const BUSINESS = '00000000-0000-4000-8000-000000001202';
const BRANCH = '00000000-0000-4000-8000-000000001203';
const BINDING = '00000000-0000-4000-8000-000000001204';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000001205';
const INBOX_MAPPING = '00000000-0000-4000-8000-000000001206';
const RECEIPT = '00000000-0000-4000-8000-000000001207';

const WEBHOOK_URL =
  `https://app.example.com/api/chatwoot/webhook/${INBOX_MAPPING}`;

function mapping(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INBOX_MAPPING,
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    branch_id: BRANCH,
    communication_channel_binding_id: BINDING,
    chatwoot_account_mapping_id: ACCOUNT_MAPPING,
    chatwoot_inbox_id: null,
    chatwoot_channel_identifier: null,
    status: 'PROVISIONING',
    version: 1,
    last_request_key: 'inbox-flow:create',
    webhook_secret_ref: null,
    hmac_token_ref: null,
    ...overrides,
  };
}

function inboxResponse() {
  return {
    id: 701,
    name: 'Smart Visions API Inbox',
    channel_type: 'Channel::Api',
    webhook_url: WEBHOOK_URL,
    inbox_identifier: 'channel-identifier-701',
    secret: 'plain-webhook-secret',
    hmac_token: 'plain-hmac-token',
    additional_attributes: {
      smartvisions_projection: true,
      smartvisions_inbox_mapping_id: INBOX_MAPPING,
      smartvisions_tenant_business_id: BUSINESS,
      smartvisions_projection_version: '1',
    },
  };
}

function setupSupabase(input?: { createMapping?: Record<string, unknown> }) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'create_chatwoot_inbox_mapping') {
      return {
        data: input?.createMapping ?? mapping(),
        error: null,
      };
    }
    if (name === 'activate_chatwoot_inbox_mapping_verified') {
      return {
        data: mapping({
          chatwoot_inbox_id: 701,
          chatwoot_channel_identifier: 'channel-identifier-701',
          status: 'ACTIVE',
          version: Number(args.p_expected_version) + 1,
          last_request_key: args.p_request_key,
          webhook_secret_ref:
            'secretref://supabase-vault/00000000-0000-4000-8000-000000001208',
          hmac_token_ref:
            'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
        }),
        error: null,
      };
    }
    throw new Error(`unexpected auth RPC ${name}`);
  });

  return {
    supabase: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function setupService() {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'record_chatwoot_inbox_reconciliation') {
      throw new Error(`unexpected service RPC ${name}`);
    }
    return {
      data: {
        id: RECEIPT,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        inbox_mapping_id: INBOX_MAPPING,
        mapping_version: 1,
        observed_chatwoot_inbox_id: 701,
        observed_channel_identifier: 'channel-identifier-701',
        observed_webhook_url: WEBHOOK_URL,
        webhook_secret_ref:
          'secretref://supabase-vault/00000000-0000-4000-8000-000000001208',
        hmac_token_ref:
          'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
        request_key: args.p_request_key,
      },
      error: null,
    };
  });
  serviceFactory.mockReturnValue({ rpc });
  return rpc;
}

function input(supabase: SupabaseClient) {
  return {
    supabase,
    organizationId: ORG,
    tenantBusinessId: BUSINESS,
    branchId: BRANCH,
    communicationChannelBindingId: BINDING,
    chatwootAccountMappingId: ACCOUNT_MAPPING,
    projectedName: 'Smart Visions API Inbox',
    requestKey: 'inbox-flow',
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  adminRequest.mockReset();
  vaultCreate.mockReset();
  serviceFactory.mockReset();
});

describe('C4 API Inbox provisioning', () => {
  it('GET-reconciles first, creates once, Vault-captures secrets, receipts, then activates', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase, rpc } = setupSupabase();
    const serviceRpc = setupService();

    adminRequest
      .mockResolvedValueOnce({ payload: [] })
      .mockResolvedValueOnce(inboxResponse());

    vaultCreate.mockImplementation(async (args: { name: string }) =>
      args.name.endsWith('/webhook-secret')
        ? 'secretref://supabase-vault/00000000-0000-4000-8000-000000001208'
        : 'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
    );

    const result = await provisionChatwootApiInbox(input(supabase));

    expect(result.outcome).toBe('CREATED');
    expect(result.mapping).toMatchObject({
      id: INBOX_MAPPING,
      status: 'ACTIVE',
      chatwoot_inbox_id: 701,
    });
    expect(JSON.stringify(result)).not.toContain('plain-webhook-secret');
    expect(JSON.stringify(result)).not.toContain('plain-hmac-token');

    expect(adminRequest).toHaveBeenCalledTimes(2);
    expect(adminRequest.mock.calls[0]?.[0]).toMatchObject({
      resourcePath: '/inboxes',
      method: 'GET',
    });
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/inboxes',
      method: 'POST',
      body: {
        name: 'Smart Visions API Inbox',
        channel: {
          type: 'api',
          webhook_url: WEBHOOK_URL,
          hmac_mandatory: true,
          additional_attributes: {
            smartvisions_projection: true,
            smartvisions_inbox_mapping_id: INBOX_MAPPING,
            smartvisions_tenant_business_id: BUSINESS,
            smartvisions_projection_version: '1',
          },
        },
      },
    });

    expect(vaultCreate).toHaveBeenCalledTimes(2);
    expect(vaultCreate.mock.calls[0]?.[0]).toMatchObject({
      secret: 'plain-webhook-secret',
      name: `chatwoot/inbox/${INBOX_MAPPING}/webhook-secret`,
    });
    expect(vaultCreate.mock.calls[1]?.[0]).toMatchObject({
      secret: 'plain-hmac-token',
      name: `chatwoot/inbox/${INBOX_MAPPING}/hmac-token`,
    });

    expect(serviceRpc).toHaveBeenCalledTimes(1);
    const receiptArgs = serviceRpc.mock.calls[0]?.[1];
    expect(receiptArgs).toMatchObject({
      p_inbox_mapping_id: INBOX_MAPPING,
      p_observed_chatwoot_inbox_id: 701,
      p_observed_channel_identifier: 'channel-identifier-701',
      p_observed_webhook_url: WEBHOOK_URL,
    });
    expect(JSON.stringify(receiptArgs)).not.toContain('plain-webhook-secret');
    expect(JSON.stringify(receiptArgs)).not.toContain('plain-hmac-token');

    const activation = rpc.mock.calls.find(
      (call) => call[0] === 'activate_chatwoot_inbox_mapping_verified',
    );
    expect(activation?.[1]).toMatchObject({
      p_inbox_mapping_id: INBOX_MAPPING,
      p_expected_version: 1,
      p_receipt_id: RECEIPT,
    });
    expect(JSON.stringify(activation?.[1])).not.toContain('secret');
  });

  it('adopts an already-projected Inbox without POST', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase } = setupSupabase();
    setupService();
    adminRequest.mockResolvedValueOnce({ payload: [inboxResponse()] });
    vaultCreate
      .mockResolvedValueOnce(
        'secretref://supabase-vault/00000000-0000-4000-8000-000000001208',
      )
      .mockResolvedValueOnce(
        'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
      );

    const result = await provisionChatwootApiInbox(input(supabase));

    expect(result.outcome).toBe('RECONCILED_EXISTING');
    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(adminRequest.mock.calls[0]?.[0]?.method).toBe('GET');
  });

  it('uses GET-only reconciliation after an ambiguous create', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase } = setupSupabase();
    setupService();

    adminRequest
      .mockResolvedValueOnce({ payload: [] })
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_ERROR',
          message: 'create outcome unknown',
          retryable: true,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce({ payload: [inboxResponse()] });

    vaultCreate
      .mockResolvedValueOnce(
        'secretref://supabase-vault/00000000-0000-4000-8000-000000001208',
      )
      .mockResolvedValueOnce(
        'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
      );

    const result = await provisionChatwootApiInbox(input(supabase));

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_CREATE');
    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'POST',
      'GET',
    ]);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('fails closed on duplicate marker reconciliation', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase } = setupSupabase();

    adminRequest.mockResolvedValueOnce({
      payload: [inboxResponse(), { ...inboxResponse(), id: 702 }],
    });

    await expect(
      provisionChatwootApiInbox(input(supabase)),
    ).rejects.toMatchObject({ code: 'DUPLICATE_MATCH' });

    expect(vaultCreate).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('never activates when Vault capture fails after external creation', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase, rpc } = setupSupabase();

    adminRequest
      .mockResolvedValueOnce({ payload: [] })
      .mockResolvedValueOnce(inboxResponse());
    vaultCreate.mockRejectedValueOnce(new Error('vault failure'));

    await expect(
      provisionChatwootApiInbox(input(supabase)),
    ).rejects.toThrow('vault failure');

    expect(serviceFactory).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.some(
        (call) => call[0] === 'activate_chatwoot_inbox_mapping_verified',
      ),
    ).toBe(false);
  });

  it('returns an already ACTIVE mapping without external or Vault work', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'https://app.example.com');
    const { supabase } = setupSupabase({
      createMapping: mapping({
        status: 'ACTIVE',
        version: 2,
        chatwoot_inbox_id: 701,
        chatwoot_channel_identifier: 'channel-identifier-701',
        webhook_secret_ref:
          'secretref://supabase-vault/00000000-0000-4000-8000-000000001208',
        hmac_token_ref:
          'secretref://supabase-vault/00000000-0000-4000-8000-000000001209',
      }),
    });

    const result = await provisionChatwootApiInbox(input(supabase));

    expect(result.outcome).toBe('ALREADY_ACTIVE');
    expect(adminRequest).not.toHaveBeenCalled();
    expect(vaultCreate).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('fails before mapping claim when public webhook origin is missing/unsafe', async () => {
    const { supabase, rpc } = setupSupabase();

    await expect(
      provisionChatwootApiInbox(input(supabase)),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();

    vi.stubEnv('CHATWOOT_WEBHOOK_PUBLIC_ORIGIN', 'http://app.example.com');
    await expect(
      provisionChatwootApiInbox(input(supabase)),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

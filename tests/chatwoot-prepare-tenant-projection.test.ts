import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { createCommunicationChannelBinding, createChatwootAccountMapping } =
  vi.hoisted(() => ({
    createCommunicationChannelBinding: vi.fn(),
    createChatwootAccountMapping: vi.fn(),
  }));

vi.mock('@/lib/chatwoot/tenant-bridge', () => ({
  createCommunicationChannelBinding,
  createChatwootAccountMapping,
  isUuid: (value: unknown) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
}));

import {
  prepareChatwootTenantProjection,
} from '@/lib/chatwoot/prepare-tenant-projection';

const ORG = '00000000-0000-4000-8000-000000000301';
const BUSINESS = '00000000-0000-4000-8000-000000000302';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000303';
const EMAIL = '00000000-0000-4000-8000-000000000304';
const WHATSAPP = '00000000-0000-4000-8000-000000000305';

function queryResult(input: {
  business?: Record<string, unknown> | null;
  integrations?: Record<string, unknown>[];
  bindings?: Record<string, unknown>[];
  accountMapping?: Record<string, unknown> | null;
}) {
  return {
    from: vi.fn((table: string) => {
      const response =
        table === 'tenant_businesses'
          ? { data: input.business ?? null, error: null }
          : table === 'integration_connections'
            ? { data: input.integrations ?? [], error: null }
            : table === 'communication_channel_bindings'
              ? { data: input.bindings ?? [], error: null }
              : table === 'chatwoot_account_mappings'
                ? { data: input.accountMapping ?? null, error: null }
                : { data: null, error: { message: 'unexpected table' } };

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.in = vi.fn(chain);
      builder.maybeSingle = vi.fn(async () => response);
      builder.then = (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(response).then(resolve, reject);

      return builder;
    }),
  } as unknown as SupabaseClient;
}

function binding(input: {
  id: string;
  integrationConnectionId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  tenantBusinessId?: string;
}) {
  return {
    id: input.id,
    organization_id: ORG,
    tenant_business_id: input.tenantBusinessId ?? BUSINESS,
    branch_id: null,
    integration_connection_id: input.integrationConnectionId,
    channel: input.channel,
    status: 'ACTIVE',
    version: 1,
    last_request_key: 'existing',
    last_verified_at: null,
    last_error_code: null,
    created_by_user_id: '00000000-0000-4000-8000-000000000399',
    updated_by_user_id: '00000000-0000-4000-8000-000000000399',
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };
}

function accountMapping() {
  return {
    id: '00000000-0000-4000-8000-000000000310',
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    chatwoot_account_id: null,
    status: 'PROVISIONING',
    version: 1,
    last_request_key: 'existing-account',
    last_verified_at: null,
    last_error_code: null,
    created_by_user_id: '00000000-0000-4000-8000-000000000399',
    updated_by_user_id: '00000000-0000-4000-8000-000000000399',
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Chatwoot tenant projection preparation', () => {
  it('creates connected Email/WhatsApp bindings and one durable Account mapping without external provisioning', async () => {
    const supabase = queryResult({
      business: {
        id: BUSINESS,
        organization_id: ORG,
        name: 'Smart Visions',
        status: 'ACTIVE',
      },
      integrations: [
        { id: EMAIL, channel: 'EMAIL', enabled: true, status: 'CONNECTED' },
        {
          id: WHATSAPP,
          channel: 'WHATSAPP',
          enabled: true,
          status: 'CONNECTED',
        },
      ],
      bindings: [],
      accountMapping: null,
    });

    createCommunicationChannelBinding
      .mockResolvedValueOnce(
        binding({
          id: '00000000-0000-4000-8000-000000000311',
          integrationConnectionId: EMAIL,
          channel: 'EMAIL',
        }),
      )
      .mockResolvedValueOnce(
        binding({
          id: '00000000-0000-4000-8000-000000000312',
          integrationConnectionId: WHATSAPP,
          channel: 'WHATSAPP',
        }),
      );
    createChatwootAccountMapping.mockResolvedValue(accountMapping());

    const result = await prepareChatwootTenantProjection({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });

    expect(result.createdBindingCount).toBe(2);
    expect(result.createdAccountMapping).toBe(true);
    expect(createCommunicationChannelBinding).toHaveBeenCalledTimes(2);
    expect(createCommunicationChannelBinding).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        integrationConnectionId: EMAIL,
        channel: 'EMAIL',
        requestKey: `comm-tenant-bridge:${BUSINESS}:email:${EMAIL}:v1`,
      }),
    );
    expect(createChatwootAccountMapping).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      requestKey: `comm-tenant-bridge:${BUSINESS}:account-mapping:v1`,
    });
  });

  it('reuses an already prepared exact projection without creating duplicate rows', async () => {
    const emailBinding = binding({
      id: '00000000-0000-4000-8000-000000000311',
      integrationConnectionId: EMAIL,
      channel: 'EMAIL',
    });

    const supabase = queryResult({
      business: {
        id: BUSINESS,
        organization_id: ORG,
        name: 'Smart Visions',
        status: 'ACTIVE',
      },
      integrations: [
        { id: EMAIL, channel: 'EMAIL', enabled: true, status: 'CONNECTED' },
      ],
      bindings: [emailBinding],
      accountMapping: accountMapping(),
    });

    const result = await prepareChatwootTenantProjection({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });

    expect(result.createdBindingCount).toBe(0);
    expect(result.createdAccountMapping).toBe(false);
    expect(result.bindings).toEqual([emailBinding]);
    expect(createCommunicationChannelBinding).not.toHaveBeenCalled();
    expect(createChatwootAccountMapping).not.toHaveBeenCalled();
  });

  it('fails closed when an Organization integration is already bound to another tenant Business', async () => {
    const supabase = queryResult({
      business: {
        id: BUSINESS,
        organization_id: ORG,
        name: 'Smart Visions',
        status: 'ACTIVE',
      },
      integrations: [
        { id: EMAIL, channel: 'EMAIL', enabled: true, status: 'CONNECTED' },
      ],
      bindings: [
        binding({
          id: '00000000-0000-4000-8000-000000000311',
          integrationConnectionId: EMAIL,
          channel: 'EMAIL',
          tenantBusinessId: OTHER_BUSINESS,
        }),
      ],
      accountMapping: null,
    });

    await expect(
      prepareChatwootTenantProjection({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(createCommunicationChannelBinding).not.toHaveBeenCalled();
    expect(createChatwootAccountMapping).not.toHaveBeenCalled();
  });

  it('preflights all binding conflicts before creating any new binding', async () => {
    const supabase = queryResult({
      business: {
        id: BUSINESS,
        organization_id: ORG,
        name: 'Smart Visions',
        status: 'ACTIVE',
      },
      integrations: [
        { id: EMAIL, channel: 'EMAIL', enabled: true, status: 'CONNECTED' },
        {
          id: WHATSAPP,
          channel: 'WHATSAPP',
          enabled: true,
          status: 'CONNECTED',
        },
      ],
      bindings: [
        binding({
          id: '00000000-0000-4000-8000-000000000312',
          integrationConnectionId: WHATSAPP,
          channel: 'WHATSAPP',
          tenantBusinessId: OTHER_BUSINESS,
        }),
      ],
      accountMapping: null,
    });

    await expect(
      prepareChatwootTenantProjection({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(createCommunicationChannelBinding).not.toHaveBeenCalled();
    expect(createChatwootAccountMapping).not.toHaveBeenCalled();
  });

  it('requires at least one connected supported communication integration', async () => {
    const supabase = queryResult({
      business: {
        id: BUSINESS,
        organization_id: ORG,
        name: 'Smart Visions',
        status: 'ACTIVE',
      },
      integrations: [],
      bindings: [],
      accountMapping: null,
    });

    await expect(
      prepareChatwootTenantProjection({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(createCommunicationChannelBinding).not.toHaveBeenCalled();
    expect(createChatwootAccountMapping).not.toHaveBeenCalled();
  });
});

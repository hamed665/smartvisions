import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const {
  provisionAccount,
  provisionInbox,
  provisionOwnerAccess,
  createAccountMapping,
  serviceFactory,
} = vi.hoisted(() => ({
  provisionAccount: vi.fn(),
  provisionInbox: vi.fn(),
  provisionOwnerAccess: vi.fn(),
  createAccountMapping: vi.fn(),
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/chatwoot/account-orchestration', () => ({
  provisionChatwootAccount: provisionAccount,
}));

vi.mock('@/lib/chatwoot/api-inbox-provisioning', () => ({
  provisionChatwootApiInbox: provisionInbox,
}));

vi.mock('@/lib/chatwoot/owner-access-orchestration', () => ({
  provisionCurrentOwnerChatwootAccess: provisionOwnerAccess,
}));

vi.mock('@/lib/chatwoot/tenant-bridge', () => ({
  isUuid: (value: unknown) =>
    typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  createChatwootAccountMapping: createAccountMapping,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import { provisionWhatsAppChatwootProjection } from '@/lib/whatsapp/chatwoot-projection';

const ORG = '00000000-0000-4000-8000-000000005001';
const OWNER = '00000000-0000-4000-8000-000000005002';
const BUSINESS = '00000000-0000-4000-8000-000000005003';
const BINDING = '00000000-0000-4000-8000-000000005004';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000005005';
const INBOX_MAPPING = '00000000-0000-4000-8000-000000005006';

type QueryResult = { data: unknown; error: unknown };

function createQuery(result: () => QueryResult | Promise<QueryResult>) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result());
  query.insert = vi.fn(async () => ({ error: null }));
  return query;
}

function setupSupabase(input?: {
  ownerRole?: string;
  accountMapping?: Record<string, unknown> | null;
}) {
  const tables: Record<string, ReturnType<typeof createQuery>> = {
    organization_members: createQuery(() => ({
      data: { role: input?.ownerRole ?? 'OWNER' },
      error: null,
    })),
    communication_channel_bindings: createQuery(() => ({
      data: {
        id: BINDING,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        branch_id: null,
        channel: 'WHATSAPP',
        status: 'ACTIVE',
        provider: 'META',
        provider_account_id: 'waba-1',
        provider_destination_id: 'phone-1',
        provider_destination_label: '+96890000000',
        last_verified_at: '2026-10-01T15:00:00.000Z',
        last_error_code: null,
      },
      error: null,
    })),
    tenant_businesses: createQuery(() => ({
      data: {
        id: BUSINESS,
        name: 'Clinic',
        status: 'ACTIVE',
      },
      error: null,
    })),
    chatwoot_account_mappings: createQuery(() => ({
      data: input?.accountMapping === undefined
        ? {
            id: ACCOUNT_MAPPING,
            organization_id: ORG,
            tenant_business_id: BUSINESS,
            chatwoot_account_id: 501,
            status: 'ACTIVE',
            version: 2,
          }
        : input.accountMapping,
      error: null,
    })),
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: OWNER, email: 'owner@example.com' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      const query = tables[table];
      if (!query) throw new Error(`unexpected authenticated table ${table}`);
      return query;
    }),
  } as unknown as SupabaseClient;

  return { supabase };
}

function setupService(input?: { metaEvidence?: boolean; priorAudit?: boolean }) {
  const auditReads: QueryResult[] = [
    {
      data: input?.metaEvidence === false
        ? null
        : {
            id: 'audit-meta',
            created_at: '2026-10-01T15:01:00.000Z',
            after_data: {
              waba_id: 'waba-1',
              phone_number_id: 'phone-1',
              subscription_confirmed: true,
            },
          },
      error: null,
    },
    {
      data: input?.priorAudit ? { id: 'audit-chatwoot' } : null,
      error: null,
    },
  ];

  const auditQueries: ReturnType<typeof createQuery>[] = [];
  const service = {
    from: vi.fn((table: string) => {
      if (table !== 'audit_logs') throw new Error(`unexpected service table ${table}`);
      const q = createQuery(() => auditReads.shift() ?? { data: null, error: null });
      auditQueries.push(q);
      return q;
    }),
  } as unknown as SupabaseClient;

  serviceFactory.mockReturnValue(service);
  return { service, auditQueries };
}

beforeEach(() => {
  vi.clearAllMocks();

  provisionAccount.mockResolvedValue({
    id: ACCOUNT_MAPPING,
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    chatwoot_account_id: 501,
    status: 'ACTIVE',
    version: 2,
  });

  provisionOwnerAccess.mockResolvedValue({
    tenantBusinessId: BUSINESS,
    chatwootAccountId: 501,
    chatwootUserId: 601,
    userMappingStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    chatwootRole: 'administrator',
  });

  provisionInbox.mockResolvedValue({
    outcome: 'RECONCILED_EXISTING',
    mapping: {
      id: INBOX_MAPPING,
      organization_id: ORG,
      tenant_business_id: BUSINESS,
      branch_id: null,
      communication_channel_binding_id: BINDING,
      chatwoot_account_mapping_id: ACCOUNT_MAPPING,
      chatwoot_inbox_id: 701,
      chatwoot_channel_identifier: 'channel-701',
      status: 'ACTIVE',
      version: 2,
    },
  });

  createAccountMapping.mockResolvedValue({
    id: ACCOUNT_MAPPING,
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    chatwoot_account_id: null,
    status: 'PROVISIONING',
    version: 1,
  });
});

describe('WhatsApp to existing Chatwoot projection', () => {
  it('reuses canonical Meta and Chatwoot authorities for a business-wide binding', async () => {
    const { supabase } = setupSupabase();
    const { auditQueries } = setupService();

    const result = await provisionWhatsAppChatwootProjection({
      supabase,
      organizationId: ORG,
      bindingId: BINDING,
    });

    expect(result).toMatchObject({
      ok: true,
      bindingId: BINDING,
      accountMappingId: ACCOUNT_MAPPING,
      inboxMappingId: INBOX_MAPPING,
      chatwootInboxId: 701,
      outcome: 'RECONCILED_EXISTING',
      branchId: null,
    });

    expect(provisionAccount).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      mappingId: ACCOUNT_MAPPING,
    }));
    expect(provisionOwnerAccess).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    }));
    expect(provisionInbox).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      branchId: null,
      communicationChannelBindingId: BINDING,
      chatwootAccountMappingId: ACCOUNT_MAPPING,
    }));

    const insert = auditQueries[2]?.insert as ReturnType<typeof vi.fn>;
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: ORG,
      actor_type: 'USER',
      actor_id: OWNER,
      action: 'META_WHATSAPP_CHATWOOT_PROJECTED',
      entity_id: BINDING,
    }));
  });

  it('prepares the existing canonical Account mapping when none exists yet', async () => {
    const { supabase } = setupSupabase({ accountMapping: null });
    setupService();

    await provisionWhatsAppChatwootProjection({
      supabase,
      organizationId: ORG,
      bindingId: BINDING,
    });

    expect(createAccountMapping).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    }));
    expect(provisionAccount).toHaveBeenCalledWith(expect.objectContaining({
      mappingId: ACCOUNT_MAPPING,
    }));
  });

  it('fails before any Chatwoot mutation when Slice 4 provider evidence is absent', async () => {
    const { supabase } = setupSupabase();
    setupService({ metaEvidence: false });

    await expect(provisionWhatsAppChatwootProjection({
      supabase,
      organizationId: ORG,
      bindingId: BINDING,
    })).rejects.toMatchObject({
      code: 'RECONCILIATION_REQUIRED',
    });

    expect(createAccountMapping).not.toHaveBeenCalled();
    expect(provisionAccount).not.toHaveBeenCalled();
    expect(provisionOwnerAccess).not.toHaveBeenCalled();
    expect(provisionInbox).not.toHaveBeenCalled();
  });

  it('fails before provider work for a non-OWNER caller', async () => {
    const { supabase } = setupSupabase({ ownerRole: 'ADMIN' });
    setupService();

    await expect(provisionWhatsAppChatwootProjection({
      supabase,
      organizationId: ORG,
      bindingId: BINDING,
    })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });

    expect(provisionAccount).not.toHaveBeenCalled();
    expect(provisionInbox).not.toHaveBeenCalled();
  });
});

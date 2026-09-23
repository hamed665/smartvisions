import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { readBusinessWideChatwootRole } from '@/lib/chatwoot/membership-role';

const ORG = '00000000-0000-4000-8000-000000000101';
const BRAND = '00000000-0000-4000-8000-000000000102';
const BUSINESS = '00000000-0000-4000-8000-000000000103';
const OWNER = '00000000-0000-4000-8000-000000000104';
const MEMBER = '00000000-0000-4000-8000-000000000105';

type Assignment = {
  organization_id: string; user_id: string; scope_type: string;
  brand_id: string | null; tenant_business_id: string | null;
  role: string; attributes: Record<string, unknown>;
};

function scoped(scope: 'BRAND' | 'BUSINESS', role: string, attributes = {}): Assignment {
  return {
    organization_id: ORG, user_id: MEMBER, scope_type: scope,
    brand_id: scope === 'BRAND' ? BRAND : null,
    tenant_business_id: scope === 'BUSINESS' ? BUSINESS : null,
    role, attributes,
  };
}

function setup(input: {
  memberRole?: string;
  ownerRole?: string;
  brandStatus?: string;
  assignments?: Assignment[];
  assignmentError?: boolean;
  memberOrganizationId?: string;
}) {
  const reads: string[] = [];
  const assignmentFilters: string[] = [];
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: OWNER } }, error: null })) },
    from: vi.fn((table: string) => {
      reads.push(table);
      let userId: string | undefined;
      const builder = {
        select: () => builder,
        eq: (key: string, value: string) => {
          if (key === 'user_id') userId = value;
          return builder;
        },
        single: async () => {
          if (table === 'organization_members') {
            return { data: { organization_id: userId === MEMBER ? (input.memberOrganizationId ?? ORG) : ORG, user_id: userId, role: userId === OWNER ? (input.ownerRole ?? 'OWNER') : (input.memberRole ?? 'ADMIN') }, error: null };
          }
          if (table === 'tenant_businesses') {
            return { data: { id: BUSINESS, organization_id: ORG, brand_id: BRAND, status: 'ACTIVE' }, error: null };
          }
          if (table === 'brands') {
            return { data: { id: BRAND, organization_id: ORG, status: input.brandStatus ?? 'ACTIVE' }, error: null };
          }
          throw new Error('unexpected table');
        },
        or: (filter: string) => {
          assignmentFilters.push(filter);
          return builder;
        },
        limit: async () => ({
          data: input.assignments ?? [],
          error: input.assignmentError ? { message: 'permission denied' } : null,
        }),
      };
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { supabase, reads, assignmentFilters };
}

const args = { organizationId: ORG, tenantBusinessId: BUSINESS, smartUserId: MEMBER };

describe('Business-wide Chatwoot membership role read', () => {
  it('maps only a canonical Organization OWNER to administrator', async () => {
    const { supabase } = setup({});
    expect(await readBusinessWideChatwootRole({
      supabase, ...args, smartUserId: OWNER,
    })).toEqual({ effectiveSmartRole: 'OWNER', chatwootRole: 'administrator' });
  });

  it('keeps Organization ADMIN an agent, never Chatwoot administrator', async () => {
    const { supabase } = setup({});
    expect(await readBusinessWideChatwootRole({ supabase, ...args }))
      .toEqual({ effectiveSmartRole: 'ADMIN', chatwootRole: 'agent' });
  });

  it('takes the deepest Business assignment above a Brand assignment', async () => {
    const { supabase } = setup({
      memberRole: 'VIEWER',
      assignments: [scoped('BRAND', 'ADMIN'), scoped('BUSINESS', 'SALES_AGENT')],
    });
    expect(await readBusinessWideChatwootRole({ supabase, ...args }))
      .toEqual({ effectiveSmartRole: 'SALES_AGENT', chatwootRole: 'agent' });
  });

  it('does not grant an Organization VIEWER membership without applicable scope', async () => {
    const { supabase } = setup({ memberRole: 'VIEWER' });
    expect(await readBusinessWideChatwootRole({ supabase, ...args }))
      .toEqual({ effectiveSmartRole: 'VIEWER', chatwootRole: null });
  });

  it('does not elevate a conditional assignment without trusted policy attributes', async () => {
    const { supabase } = setup({
      memberRole: 'VIEWER',
      assignments: [scoped('BUSINESS', 'SALES_MANAGER', { certified: true })],
    });
    expect(await readBusinessWideChatwootRole({ supabase, ...args }))
      .toEqual({ effectiveSmartRole: 'VIEWER', chatwootRole: null });
  });

  it('rejects malformed or cross-tenant scope data instead of inferring a role', async () => {
    const malformed = { ...scoped('BUSINESS', 'ADMIN'), organization_id: OWNER };
    const { supabase } = setup({ assignments: [malformed] });
    await expect(readBusinessWideChatwootRole({ supabase, ...args }))
      .rejects.toThrow('unavailable');
  });

  it('rejects an assignment claiming OWNER and never projects its administrator role', async () => {
    const { supabase } = setup({
      memberRole: 'VIEWER', assignments: [scoped('BUSINESS', 'OWNER')],
    });
    await expect(readBusinessWideChatwootRole({ supabase, ...args }))
      .rejects.toThrow('unavailable');
  });

  it('queries only the exact Brand and Business and rejects an oversized result', async () => {
    const { supabase, assignmentFilters } = setup({
      assignments: [
        scoped('BRAND', 'ADMIN'),
        scoped('BUSINESS', 'SALES_AGENT'),
        scoped('BUSINESS', 'VIEWER'),
      ],
    });
    await expect(readBusinessWideChatwootRole({ supabase, ...args }))
      .rejects.toThrow('unavailable');
    expect(assignmentFilters).toEqual([
      `and(scope_type.eq.BRAND,brand_id.eq.${BRAND}),and(scope_type.eq.BUSINESS,tenant_business_id.eq.${BUSINESS})`,
    ]);
  });

  it('rejects a mismatched target Organization member row', async () => {
    const { supabase } = setup({ memberOrganizationId: BRAND });
    await expect(readBusinessWideChatwootRole({ supabase, ...args }))
      .rejects.toThrow('unavailable');
  });

  it('lets a Business VIEWER assignment suppress an Organization ADMIN membership', async () => {
    const { supabase } = setup({ assignments: [scoped('BUSINESS', 'VIEWER')] });
    expect(await readBusinessWideChatwootRole({ supabase, ...args }))
      .toEqual({ effectiveSmartRole: 'VIEWER', chatwootRole: null });
  });

  it('rejects a non-OWNER reader, archived Brand, or incomplete RLS read', async () => {
    for (const options of [
      { ownerRole: 'ADMIN' },
      { brandStatus: 'ARCHIVED' },
      { assignmentError: true },
    ]) {
      const { supabase } = setup(options);
      await expect(readBusinessWideChatwootRole({ supabase, ...args }))
        .rejects.toThrow('unavailable');
    }
  });
});

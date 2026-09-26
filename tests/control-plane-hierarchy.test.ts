import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { requireOrganizationOwner } = vi.hoisted(() => ({
  requireOrganizationOwner: vi.fn(),
}));

vi.mock('@/lib/business-os/control-plane-bootstrap', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/business-os/control-plane-bootstrap')
  >('@/lib/business-os/control-plane-bootstrap');

  return {
    ...actual,
    requireOrganizationOwner,
  };
});

import {
  bootstrapOperatingHierarchy,
} from '@/lib/business-os/control-plane-hierarchy';

const ORG = '00000000-0000-4000-8000-000000000501';
const USER = '00000000-0000-4000-8000-000000000502';
const BUSINESS = '00000000-0000-4000-8000-000000000503';
const BRANCH = '00000000-0000-4000-8000-000000000504';
const DEPARTMENT = '00000000-0000-4000-8000-000000000505';
const TEAM = '00000000-0000-4000-8000-000000000506';

type Row = Record<string, unknown>;

function fakeSupabase() {
  const state: Record<string, Row[]> = {
    tenant_businesses: [
      {
        id: BUSINESS,
        organization_id: ORG,
        country_code: 'OM',
        timezone: 'Asia/Muscat',
        status: 'ACTIVE',
      },
    ],
    branches: [],
    departments: [],
    teams: [],
  };

  const ids: Record<string, string[]> = {
    branches: [BRANCH],
    departments: [DEPARTMENT],
    teams: [TEAM],
  };

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    let insertRow: Row | null = null;
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    });
    builder.insert = vi.fn((row: Row) => {
      insertRow = row;
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      const rows = state[table] ?? [];
      const match =
        rows.find((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value),
        ) ?? null;
      return { data: match, error: null };
    });
    builder.single = vi.fn(async () => {
      if (!insertRow) {
        const rows = state[table] ?? [];
        const match =
          rows.find((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value),
          ) ?? null;
        return {
          data: match,
          error: match ? null : { code: 'PGRST116' },
        };
      }

      const id = ids[table]?.shift();
      if (!id) throw new Error('unexpected insert into ' + table);

      const row = { id, ...insertRow };
      state[table] ??= [];
      state[table].push(row);
      return { data: row, error: null };
    });

    return builder;
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    state,
  };
}

function input(supabase: SupabaseClient) {
  return {
    supabase,
    organizationId: ORG,
    userId: USER,
    tenantBusinessId: BUSINESS,
    branchName: 'Muscat Main',
    branchCode: 'muscat-main',
    branchCountryCode: '',
    branchTimezone: '',
    departmentName: 'Customer Operations',
    departmentCode: 'customer-operations',
    teamName: 'Customer Care',
    teamCode: 'customer-care',
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('canonical operating hierarchy bootstrap', () => {
  it('creates audited-table-ready Branch -> Department -> Team scope with Business defaults', async () => {
    const { supabase, state } = fakeSupabase();

    const result = await bootstrapOperatingHierarchy(input(supabase));

    expect(requireOrganizationOwner).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      userId: USER,
    });
    expect(result.branch.created).toBe(true);
    expect(result.department.created).toBe(true);
    expect(result.team.created).toBe(true);

    expect(state.branches[0]).toMatchObject({
      organization_id: ORG,
      tenant_business_id: BUSINESS,
      name: 'Muscat Main',
      code: 'muscat-main',
      country_code: 'OM',
      timezone: 'Asia/Muscat',
      status: 'ACTIVE',
      metadata: {},
    });
    expect(state.departments[0]).toMatchObject({
      organization_id: ORG,
      branch_id: BRANCH,
      name: 'Customer Operations',
      code: 'customer-operations',
      status: 'ACTIVE',
    });
    expect(state.teams[0]).toMatchObject({
      organization_id: ORG,
      department_id: DEPARTMENT,
      name: 'Customer Care',
      code: 'customer-care',
      status: 'ACTIVE',
    });
  });

  it('replays an exact hierarchy without creating duplicates', async () => {
    const { supabase, state } = fakeSupabase();

    await bootstrapOperatingHierarchy(input(supabase));
    const replay = await bootstrapOperatingHierarchy(input(supabase));

    expect(replay.branch.created).toBe(false);
    expect(replay.department.created).toBe(false);
    expect(replay.team.created).toBe(false);
    expect(state.branches).toHaveLength(1);
    expect(state.departments).toHaveLength(1);
    expect(state.teams).toHaveLength(1);
  });

  it('fails closed when a canonical code is reused with different data', async () => {
    const { supabase } = fakeSupabase();

    await bootstrapOperatingHierarchy(input(supabase));

    await expect(
      bootstrapOperatingHierarchy({
        ...input(supabase),
        branchName: 'Different Branch',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

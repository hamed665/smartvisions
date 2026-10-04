import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  normalizeCustomerBusinessId,
  resolveCustomerBusinessRole,
  resolveDefaultCustomerBusiness,
} from '@/lib/access/customer-business-scope';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20261004224000_customer_business_scope.sql',
    import.meta.url,
  ),
  'utf8',
);
const inviteRoute = readFileSync(
  new URL('../app/api/access/invites/route.ts', import.meta.url),
  'utf8',
);
const acceptRoute = readFileSync(
  new URL('../app/api/access/invites/accept/route.ts', import.meta.url),
  'utf8',
);
const businessContextRoute = readFileSync(
  new URL('../app/api/access/business-context/route.ts', import.meta.url),
  'utf8',
);
const businessContext = readFileSync(
  new URL('../lib/access/customer-business-scope.ts', import.meta.url),
  'utf8',
);

const businessA = {
  id: '20000000-0000-4000-8000-000000000001',
  organization_id: '10000000-0000-4000-8000-000000000001',
  brand_id: '30000000-0000-4000-8000-000000000001',
  name: 'Business A',
  slug: 'business-a',
  country_code: 'OM',
  timezone: 'Asia/Muscat',
  status: 'ACTIVE' as const,
  created_at: '2026-10-05T00:00:00Z',
};

describe('customer Business access runtime', () => {
  it('requires a valid canonical Business id', () => {
    expect(normalizeCustomerBusinessId(businessA.id)).toBe(businessA.id);
    expect(normalizeCustomerBusinessId('not-a-business')).toBeNull();
  });

  it('keeps Organization OWNER authority intact', () => {
    expect(resolveCustomerBusinessRole({
      membership: {
        organization_id: businessA.organization_id,
        role: 'OWNER',
      },
      business: businessA,
      assignments: [],
    })).toBe('OWNER');
  });

  it('requires explicit Business or Brand scope for every non-OWNER', () => {
    const membership = {
      organization_id: businessA.organization_id,
      role: 'ADMIN' as const,
    };

    expect(resolveCustomerBusinessRole({
      membership,
      business: businessA,
      assignments: [],
    })).toBeNull();

    expect(resolveCustomerBusinessRole({
      membership,
      business: businessA,
      assignments: [{
        organization_id: businessA.organization_id,
        user_id: 'user-a',
        scope_type: 'BUSINESS',
        role: 'ADMIN',
        brand_id: null,
        tenant_business_id: businessA.id,
        attributes: {},
      }],
    })).toBe('ADMIN');

    expect(resolveCustomerBusinessRole({
      membership,
      business: businessA,
      assignments: [{
        organization_id: businessA.organization_id,
        user_id: 'user-a',
        scope_type: 'BUSINESS',
        role: 'ADMIN',
        brand_id: null,
        tenant_business_id: businessA.id,
        attributes: { region: 'OM' },
      }],
    })).toBeNull();
  });

  it('uses Business scope before broader Brand scope', () => {
    expect(resolveCustomerBusinessRole({
      membership: {
        organization_id: businessA.organization_id,
        role: 'VIEWER',
      },
      business: businessA,
      assignments: [
        {
          organization_id: businessA.organization_id,
          user_id: 'user-a',
          scope_type: 'BRAND',
          role: 'VIEWER',
          brand_id: businessA.brand_id,
          tenant_business_id: null,
          attributes: {},
        },
        {
          organization_id: businessA.organization_id,
          user_id: 'user-a',
          scope_type: 'BUSINESS',
          role: 'SALES_AGENT',
          brand_id: null,
          tenant_business_id: businessA.id,
          attributes: {},
        },
      ],
    })).toBe('SALES_AGENT');
  });

  it('resolves the default Business deterministically and never escapes requested access', () => {
    const rows = [
      {
        id: 'b2',
        organizationId: 'org-a',
        brandId: 'brand-a',
        name: 'Zulu',
        slug: 'zulu',
        countryCode: 'OM',
        timezone: 'Asia/Muscat',
        organizationRole: 'ADMIN' as const,
        businessRole: 'ADMIN' as const,
      },
      {
        id: 'b1',
        organizationId: 'org-a',
        brandId: 'brand-a',
        name: 'Alpha',
        slug: 'alpha',
        countryCode: 'OM',
        timezone: 'Asia/Muscat',
        organizationRole: 'ADMIN' as const,
        businessRole: 'VIEWER' as const,
      },
    ];

    expect(resolveDefaultCustomerBusiness(rows)?.id).toBe('b1');
    expect(resolveDefaultCustomerBusiness(rows, 'b2')?.id).toBe('b2');
    expect(resolveDefaultCustomerBusiness(rows, 'outside')).toBeNull();
  });
});

describe('customer Business access migration contract', () => {
  it('reuses canonical IAM and never creates a parallel customer authority', () => {
    expect(migration).toContain('alter table public.organization_member_invitations');
    expect(migration).toContain('public.member_scope_assignments');
    expect(migration).toContain('public.tenant_businesses');
    expect(migration).not.toMatch(
      /create table(?: if not exists)? public\.(customer_users|customer_tenants|customer_businesses|customer_memberships)/i,
    );
  });

  it('makes non-OWNER Business visibility require explicit canonical scope', () => {
    expect(migration).toContain('customer_business_effective_role');
    expect(migration).toContain("if v_org_role = 'OWNER'");
    expect(migration).toContain("a.scope_type = 'BUSINESS'");
    expect(migration).toContain("a.scope_type = 'BRAND'");
    expect(migration).toContain("a.attributes = '{}'::jsonb");
    expect(migration).toContain('tenant_businesses_customer_scoped_read');
    expect(migration).not.toContain('create policy tenant_businesses_member_read');
  });

  it('bounds Chatwoot Account mapping reads to the same visible Business', () => {
    expect(migration).toContain('chatwoot_account_mappings_customer_scoped_read');
    expect(migration).toContain('public.chatwoot_bridge_can_read(organization_id)');
    expect(migration).toContain('b.id = chatwoot_account_mappings.tenant_business_id');
  });

  it('allows invite acceptance to materialize only the exact accepted Business assignment', () => {
    expect(migration).toContain('member_scope_invite_acceptance_allowed');
    expect(migration).toContain('i.accepted_by_user_id = v_actor');
    expect(migration).toContain('i.tenant_business_id = p_tenant_business_id');
    expect(migration).toContain('i.created_by_user_id = p_assigned_by');
    expect(migration).toContain('i.last_request_key = p_request_key');
    expect(migration).toContain("new.scope_type <> 'BUSINESS'");
  });

  it('does not let a Meta/WhatsApp setup capability become customer panel authority', () => {
    const authority = migration.slice(
      migration.indexOf('create or replace function public.customer_business_effective_role'),
      migration.indexOf('drop policy if exists tenant_businesses_member_read'),
    );
    expect(authority).not.toMatch(/whatsapp|meta|setup_attempt|communication_channel/i);
  });
});

describe('customer Business access routes', () => {
  it('requires explicit Business binding for non-OWNER invitations', () => {
    expect(inviteRoute).toContain("role !== 'OWNER' && !tenantBusinessId");
    expect(inviteRoute).toContain('issue_organization_member_business_invitation');
  });

  it('accepts the Business scope through one governed RPC', () => {
    expect(acceptRoute).toContain('accept_organization_member_business_invitation');
    expect(acceptRoute).not.toContain(".from('member_scope_assignments')");
  });

  it('uses authenticated customer context, not Founder/operator impersonation', () => {
    expect(businessContextRoute).toContain('loadCustomerBusinessAccessContext');
    expect(businessContext).toContain('createClient');
    expect(businessContext).not.toContain('getServerOperatorContext');
    expect(businessContext).not.toContain('getCurrentOrganization');
    expect(businessContext).not.toMatch(/founder|super.?admin/i);
  });
});

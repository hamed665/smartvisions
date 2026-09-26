import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  getCurrentOrganization,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
  createBrandBootstrap,
  createBusinessBootstrap,
  revalidatePath,
  prepareChatwootTenantProjection,
  loadChatwootReadiness,
  provisionChatwootAccount,
  provisionCurrentOwnerChatwootAccess,
  bootstrapOperatingHierarchy,
  provisionChatwootApiInbox,
  provisionChatwootTeam,
  reconcileChatwootScopedAccess,
} = vi.hoisted(() => ({
  getCurrentOrganization: vi.fn(),
  parseBrandBootstrapPayload: vi.fn((value) => value),
  parseBusinessBootstrapPayload: vi.fn((value) => value),
  createBrandBootstrap: vi.fn(),
  createBusinessBootstrap: vi.fn(),
  revalidatePath: vi.fn(),
  prepareChatwootTenantProjection: vi.fn(),
  loadChatwootReadiness: vi.fn(),
  provisionChatwootAccount: vi.fn(),
  provisionCurrentOwnerChatwootAccess: vi.fn(),
  bootstrapOperatingHierarchy: vi.fn(),
  provisionChatwootApiInbox: vi.fn(),
  provisionChatwootTeam: vi.fn(),
  reconcileChatwootScopedAccess: vi.fn(),
}));

vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization }));
vi.mock('@/lib/chatwoot/prepare-tenant-projection', () => ({
  prepareChatwootTenantProjection,
}));
vi.mock('@/lib/chatwoot/readiness', () => ({ loadChatwootReadiness }));
vi.mock('@/lib/chatwoot/account-orchestration', () => ({
  provisionChatwootAccount,
}));
vi.mock('@/lib/chatwoot/owner-access-orchestration', () => ({
  provisionCurrentOwnerChatwootAccess,
}));
vi.mock('@/lib/business-os/control-plane-hierarchy', () => ({
  bootstrapOperatingHierarchy,
}));
vi.mock('@/lib/chatwoot/api-inbox-provisioning', () => ({
  provisionChatwootApiInbox,
}));
vi.mock('@/lib/chatwoot/team-provisioning', () => ({
  provisionChatwootTeam,
}));
vi.mock('@/lib/chatwoot/scoped-access-reconciliation', () => ({
  reconcileChatwootScopedAccess,
}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/business-os/control-plane-bootstrap', () => ({
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
  createBrandBootstrap,
  createBusinessBootstrap,
}));

import {
  bootstrapCanonicalOperatingHierarchy,
  bootstrapCanonicalTenant,
  prepareCommunicationPlaneProjection,
  provisionCommunicationPlaneAccount,
  provisionCommunicationPlaneApiInbox,
  provisionCommunicationPlaneOwnerAccess,
  provisionCommunicationPlaneTeam,
  reconcileCommunicationPlaneScopedAccess,
} from '@/app/business-os-actions';

const ORG = '00000000-0000-4000-8000-000000000201';
const USER = '00000000-0000-4000-8000-000000000202';
const BRAND = '00000000-0000-4000-8000-000000000203';
const BUSINESS = '00000000-0000-4000-8000-000000000204';
const MAPPING = '00000000-0000-4000-8000-000000000205';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Business OS canonical tenant bootstrap action', () => {
  it('binds Production scope to the authenticated OWNER context and reuses canonical bootstrap services', async () => {
    const supabase = { marker: 'authenticated-client' };

    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    createBrandBootstrap.mockResolvedValue({
      row: { id: BRAND },
      created: true,
    });
    createBusinessBootstrap.mockResolvedValue({
      row: { id: BUSINESS },
      created: true,
    });

    const form = new FormData();
    form.set('brand_name', 'Smart Visions');
    form.set('brand_slug', 'smart-visions');
    form.set('business_name', 'Smart Visions');
    form.set('business_slug', 'oman');
    form.set('legal_name', '');
    form.set('country_code', 'OM');
    form.set('timezone', 'Asia/Muscat');

    const result = await bootstrapCanonicalTenant(form);

    expect(getCurrentOrganization).toHaveBeenCalledWith(true);
    expect(parseBrandBootstrapPayload).toHaveBeenCalledWith({
      organizationId: ORG,
      name: 'Smart Visions',
      slug: 'smart-visions',
      metadata: {},
    });
    expect(createBrandBootstrap).toHaveBeenCalledWith({
      supabase,
      userId: USER,
      payload: expect.objectContaining({ organizationId: ORG }),
    });
    expect(parseBusinessBootstrapPayload).toHaveBeenCalledWith({
      organizationId: ORG,
      brandId: BRAND,
      name: 'Smart Visions',
      slug: 'oman',
      legalName: null,
      countryCode: 'OM',
      timezone: 'Asia/Muscat',
      metadata: {},
    });
    expect(createBusinessBootstrap).toHaveBeenCalledWith({
      supabase,
      userId: USER,
      payload: expect.objectContaining({
        organizationId: ORG,
        brandId: BRAND,
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
    expect(result).toBeUndefined();
  });

  it('does not accept caller-supplied organization or Brand ids', async () => {
    const supabase = { marker: 'authenticated-client' };

    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    createBrandBootstrap.mockResolvedValue({
      row: { id: BRAND },
      created: false,
    });
    createBusinessBootstrap.mockResolvedValue({
      row: { id: BUSINESS },
      created: false,
    });

    const form = new FormData();
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');
    form.set('brand_id', '99999999-0000-4000-8000-000000000998');
    form.set('brand_name', 'Smart Visions');
    form.set('brand_slug', 'smart-visions');
    form.set('business_name', 'Smart Visions');
    form.set('business_slug', 'oman');
    form.set('country_code', 'OM');
    form.set('timezone', 'Asia/Muscat');

    await bootstrapCanonicalTenant(form);

    expect(parseBrandBootstrapPayload).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
    );
    expect(parseBusinessBootstrapPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        brandId: BRAND,
      }),
    );
  });
});

describe('Business OS Communication Plane projection action', () => {
  it('binds projection preparation to the authenticated OWNER organization', async () => {
    const supabase = { marker: 'authenticated-client' };

    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    prepareChatwootTenantProjection.mockResolvedValue({
      business: { id: BUSINESS },
      bindings: [],
      accountMapping: { id: 'mapping' },
      createdBindingCount: 0,
      createdAccountMapping: false,
    });

    const form = new FormData();
    form.set('tenant_business_id', BUSINESS);
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');

    const result = await prepareCommunicationPlaneProjection(form);

    expect(getCurrentOrganization).toHaveBeenCalledWith(true);
    expect(prepareChatwootTenantProjection).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
    expect(result).toBeUndefined();
  });
});


describe('Business OS governed Chatwoot Account action', () => {
  it('does not invoke external orchestration while readiness is blocked', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: false,
    });

    const form = new FormData();
    form.set('chatwoot_account_mapping_id', MAPPING);

    await expect(
      provisionCommunicationPlaneAccount(form),
    ).rejects.toThrow('not ready');

    expect(getCurrentOrganization).toHaveBeenCalledWith(true);
    expect(loadChatwootReadiness).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
    });
    expect(provisionChatwootAccount).not.toHaveBeenCalled();
  });

  it('invokes exact OWNER-scoped Account orchestration only after readiness passes', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: true,
    });
    provisionChatwootAccount.mockResolvedValue({
      id: MAPPING,
      organization_id: ORG,
      tenant_business_id: BUSINESS,
      status: 'ACTIVE',
    });

    const form = new FormData();
    form.set('chatwoot_account_mapping_id', MAPPING);
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');

    const result = await provisionCommunicationPlaneAccount(form);

    expect(provisionChatwootAccount).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      mappingId: MAPPING,
      requestKey: `comm-tenant-bridge:${MAPPING}:external-account:v1`,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
    expect(result).toBeUndefined();
  });
});


describe('Business OS governed Chatwoot OWNER access action', () => {
  it('does not invoke OWNER access orchestration while readiness is blocked', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: false,
    });

    const form = new FormData();
    form.set('tenant_business_id', BUSINESS);

    await expect(
      provisionCommunicationPlaneOwnerAccess(form),
    ).rejects.toThrow('not ready');

    expect(provisionCurrentOwnerChatwootAccess).not.toHaveBeenCalled();
  });

  it('derives Organization scope from the authenticated OWNER context', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: true,
    });
    provisionCurrentOwnerChatwootAccess.mockResolvedValue({
      tenantBusinessId: BUSINESS,
      chatwootAccountId: 501,
      chatwootUserId: 151,
      userMappingStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      chatwootRole: 'administrator',
    });

    const form = new FormData();
    form.set('tenant_business_id', BUSINESS);
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');

    const result = await provisionCommunicationPlaneOwnerAccess(form);

    expect(provisionCurrentOwnerChatwootAccess).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
    expect(result).toBeUndefined();
  });
});


describe('Business OS canonical operating hierarchy action', () => {
  it('binds hierarchy creation to the authenticated OWNER Organization', async () => {
    const supabase = { marker: 'authenticated-client' };

    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    bootstrapOperatingHierarchy.mockResolvedValue({
      branch: { row: { id: 'branch' }, created: true },
      department: { row: { id: 'department' }, created: true },
      team: { row: { id: 'team' }, created: true },
    });

    const form = new FormData();
    form.set('tenant_business_id', BUSINESS);
    form.set('branch_name', 'Muscat');
    form.set('branch_code', 'muscat');
    form.set('branch_country_code', 'OM');
    form.set('branch_timezone', 'Asia/Muscat');
    form.set('department_name', 'Customer Operations');
    form.set('department_code', 'customer-operations');
    form.set('team_name', 'Customer Care');
    form.set('team_code', 'customer-care');
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');

    await bootstrapCanonicalOperatingHierarchy(form);

    expect(bootstrapOperatingHierarchy).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      userId: USER,
      tenantBusinessId: BUSINESS,
      branchName: 'Muscat',
      branchCode: 'muscat',
      branchCountryCode: 'OM',
      branchTimezone: 'Asia/Muscat',
      departmentName: 'Customer Operations',
      departmentCode: 'customer-operations',
      teamName: 'Customer Care',
      teamCode: 'customer-care',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
  });
});

describe('Business OS governed Chatwoot Inbox and Team actions', () => {
  it('blocks Inbox and Team orchestration before readiness passes', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: false,
    });

    const inboxForm = new FormData();
    inboxForm.set('tenant_business_id', BUSINESS);
    inboxForm.set('branch_id', '00000000-0000-4000-8000-000000000211');
    inboxForm.set('communication_channel_binding_id', '00000000-0000-4000-8000-000000000212');
    inboxForm.set('chatwoot_account_mapping_id', MAPPING);

    const teamForm = new FormData();
    teamForm.set('tenant_business_id', BUSINESS);
    teamForm.set('smart_team_id', '00000000-0000-4000-8000-000000000213');
    teamForm.set('chatwoot_account_mapping_id', MAPPING);

    await expect(
      provisionCommunicationPlaneApiInbox(inboxForm),
    ).rejects.toThrow('not ready');
    await expect(
      provisionCommunicationPlaneTeam(teamForm),
    ).rejects.toThrow('not ready');

    expect(provisionChatwootApiInbox).not.toHaveBeenCalled();
    expect(provisionChatwootTeam).not.toHaveBeenCalled();
  });
});


describe('Business OS governed scoped Chatwoot access action', () => {
  it('blocks scoped reconciliation before live provisioning readiness', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: false,
    });

    const form = new FormData();
    form.set('resource_kind', 'INBOX');
    form.set('mapping_id', MAPPING);

    await expect(
      reconcileCommunicationPlaneScopedAccess(form),
    ).rejects.toThrow('not ready');

    expect(reconcileChatwootScopedAccess).not.toHaveBeenCalled();
  });

  it('derives Organization scope from the authenticated OWNER context', async () => {
    const supabase = { marker: 'authenticated-client' };
    getCurrentOrganization.mockResolvedValue({
      supabase,
      organizationId: ORG,
      role: 'OWNER',
      userId: USER,
    });
    loadChatwootReadiness.mockResolvedValue({
      liveProvisioningReady: true,
    });
    reconcileChatwootScopedAccess.mockResolvedValue({
      kind: 'TEAM',
      mappingId: MAPPING,
      tenantBusinessId: BUSINESS,
      desiredMemberCount: 1,
      verifiedMemberCount: 1,
      outcome: 'ALREADY_VERIFIED',
    });

    const form = new FormData();
    form.set('resource_kind', 'TEAM');
    form.set('mapping_id', MAPPING);
    form.set('organization_id', '99999999-0000-4000-8000-000000000999');

    await reconcileCommunicationPlaneScopedAccess(form);

    expect(reconcileChatwootScopedAccess).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      kind: 'TEAM',
      mappingId: MAPPING,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/system');
  });
});

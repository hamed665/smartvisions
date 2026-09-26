import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getCurrentOrganization,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
  createBrandBootstrap,
  createBusinessBootstrap,
  revalidatePath,
} = vi.hoisted(() => ({
  getCurrentOrganization: vi.fn(),
  parseBrandBootstrapPayload: vi.fn((value) => value),
  parseBusinessBootstrapPayload: vi.fn((value) => value),
  createBrandBootstrap: vi.fn(),
  createBusinessBootstrap: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/business-os/control-plane-bootstrap', () => ({
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
  createBrandBootstrap,
  createBusinessBootstrap,
}));

import { bootstrapCanonicalTenant } from '@/app/business-os-actions';

const ORG = '00000000-0000-4000-8000-000000000201';
const USER = '00000000-0000-4000-8000-000000000202';
const BRAND = '00000000-0000-4000-8000-000000000203';
const BUSINESS = '00000000-0000-4000-8000-000000000204';

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
    expect(result).toEqual({
      brandId: BRAND,
      businessId: BUSINESS,
      brandCreated: true,
      businessCreated: true,
    });
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

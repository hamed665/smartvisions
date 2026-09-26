import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ControlPlaneBootstrapError,
  brandMatchesBootstrap,
  businessMatchesBootstrap,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
  type BrandRow,
  type TenantBusinessRow,
} from '@/lib/business-os/control-plane-bootstrap';

const ORGANIZATION_ID = '4824ef22-a53e-480f-b40e-be901e891a03';
const BRAND_ID = '11111111-1111-4111-8111-111111111111';

describe('governed control-plane bootstrap payloads', () => {
  it('normalizes Brand identity without inventing a different natural key', () => {
    expect(parseBrandBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      name: '  Smart   Visions  ',
      slug: 'SMART_VISIONS',
      metadata: { source: 'owner-bootstrap' },
    })).toEqual({
      organizationId: ORGANIZATION_ID,
      name: 'Smart Visions',
      slug: 'smart_visions',
      metadata: { source: 'owner-bootstrap' },
    });
  });

  it('requires evidence-bearing Business geography and a valid IANA timezone', () => {
    expect(parseBusinessBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      brandId: BRAND_ID,
      name: 'Smart Visions Oman',
      slug: 'oman',
      legalName: ' Smart Visions ',
      countryCode: 'om',
      timezone: 'Asia/Muscat',
      metadata: {},
    })).toEqual({
      organizationId: ORGANIZATION_ID,
      brandId: BRAND_ID,
      name: 'Smart Visions Oman',
      slug: 'oman',
      legalName: 'Smart Visions',
      countryCode: 'OM',
      timezone: 'Asia/Muscat',
      metadata: {},
    });

    expect(() => parseBusinessBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      brandId: BRAND_ID,
      name: 'Bad timezone',
      slug: 'bad-timezone',
      countryCode: 'OM',
      timezone: 'Not/A_Timezone',
    })).toThrow(ControlPlaneBootstrapError);
  });

  it('rejects malformed slugs and oversized metadata before any database mutation', () => {
    expect(() => parseBrandBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      name: 'Unsafe',
      slug: '../unsafe',
    })).toThrow('canonical control-plane slug format');

    expect(() => parseBrandBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      name: 'Too much metadata',
      slug: 'too-much-metadata',
      metadata: { value: 'x'.repeat(9000) },
    })).toThrow('metadata exceeds');
  });
});

describe('governed control-plane bootstrap idempotency', () => {
  const brandPayload = parseBrandBootstrapPayload({
    organizationId: ORGANIZATION_ID,
    name: 'Smart Visions',
    slug: 'smart-visions',
    metadata: { b: 2, a: 1 },
  });

  const brandRow: BrandRow = {
    id: BRAND_ID,
    organization_id: ORGANIZATION_ID,
    name: 'Smart Visions',
    slug: 'smart-visions',
    status: 'ACTIVE',
    metadata: { a: 1, b: 2 },
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };

  it('treats an exact natural-key replay as the same Brand', () => {
    expect(brandMatchesBootstrap(brandRow, brandPayload)).toBe(true);
    expect(brandMatchesBootstrap(
      { ...brandRow, name: 'Different Brand' },
      brandPayload,
    )).toBe(false);
    expect(brandMatchesBootstrap(
      { ...brandRow, status: 'ARCHIVED' },
      brandPayload,
    )).toBe(false);
  });

  it('treats Business replay as exact canonical equality, not slug-only equality', () => {
    const payload = parseBusinessBootstrapPayload({
      organizationId: ORGANIZATION_ID,
      brandId: BRAND_ID,
      name: 'Smart Visions Oman',
      slug: 'oman',
      legalName: 'Smart Visions',
      countryCode: 'OM',
      timezone: 'Asia/Muscat',
      metadata: { channel: 'internal-bootstrap' },
    });

    const row: TenantBusinessRow = {
      id: '22222222-2222-4222-8222-222222222222',
      organization_id: ORGANIZATION_ID,
      brand_id: BRAND_ID,
      name: 'Smart Visions Oman',
      slug: 'oman',
      legal_name: 'Smart Visions',
      country_code: 'OM',
      timezone: 'Asia/Muscat',
      status: 'ACTIVE',
      metadata: { channel: 'internal-bootstrap' },
      created_at: '2026-09-26T00:00:00Z',
      updated_at: '2026-09-26T00:00:00Z',
    };

    expect(businessMatchesBootstrap(row, payload)).toBe(true);
    expect(businessMatchesBootstrap(
      { ...row, timezone: 'Asia/Dubai' },
      payload,
    )).toBe(false);
  });
});

describe('governed control-plane bootstrap safety invariants', () => {
  const service = fs.readFileSync(
    'lib/business-os/control-plane-bootstrap.ts',
    'utf8',
  );
  const route = fs.readFileSync(
    'app/api/business-os/control-plane/bootstrap/route.ts',
    'utf8',
  );
  const migration = fs.readFileSync(
    'supabase/migrations/0068_business_os_control_plane_foundation.sql',
    'utf8',
  );

  it('uses authenticated OWNER authority plus existing RLS instead of service-role bypass', () => {
    expect(service).toContain("data?.role !== 'OWNER'");
    expect(service).toContain(".from('organization_members')");
    expect(service).not.toMatch(/service[_-]?role/i);
    expect(route).toContain('supabase.auth.getUser()');
  });

  it('is race-safe on canonical natural keys without adding a parallel claim store', () => {
    expect(service.match(/error\?\.code === '23505'/g)).toHaveLength(2);
    expect(service).toContain(".from('brands')");
    expect(service).toContain(".from('tenant_businesses')");
    expect(service).not.toContain('chatwoot_bridge_command_claims');
  });

  it('reuses the existing database audit and OWNER policies', () => {
    expect(migration).toContain('brands_audit_mutation');
    expect(migration).toContain('tenant_businesses_audit_mutation');
    expect(migration).toContain('brands_owner_insert');
    expect(migration).toContain('tenant_businesses_owner_insert');
  });

  it('has no Chatwoot or outbound provider side effect boundary', () => {
    expect(service).not.toMatch(/chatwoot|whatsapp|resend|meta api/i);
    expect(route).not.toMatch(/chatwoot|whatsapp|resend|meta api/i);
    expect(service).not.toContain('fetch(');
    expect(route).not.toContain('fetch(');
  });
});

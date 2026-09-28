import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_DATA_QUALITY_MUTATION_ROLES,
  prepareVerifiedContactImportRows,
} from '@/lib/crm/data-quality';

describe('CRM-DATA-QUALITY foundation', () => {
  const migration = readFileSync('supabase/migrations/0134_crm_data_quality_foundation.sql', 'utf8');
  const api = readFileSync('app/api/crm/data-quality/route.ts', 'utf8');
  const page = readFileSync('app/data-quality/page.tsx', 'utf8');
  const importUi = readFileSync('app/data-quality/data-quality-import.tsx', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('reuses canonical CRM authorities instead of adding a second customer store', () => {
    expect(migration).toContain('public.record_crm_business_identity');
    expect(migration).toContain('public.create_or_resolve_crm_person_from_verified_identity');
    expect(migration).not.toMatch(/create table if not exists public\.crm_data_quality_(people|identities|businesses)/i);
    expect(migration).not.toMatch(/create table if not exists public\.crm_import_contacts/i);
  });

  it('normalizes import identities with the canonical runtime normalizer', () => {
    const rows = prepareVerifiedContactImportRows([{
      clientRowKey: 'row-1',
      businessId: '10000000-0000-0000-0000-000000000c01',
      identityType: 'EMAIL',
      identityValue: '  USER@Example.COM  ',
      displayName: 'User',
      relationshipType: 'CONTACT',
    }]);
    expect(rows[0].normalizedValue).toBe('user@example.com');
    expect(rows[0].relationshipType).toBe('CONTACT');
  });

  it('rejects duplicate rows before mutation', () => {
    expect(() => prepareVerifiedContactImportRows([
      {
        clientRowKey: 'row-1',
        businessId: '10000000-0000-0000-0000-000000000c01',
        identityType: 'PHONE',
        identityValue: '+968 9999 9999',
      },
      {
        clientRowKey: 'row-2',
        businessId: '10000000-0000-0000-0000-000000000c01',
        identityType: 'PHONE',
        identityValue: '96899999999',
      },
    ])).toThrow(/duplicates another Business\/identity row/i);
  });

  it('bounds batch size and mutation roles', () => {
    expect(CRM_DATA_QUALITY_MUTATION_ROLES).toEqual(['OWNER','ADMIN','SALES_MANAGER']);
    expect(() => prepareVerifiedContactImportRows([])).toThrow(/1 to 100/);
    expect(() => prepareVerifiedContactImportRows(Array.from({ length: 101 }, (_, index) => ({
      clientRowKey: `row-${index}`,
      businessId: '10000000-0000-0000-0000-000000000c01',
      identityType: 'EMAIL' as const,
      identityValue: `u${index}@example.test`,
    })))).toThrow(/1 to 100/);
  });

  it('stores only bounded receipt metadata and no raw row payload', () => {
    expect(migration).toContain('crm_data_import_batches');
    expect(migration).toContain("'raw_pii_stored', false");
    expect(migration).not.toMatch(/crm_data_import_batches[\s\S]{0,2500}\brows\s+jsonb/i);
    expect(migration).not.toMatch(/crm_data_import_batches[\s\S]{0,2500}\braw_payload\b/i);
  });

  it('fails closed on ambiguous identities and replays exact request keys', () => {
    expect(migration).toContain('CRM verified import identity is ambiguous across Businesses');
    expect(migration).toContain('request key was reused with different content');
    expect(migration).toContain('return query select');
    expect(migration).toContain('true;');
  });

  it('keeps quality scan read-only and leaves destructive retention deferred', () => {
    const scan = migration.slice(
      migration.indexOf('create or replace function public.get_crm_data_quality_summary'),
      migration.indexOf('create or replace function public.apply_crm_verified_contact_import'),
    );
    expect(scan).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\./i);
    expect(scan).toContain('DEFERRED_WITH_REASON');
    expect(scan).toContain('no automatic delete is permitted');
  });

  it('exposes preview/apply UI and service-bound apply', () => {
    expect(api).toContain("action === 'PREVIEW_IMPORT'");
    expect(api).toContain('isCrmDataQualityMutationRole');
    expect(api).toContain('createSupabaseServiceClient()');
    expect(page).toContain('Deterministic quality checks');
    expect(importUi).toContain('Preview import');
    expect(importUi).toContain('Apply verified import');
  });

  it('runs dedicated PostgreSQL 17 data-quality smoke', () => {
    expect(ci).toContain('crm-data-quality-foundation-smoke.sql');
  });
});

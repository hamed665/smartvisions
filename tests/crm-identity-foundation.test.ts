import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isCrmIdentitySchemaUnavailable,
  normalizeCrmIdentity,
} from '@/lib/crm/contact-identity';

const migration = readFileSync(
  new URL('../supabase/migrations/0070_crm_identity_foundation.sql', import.meta.url),
  'utf8',
);
const emailLifecycle = readFileSync(
  new URL('../lib/outreach/email-lifecycle.ts', import.meta.url),
  'utf8',
);
const whatsappLifecycle = readFileSync(
  new URL('../lib/whatsapp/lifecycle.ts', import.meta.url),
  'utf8',
);

describe('Business OS CRM identity foundation', () => {
  it('normalizes Email deterministically', () => {
    expect(normalizeCrmIdentity('EMAIL', '  Sales@Example.COM ')).toBe('sales@example.com');
    expect(normalizeCrmIdentity('EMAIL', 'not-an-email')).toBeNull();
    expect(normalizeCrmIdentity('EMAIL', '@example.com')).toBeNull();
  });

  it('normalizes Phone and WhatsApp to digits and rejects weak identities', () => {
    expect(normalizeCrmIdentity('PHONE', '+968 9123 4567')).toBe('96891234567');
    expect(normalizeCrmIdentity('WHATSAPP', '00968-9123-4567')).toBe('0096891234567');
    expect(normalizeCrmIdentity('PHONE', '1234')).toBeNull();
  });

  it('normalizes Instagram handles and standard profile URLs', () => {
    expect(normalizeCrmIdentity('INSTAGRAM', '@Example.Handle')).toBe('example.handle');
    expect(normalizeCrmIdentity(
      'INSTAGRAM',
      'https://www.instagram.com/Example.Handle/?igsh=test',
    )).toBe('example.handle');
    expect(normalizeCrmIdentity('INSTAGRAM', 'https://example.com/not-instagram')).toBeNull();
  });

  it('falls back only for schema-not-yet-available errors', () => {
    expect(isCrmIdentitySchemaUnavailable({ code: 'PGRST205' })).toBe(true);
    expect(isCrmIdentitySchemaUnavailable({ code: 'PGRST202' })).toBe(true);
    expect(isCrmIdentitySchemaUnavailable({
      message: "Could not find the table 'public.crm_identities' in the schema cache",
    })).toBe(true);
    expect(isCrmIdentitySchemaUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('keeps Businesses and Leads canonical instead of creating a parallel CRM', () => {
    expect(migration).toContain('references public.businesses(organization_id, id)');
    expect(migration).not.toContain('create table if not exists public.crm_businesses');
    expect(migration).not.toContain('create table if not exists public.crm_leads');
    expect(migration).not.toContain('create table if not exists public.contacts');
  });

  it('stores ambiguity instead of forcing one Business owner', () => {
    expect(migration).toContain("status in ('ACTIVE','CONFLICTED','RETIRED')");
    expect(migration).toContain('count(distinct l.business_id)');
    expect(migration).toContain("set status = 'CONFLICTED'");
  });

  it('keeps CRM identity mutation service-side and SECURITY INVOKER', () => {
    expect(migration).toContain('create or replace function public.record_crm_business_identity');
    expect(migration).toContain('security invoker');
    expect(migration).not.toContain('security definer');
    expect(migration).toContain('grant execute on function public.record_crm_business_identity');
    expect(migration).toContain('to service_role;');
    expect(migration).toContain('grant select on public.crm_identities to authenticated;');
    expect(migration).not.toContain('grant insert on public.crm_identities to authenticated');
  });

  it('keeps raw identity PII out of audit summaries', () => {
    expect(migration).toContain('extensions.digest');
    expect(migration).toContain("'identity_fingerprint'");
    expect(migration).not.toContain("'normalized_value', v_after ->>");
    expect(migration).not.toContain("'display_value', v_after ->>");
  });

  it('integrates Email and WhatsApp registry-first while preserving exact legacy fallback', () => {
    expect(emailLifecycle).toContain('resolveBusinessByCrmIdentity');
    expect(emailLifecycle).toContain(".ilike('email', email)");
    expect(emailLifecycle).toContain('recordCrmBusinessIdentityEvidence');

    expect(whatsappLifecycle).toContain('resolveBusinessByCrmIdentityCandidates');
    expect(whatsappLifecycle).toContain('phone.ilike.%');
    expect(whatsappLifecycle).toContain('international_phone.ilike.%');
    expect(whatsappLifecycle).toContain('whatsapp.ilike.%');
    expect(whatsappLifecycle).toContain('recordCrmBusinessIdentityEvidence');
  });

  it('does not add a provider send path to the CRM identity layer', () => {
    const source = readFileSync(
      new URL('../lib/crm/contact-identity.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('MetaCloudWhatsAppProvider');
    expect(source).not.toContain('ResendEmailProvider');
    expect(source).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
  });
});

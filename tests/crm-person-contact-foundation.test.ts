import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_PERSON_RELATIONSHIP_TYPES,
  CRM_PERSON_VERIFICATION_METHODS,
  isCrmPersonMutationRole,
  isCrmPersonRelationshipType,
  isCrmPersonVerificationMethod,
} from '@/lib/crm/people';

describe('CRM-PERSON-CONTACT canonical foundation', () => {
  const migration = readFileSync('supabase/migrations/0126_crm_person_contact_foundation.sql', 'utf8');
  const route = readFileSync('app/api/crm/people/route.ts', 'utf8');
  const identityRuntime = readFileSync('lib/crm/contact-identity.ts', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('creates Person on top of canonical identity and Company authorities', () => {
    expect(migration).toContain('create table if not exists public.crm_people');
    expect(migration).toContain('references public.crm_identities(organization_id, id)');
    expect(migration).toContain('references public.businesses(organization_id, id)');
    expect(migration).not.toContain('create table if not exists public.crm_contact_identities');
    expect(migration).not.toContain('create table if not exists public.crm_accounts');
  });

  it('keeps the shared tenant guard valid across Person/link/relationship row shapes', () => {
    expect(migration).toContain("(to_jsonb(new) ->> 'created_from_identity_id')");
    expect(migration).not.toContain('new.created_from_identity_id is distinct from old.created_from_identity_id');
  });

  it('serializes Person creation on the canonical identity to prevent duplicate races', () => {
    expect(migration).toContain('verified requests cannot manufacture duplicate People');
    expect(migration).toContain('for update;');
  });

  it('requires verified identity evidence and forbids display-name-only creation', () => {
    expect(CRM_PERSON_VERIFICATION_METHODS).toEqual([
      'MANUAL_CONFIRMED',
      'PROVIDER_AUTHENTICATED',
      'IMPORT_VERIFIED',
    ]);
    expect(isCrmPersonVerificationMethod('PROVIDER_AUTHENTICATED')).toBe(true);
    expect(isCrmPersonVerificationMethod('OBSERVED')).toBe(false);
    expect(migration).toContain('p_identity_id uuid');
    expect(migration).toContain('CRM Person requires non-empty verified identity evidence');
    expect(migration).toContain('created_from_identity_id uuid not null');
    expect(migration).toContain('Deliberately performs no Production backfill');
  });

  it('prevents authenticated callers from self-asserting provider or import verification', () => {
    expect(route).toContain("verificationMethod !== 'MANUAL_CONFIRMED'");
    expect(route).toContain("relationshipVerificationMethod !== 'MANUAL_CONFIRMED'");
    expect(route).toContain('createSupabaseServiceClient()');
  });

  it('keeps direct authenticated mutation closed and uses the server-only trusted command', () => {
    expect(migration).toContain('grant select on public.crm_people to authenticated');
    expect(migration).not.toContain('grant insert on public.crm_people to authenticated');
    expect(migration).toContain('to service_role;');
    expect(migration).toContain('security invoker');
    expect(route).toContain('createSupabaseServiceClient()');
    expect(route).toContain('isCrmPersonMutationRole(membership.role)');
    expect(route).not.toContain(".from('crm_people').insert");
  });

  it('keeps Person-to-Company relationships evidence-backed and bounded', () => {
    expect(CRM_PERSON_RELATIONSHIP_TYPES).toEqual([
      'CONTACT',
      'OWNER',
      'EMPLOYEE',
      'DECISION_MAKER',
      'BILLING_CONTACT',
      'OTHER',
    ]);
    expect(isCrmPersonRelationshipType('DECISION_MAKER')).toBe(true);
    expect(isCrmPersonRelationshipType('HOUSEHOLD')).toBe(false);
    expect(migration).toContain('CRM Person relationship requires non-empty evidence');
  });

  it('aligns runtime identity types with the canonical omnichannel registry', () => {
    for (const type of [
      'INSTAGRAM_PROVIDER_USER',
      'FACEBOOK_MESSENGER_PROVIDER_USER',
      'WEBCHAT_SESSION',
      'TELEGRAM_PROVIDER_USER',
      'TIKTOK_PROVIDER_USER',
    ]) {
      expect(identityRuntime).toContain(type);
    }

    for (const source of [
      'INSTAGRAM_INBOUND',
      'FACEBOOK_MESSENGER_INBOUND',
      'WEB_CHAT_VERIFIED',
      'TELEGRAM_INBOUND',
      'TIKTOK_INBOUND',
    ]) {
      expect(identityRuntime).toContain(source);
    }
  });

  it('keeps viewer access read-only and write roles explicit', () => {
    expect(isCrmPersonMutationRole('OWNER')).toBe(true);
    expect(isCrmPersonMutationRole('SALES_AGENT')).toBe(true);
    expect(isCrmPersonMutationRole('VIEWER')).toBe(false);
  });

  it('executes the migration and its PostgreSQL smoke in CI', () => {
    expect(ci).toContain("find supabase/migrations -maxdepth 1 -type f -name '*.sql'");
    expect(ci).toContain('crm-person-contact-foundation-smoke.sql');
  });
});

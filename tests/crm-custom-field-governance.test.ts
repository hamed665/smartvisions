import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/0075_crm_custom_field_governance.sql', import.meta.url),
  'utf8',
);

describe('Business OS CRM custom-field governance', () => {
  it('limits the first registry to Lead and Deal without Custom Objects or Segments', () => {
    expect(migration).toContain("entity_type in ('LEAD','DEAL')");
    expect(migration).toContain('create table if not exists public.crm_custom_field_definitions');
    expect(migration).toContain('create table if not exists public.crm_custom_field_options');
    expect(migration).toContain('create table if not exists public.crm_custom_field_values');
    expect(migration).not.toContain('create table if not exists public.crm_custom_objects');
    expect(migration).not.toContain('create table if not exists public.crm_segments');
    expect(migration).not.toContain('create table if not exists public.crm_contacts');
  });

  it('uses bounded typed values and no arbitrary JSON custom-value slot', () => {
    for (const type of [
      'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
      'SINGLE_SELECT','MULTI_SELECT','EMAIL','PHONE','URL','CURRENCY',
    ]) {
      expect(migration).toContain("'" + type + "'");
    }

    expect(migration).toContain('value_text text');
    expect(migration).toContain('value_number numeric');
    expect(migration).toContain('value_option_keys text[]');
    expect(migration).not.toContain('value_json');
    expect(migration).not.toContain('schema_json');
  });

  it('binds values to canonical tenant-safe Lead XOR Deal rows', () => {
    expect(migration).toContain('foreign key (organization_id, lead_id)');
    expect(migration).toContain('foreign key (organization_id, deal_id)');
    expect(migration).toContain("(entity_type = 'LEAD' and lead_id is not null and deal_id is null)");
    expect(migration).toContain("(entity_type = 'DEAL' and deal_id is not null and lead_id is null)");
  });

  it('keeps schema mutation owner/admin and Deal-agent value ownership explicit', () => {
    expect(migration).toContain("m.role in ('OWNER','ADMIN')");
    expect(migration).toContain("m.role in ('OWNER','ADMIN','SALES_MANAGER')");
    expect(migration).toContain("m.role = 'SALES_AGENT'");
    expect(migration).toContain('deal.owner_user_id = auth.uid()');
  });

  it('has no destructive delete path and preserves clear/deprecation lifecycle', () => {
    expect(migration).toContain("state in ('SET','CLEARED')");
    expect(migration).toContain("status in ('ACTIVE','DEPRECATED')");
    expect(migration).not.toContain('grant delete on public.crm_custom_field');
  });

  it('uses existing audit logs without copying raw field values', () => {
    expect(migration).toContain("'CRM_CUSTOM_FIELD_VALUE_CREATED'");
    expect(migration).toContain("'CRM_CUSTOM_FIELD_VALUE_CLEARED'");
    expect(migration).toContain("'has_value',(new.state='SET')");
    expect(migration).not.toContain("'value_text',new.value_text");
    expect(migration).not.toContain("'value_number',new.value_number");
    expect(migration).not.toContain("'value_option_keys',new.value_option_keys");
  });

  it('uses SECURITY INVOKER and explicit Data API grants', () => {
    expect(migration).toContain('security invoker');
    expect(migration).not.toContain('security definer');
    expect(migration).toContain(
      'grant select, insert, update on public.crm_custom_field_definitions to authenticated',
    );
    expect(migration).toContain(
      'grant select, insert, update on public.crm_custom_field_values to authenticated',
    );
    expect(migration).not.toContain(
      'grant select, insert, update on public.crm_custom_field_values to service_role',
    );
  });

  it('provides deterministic bounded reads and exact typed filtering', () => {
    expect(migration).toContain('get_crm_custom_field_definitions');
    expect(migration).toContain('get_crm_custom_field_values');
    expect(migration).toContain('find_crm_entities_by_custom_field_exact');
    expect(migration).toContain('order by d.field_key asc, d.id asc');
    expect(migration).toContain('order by v.definition_id asc, v.id asc');
    expect(migration).toContain('CRM custom field is not filterable');
  });

  it('fails closed on unsafe schema evolution and referenced options', () => {
    expect(migration).toContain('CRM custom field identity/type/unique contract is immutable');
    expect(migration).toContain('Custom field constraint change would invalidate stored values');
    expect(migration).toContain(
      'Cannot deprecate custom field option while values/defaults reference it',
    );
    expect(migration).toContain(
      'Required custom field cannot activate while % entities lack SET values',
    );
  });
});


const runtime = readFileSync(
  new URL('../lib/crm/custom-fields.ts', import.meta.url),
  'utf8',
);
const definitionRoute = readFileSync(
  new URL('../app/api/crm/custom-fields/definitions/route.ts', import.meta.url),
  'utf8',
);
const optionRoute = readFileSync(
  new URL('../app/api/crm/custom-fields/options/route.ts', import.meta.url),
  'utf8',
);
const valueRoute = readFileSync(
  new URL('../app/api/crm/custom-fields/values/route.ts', import.meta.url),
  'utf8',
);
const filterRoute = readFileSync(
  new URL('../app/api/crm/custom-fields/filter/route.ts', import.meta.url),
  'utf8',
);

describe('CRM custom-field runtime boundary', () => {
  it('uses signed-in Supabase session and never browser service credentials', () => {
    for (const route of [definitionRoute, optionRoute, valueRoute, filterRoute]) {
      expect(route).toContain("import { createClient } from '@/lib/supabase/server'");
      expect(route).toContain('supabase.auth.getUser()');
      expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(route).not.toContain('SUPABASE_SECRET_KEY');
    }
  });

  it('keeps immutable type/entity/version authority out of value payloads', () => {
    expect(valueRoute).not.toContain("body.dataType");
    expect(valueRoute).not.toContain("body.definitionVersion");
    expect(runtime).toContain("data_type: 'TEXT'");
    expect(migration).toContain('new.data_type := d.data_type');
    expect(migration).toContain('new.definition_version := d.version');
  });

  it('uses request replay and optimistic version checks for mutations', () => {
    expect(runtime).toContain(".eq('last_request_key', input.requestKey)");
    expect(runtime).toContain(".eq('version', input.expectedVersion)");
    expect(runtime).toContain("'VERSION_CONFLICT'");
    expect(runtime).toContain("'ALREADY_EXISTS'");
  });

  it('does not introduce provider actions or generic arbitrary-query surfaces', () => {
    const combined = [
      migration, runtime, definitionRoute, optionRoute, valueRoute, filterRoute,
    ].join('\n');

    expect(combined).not.toContain('MetaCloudWhatsAppProvider');
    expect(combined).not.toContain('ResendEmailProvider');
    expect(combined).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
    expect(filterRoute).toContain('exactFilterCustomField');
    expect(filterRoute).not.toContain('sql');
    expect(filterRoute).not.toContain('jsonPath');
  });
});

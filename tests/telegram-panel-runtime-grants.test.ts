import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Telegram panel runtime migration grants required service_role access without DELETE', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/0056_telegram_panel_runtime_grants.sql'),
    'utf8',
  ).toLowerCase();

  for (const table of [
    'growth_opportunities',
    'website_audits',
    'message_templates',
    'automation_rules',
    'organization_settings',
    'portfolio_items',
    'preview_templates',
    'message_variants',
    'suppression_list',
  ]) {
    assert.match(sql, new RegExp(`public\\.${table}\\s+to service_role`));
  }

  assert.doesNotMatch(sql, /grant[^;]*delete[^;]*to service_role/);
  assert.match(sql, /grant select on table public\.organization_members to service_role/);
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Telegram panel runtime grants', () => {
  it('grants required service_role access without DELETE', () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/0056_telegram_panel_runtime_grants.sql'),
      'utf8',
    ).toLowerCase();
    const sql = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

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
      expect(sql).toMatch(new RegExp(`public\\.${table}\\s+to service_role`));
    }

    expect(sql).not.toMatch(/grant[^;]*delete[^;]*to service_role/);
    expect(sql).toMatch(/grant select on table public\.organization_members to service_role/);
  });
});

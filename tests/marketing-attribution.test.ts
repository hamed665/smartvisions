import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/0145_marketing_attribution_observational.sql','utf8');
const smoke = readFileSync('tests/sql/marketing-attribution-observational-smoke.sql','utf8');
const page = readFileSync('app/marketing-attribution/page.tsx','utf8');
const shell = readFileSync('app/app-shell.tsx','utf8');
const ci = readFileSync('.github/workflows/ci.yml','utf8');

describe('MARKETING-ATTRIBUTION evidence contract', () => {
  it('derives attribution without a second persisted authority', () => {
    expect(migration).toContain('get_marketing_attribution');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toMatch(/create\s+materialized\s+view/i);
    expect(migration).not.toMatch(/insert\s+into/i);
    expect(migration).toContain('security invoker');
  });

  it('keeps models bounded and explicitly non-causal/non-revenue', () => {
    expect(migration).toContain("('FIRST_TOUCH','LAST_TOUCH','LINEAR')");
    expect(migration).toContain('p_lookback_days>180');
    expect(migration).toContain('false as causal_claim');
    expect(migration).toContain('false as revenue_claimed');
    expect(migration).not.toMatch(/revenue_amount/i);
    expect(migration).not.toMatch(/click_count|view_count/i);
  });

  it('requires real sent campaign touchpoints and exact provider conversation linkage', () => {
    expect(migration).toContain("om.direction='OUTBOUND'");
    expect(migration).toContain('om.sent_at is not null');
    expect(migration).toContain("c.campaign_kind='MARKETING'");
    expect(migration).toContain('cm.provider_message_id=om.provider_message_id');
    expect(smoke).toContain('Explicit conversion evidence alone created fabricated attribution');
  });

  it('ships a read-only operator surface and PostgreSQL acceptance gate', () => {
    expect(page).toContain('Observational credit');
    expect(page).toContain('Deal amount is sales evidence, not payment or revenue');
    expect(shell).toContain("['Marketing Attribution', '/marketing-attribution']");
    expect(ci).toContain('marketing-attribution-observational-smoke.sql');
  });
});

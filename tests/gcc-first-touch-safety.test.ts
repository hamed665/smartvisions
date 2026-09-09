import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const actions = readFileSync(resolve(process.cwd(), 'app/growth-opportunity-actions.ts'), 'utf8');

describe('GCC first-touch safety wiring', () => {
  it('routes human-only GCC opportunities before automatic lead promotion', () => {
    expect(actions).toContain("humanOnlyRoute(row.recommended_acquisition_route)");
    expect(actions).toContain('humanAcquisitionSkipped+=1');
    expect(actions).toContain("reason:'HUMAN_ACQUISITION_REQUIRED'");
  });

  it('does not use a public phone as automatic first-touch fallback', () => {
    expect(actions).not.toContain("phone.length>=8?'WHATSAPP'");
    expect(actions).not.toContain("channel:'EMAIL'|'WHATSAPP'|null");
    expect(actions).toContain("const channel='EMAIL' as const");
  });

  it('persists official Instagram evidence only from a successful first-party website audit path', () => {
    expect(actions).toContain("source:'FIRST_PARTY_WEBSITE'");
    expect(actions).toContain('officialInstagramEvidence(freshAudit)');
  });
});

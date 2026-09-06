import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'app/hunters/page.tsx'), 'utf8');

describe('Hunter daily target accounting', () => {
  it('uses the canonical daily outreach target instead of summing operational acquisition targets on top', () => {
    expect(page).toContain('dailyTargetCampaign');
    expect(page).toContain("record(row.config).dailyOutreachTarget === true");
    expect(page).toContain('displayedTargetVolume = dailyTargetCampaign?.target_count');
    expect(page).toContain('Running acquisition campaigns');
    expect(page).toContain('Daily outreach target');
  });
});

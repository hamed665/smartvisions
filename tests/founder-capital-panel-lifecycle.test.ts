import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Founder capital workspace lifecycle UI', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/founder/capital-panel.tsx'), 'utf8');

  it('exposes governed update paths for all mutable capital authorities', () => {
    expect(source).toContain('Edit cap-table evidence');
    expect(source).toContain('Edit dilution scenario');
    expect(source).toContain('Edit term sheet');
    expect(source).toContain('Edit diligence item');
    expect(source.match(/name="version"/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(source.match(/name="id"/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it('keeps lifecycle mutations on canonical Founder actions', () => {
    expect(source).toContain('action={saveFounderCapTableEntry}');
    expect(source).toContain('action={saveFounderDilutionScenario}');
    expect(source).toContain('action={saveFounderTermSheet}');
    expect(source).toContain('action={saveFounderDueDiligenceItem}');
  });
});

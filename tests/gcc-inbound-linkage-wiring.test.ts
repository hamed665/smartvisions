import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lifecycle = readFileSync(resolve(process.cwd(), 'lib/whatsapp/lifecycle.ts'), 'utf8');

describe('GCC inbound canonical business linkage', () => {
  it('matches existing businesses across phone, international_phone and whatsapp before creating a placeholder', () => {
    expect(lifecycle).toContain(".select('id,phone,international_phone,whatsapp')");
    expect(lifecycle).toContain('international_phone.ilike.%${suffix}%');
    expect(lifecycle).toContain('phonesRepresentSameNumber(target, row.international_phone)');
  });
});

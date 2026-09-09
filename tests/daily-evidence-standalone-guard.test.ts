import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyWebsiteUri } from '../lib/hunters/business/selective-enrichment';

const route = readFileSync(resolve(process.cwd(), 'app/api/operations/daily-evidence/route.ts'), 'utf8');

describe('daily evidence standalone website guard', () => {
  it('classifies social, WhatsApp and directory URLs as contact-only', () => {
    expect(classifyWebsiteUri('https://instagram.com/dentology_om')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://wa.me/96891234567')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://www.whatclinic.com/dentists/oman/muscat/example')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://exampleclinic.om')).toBe('STANDALONE');
  });

  it('requires standalone classification before creating or fetching a website audit', () => {
    const guard = "if (classifyWebsiteUri(website) !== 'STANDALONE') continue;";
    const guardIndex = route.indexOf(guard);
    const auditIndex = route.indexOf("supabase.from('website_audits')", guardIndex);
    const fetchIndex = route.indexOf('fetchDeterministicWebsiteEvidence(website)', guardIndex);

    expect(route).toContain("import { classifyWebsiteUri } from '@/lib/hunters/business/selective-enrichment';");
    expect(guardIndex).toBeGreaterThan(0);
    expect(auditIndex).toBeGreaterThan(guardIndex);
    expect(fetchIndex).toBeGreaterThan(auditIndex);
  });
});

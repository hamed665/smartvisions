import { describe, expect, it } from 'vitest';
import {
  evaluateProjectHunter, normalizeProjectHunterInput, projectHunterSourceId,
  buildProjectProposalDraft,
} from '@/lib/hunters/intent/project-hunter';

const sample = {
  channel:'UPWORK' as const,
  title:'Senior Next.js and TypeScript SaaS Developer',
  body:'We are looking for an experienced developer to maintain our Next.js, React, TypeScript, PostgreSQL SaaS platform and REST API integrations for a long-term contract.',
  sourceUrl:'https://www.upwork.com/jobs/~012345?utm_source=email',
  postedAt:'2026-10-10T12:00:00Z',
  proposalCount:12,
  budgetAmount:1500,
  budgetCurrency:'USD',
  paymentVerified:true,
};

describe('Project Hunter controlled opportunity intake', () => {
  it('normalizes tracking parameters and gives a stable source identifier',()=>{
    const a=normalizeProjectHunterInput(sample);
    const b=normalizeProjectHunterInput({...sample,sourceUrl:'https://www.upwork.com/jobs/~012345'});
    expect(a.sourceUrl).toBe(b.sourceUrl);
    expect(projectHunterSourceId(a.channel,a.sourceUrl)).toBe(projectHunterSourceId(b.channel,b.sourceUrl));
  });
  it('rejects invalid links and unverifiable malformed intake',()=>{
    expect(()=>normalizeProjectHunterInput({...sample,sourceUrl:'javascript:alert(1)'})).toThrow();
    expect(()=>normalizeProjectHunterInput({...sample,sourceUrl:'https://upwork.com.phishing.test/job'})).toThrow();
    expect(()=>normalizeProjectHunterInput({...sample,title:'x'})).toThrow();
    expect(()=>normalizeProjectHunterInput({...sample,budgetAmount:-10})).toThrow();
    expect(()=>normalizeProjectHunterInput({...sample,proposalCount:1.5})).toThrow();
  });
  it('produces a matching draft while keeping contactability gated',()=>{
    const result=evaluateProjectHunter(sample,'2026-10-11T13:00:00Z');
    expect(result.fitScore).toBeGreaterThanOrEqual(45);
    expect(result.skills).toContain('Next.js');
    expect(result.status).toBe('DRAFT_READY');
    expect(result.contactability).toBe('REVIEW');
    expect(result.draft).toContain('Smart Visions');
    expect(result.draft).not.toMatch(/guaranteed|100% successful/i);
  });
  it('blocks geography-restricted opportunities even with strong skill fit',()=>{
    const result=evaluateProjectHunter({...sample,body:sample.body+' Applicants must be based in the United States.'},'2026-10-11T13:00:00Z');
    expect(result.geoRestricted).toBe(true);
    expect(result.fitScore).toBe(0);
    expect(result.status).toBe('REVIEW');
    expect(result.draft).toBeNull();
  });
  it('does not create a draft for unrelated requests',()=>{
    const result=evaluateProjectHunter({...sample,body:'We are looking for a chef to plan a private dinner. This does not require any web development.',title:'Private dinner planning and catering'},'2026-10-11T13:00:00Z');
    expect(result.status).toBe('REVIEW');
    expect(result.draft).toBeNull();
  });
  it('does not claim production statistics or fabricate client projects',()=>{
    const proposal=buildProjectProposalDraft(sample,['Next.js','TypeScript']);
    expect(proposal).toContain('work in progress');
    expect(proposal).not.toMatch(/\$[0-9,]+|100%|completed 500/i);
  });
});

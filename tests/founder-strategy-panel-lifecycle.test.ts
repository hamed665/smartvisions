import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,expect,it } from 'vitest';
describe('Founder strategy lifecycle UI',()=>{
 const source=readFileSync(resolve(process.cwd(),'app/founder/strategy-panel.tsx'),'utf8');
 it('keeps optimistic versioned edit paths for all four strategy authorities',()=>{
  expect(source).toContain('Save goal');
  expect(source).toContain('Save key result');
  expect(source).toContain('Save research');
  expect(source).toContain('Save board report');
  expect(source.match(/name="version"/g)?.length??0).toBeGreaterThanOrEqual(4);
  expect(source.match(/name="id"/g)?.length??0).toBeGreaterThanOrEqual(4);
 });
});
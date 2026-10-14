import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const {run} = vi.hoisted(() => ({run:vi.fn()}));
vi.mock('@/lib/whatsapp/sahra-fast-inbound', () => ({runSahraFastInbound:run}));
import {POST} from '@/app/api/operations/sahra-inbound/route';
function request(key?:string, scheduledTime:unknown=Date.now()-1000) {
 return new Request('https://smartvisions.internal/api/operations/sahra-inbound', {
  method:'POST', headers:{'content-type':'application/json', ...(key?{'x-internal-api-key':key}:{})},
  body:JSON.stringify({scheduledTime}),
 });
}
beforeEach(() => {vi.stubEnv('INTERNAL_API_KEY','ci-internal'); vi.stubEnv('DEPLOYMENT_ENV','production'); run.mockReset();});
afterEach(() => vi.unstubAllEnvs());
describe('Sahra scheduled framework boundary', () => {
 it.each([undefined,'wrong'])('rejects an unauthenticated trigger %s', async key => {
  expect((await POST(request(key))).status).toBe(401);
  expect(run).not.toHaveBeenCalled();
 });
 it('rejects a candidate even with its internal key', async () => {
  vi.stubEnv('DEPLOYMENT_ENV','candidate');
  expect((await POST(request('ci-internal'))).status).toBe(423);
  expect(run).not.toHaveBeenCalled();
 });
 it.each([null, 'now', Date.now()-120000, Date.now()+120000])('rejects stale or invalid windows %s', async at => {
  expect((await POST(request('ci-internal',at))).status).toBe(400);
  expect(run).not.toHaveBeenCalled();
 });
 it('runs one fresh authorized window and exposes only its metrics', async () => {
  const at=Date.now()-1000; run.mockResolvedValue({scans:2,sent:0});
  const response=await POST(request('ci-internal',at));
  expect(response.status).toBe(200);
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith({DEPLOYMENT_ENV:'production',INTERNAL_API_KEY:'ci-internal'},at);
  expect(await response.json()).toEqual({metrics:{scans:2,sent:0}});
 });
 it('reports a sanitized initialization failure without retry', async () => {
  run.mockRejectedValue(new Error('must not expose provider credential'));
  const response=await POST(request('ci-internal'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('credential');
  expect(run).toHaveBeenCalledTimes(1);
 });
});

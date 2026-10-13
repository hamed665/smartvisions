import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatwootAccountMappingRow } from '@/lib/chatwoot/tenant-bridge';
vi.mock('server-only', () => ({}));
const { factory, ensure, reconcile } = vi.hoisted(() => ({factory: vi.fn(), ensure: vi.fn(), reconcile: vi.fn()}));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: factory }));
vi.mock('@/lib/chatwoot/provisioning', async (original) => ({ ...(await original<object>()), ensureChatwootAccount: ensure, reconcileChatwootAccount: reconcile }));
import { recoverChatwootAccountFromVerifiedAbsence } from '@/lib/chatwoot/account-reconciliation';

function query(data: unknown) {
 const q: Record<string, unknown> = {};
 for (const m of ['select','eq','gt','order','limit']) q[m] = vi.fn(()=>q);
 q.maybeSingle=vi.fn(async()=>({data,error:null}));
 return q;
}
const mapping = {id:'00000000-0000-4000-8000-00000000d901',organization_id:'org',tenant_business_id:'tenant',version:1,status:'PROVISIONING',chatwoot_account_id:null} as ChatwootAccountMappingRow;
function setup(options?: { receipt?: boolean; mayCreate?: boolean; fresh?: boolean }) {
 const receipt={id:'review',tenant_business_id:'tenant'};
 factory.mockReturnValue({from:()=>query(options?.receipt===false?null:receipt)});
 const rpc=vi.fn(async()=>({data:options?.mayCreate??true,error:null}));
 const supabase={auth:{getUser:vi.fn(async()=>({data:{user:{id:'owner'}},error:null}))},rpc,from:()=>query(options?.fresh===false?null:{id:'review'})} as unknown as SupabaseClient;
 const beforeExternalCreate=vi.fn(async()=>{});
 const post=vi.fn();
 ensure.mockImplementation(async(input)=>{await input.beforeCreate();post();return {account:{id:2}};});
 reconcile.mockResolvedValue(null);
 return {input:{supabase,organizationId:'org',mapping,requestKey:'original-key',name:'Tenant',beforeExternalCreate},rpc,post,beforeExternalCreate};
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CHATWOOT_BASE_URL','https://inbox.example.com');});
afterEach(()=>vi.unstubAllEnvs());
describe('Account recovery from protected complete-inventory evidence',()=>{
 it('does not create or claim without a protected review',async()=>{
  const s=setup({receipt:false});expect(await recoverChatwootAccountFromVerifiedAbsence(s.input)).toBeNull();
  expect(s.rpc).not.toHaveBeenCalled();expect(ensure).not.toHaveBeenCalled();
 });
 it('a spent recovery is GET-only, including when no Account exists',async()=>{
  const s=setup({mayCreate:false});expect(await recoverChatwootAccountFromVerifiedAbsence(s.input)).toBeNull();
  expect(reconcile).toHaveBeenCalledOnce();expect(ensure).not.toHaveBeenCalled();
 });
 it('reserves on the original claim and checks the exact pre-POST evidence',async()=>{
  const s=setup();expect(await recoverChatwootAccountFromVerifiedAbsence(s.input)).toEqual({id:2});
  expect(s.rpc).toHaveBeenCalledWith('claim_chatwoot_account_receipt_recovery',expect.objectContaining({p_original_key:'original-key',p_version:1,p_receipt:'review'}));
  expect(s.beforeExternalCreate).toHaveBeenCalledOnce();expect(s.post).toHaveBeenCalledOnce();
 });
 it('expiration or receipt revocation before POST blocks external creation',async()=>{
  const s=setup({fresh:false});await expect(recoverChatwootAccountFromVerifiedAbsence(s.input)).rejects.toThrow('expired or OWNER revoked');
  expect(s.post).not.toHaveBeenCalled();
 });
 it('canonical OWNER, mapping or activation changes before POST block creation',async()=>{
  const s=setup();s.beforeExternalCreate.mockRejectedValue(new Error('OWNER revoked'));
  await expect(recoverChatwootAccountFromVerifiedAbsence(s.input)).rejects.toThrow('OWNER revoked');expect(s.post).not.toHaveBeenCalled();
 });
});

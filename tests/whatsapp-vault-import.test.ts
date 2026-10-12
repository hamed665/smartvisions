import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { importMetaWhatsAppVaultAsset } from '@/lib/whatsapp/vault-import';

const staged = { access_token: 'controlled-unit-test-credential', secret_ref: 'secret-1',
  waba_id: 'waba-1', phone_number_id: 'phone-1', display_phone_number: '+968 9000 0000' };
function setup(options: { number?: string; member?: boolean; subscribed?: boolean; existing?: Record<string, unknown>; secretError?: boolean } = {}) {
  const binding = { id: 'binding-1', version: 1, tenantBusinessId: 'business-1' };
  const bootstrap = vi.fn(async () => binding);
  const rpc = vi.fn(async (name: string) => {
    if (name === 'read_meta_whatsapp_vault_import_credential') return { data: options.secretError ? [] : [staged], error: null };
    if (name === 'resolve_meta_whatsapp_credential') return { data: [{ binding_id: 'binding-1', access_token: staged.access_token }], error: null };
    if (name === 'start_meta_whatsapp_setup_attempt') return { data: { id: 'attempt-1', status: 'STARTED', binding_version: 1, communication_channel_binding_id: 'binding-1' }, error: null };
    return { data: { id: 'binding-1', version: 2, provider_account_id: 'waba-1', provider_destination_id: 'phone-1' }, error: null };
  });
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), single: vi.fn(async () => ({ error: null, data: options.existing ?? {} })) };
  const service = { rpc, from: vi.fn(() => chain) } as unknown as SupabaseClient;
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET');
    expect(url).not.toContain(staged.access_token);
    const phone = { id: 'phone-1', display_phone_number: options.number ?? '+968 9000 0000' };
    let response: unknown;
    if (url.includes('/subscribed_apps')) response = { data: options.subscribed === false ? [] : [{ whatsapp_business_api_data: { id: 'app-1' } }] };
    else if (url.includes('/phone_numbers')) response = { data: options.member === false ? [] : [phone] };
    else if (url.includes('/waba-1?')) response = { id: 'waba-1', name: 'Controlled test' };
    else response = phone;
    return new Response(JSON.stringify(response), { status: 200 });
  }) as unknown as typeof fetch;
  const run = () => importMetaWhatsAppVaultAsset({ service, organizationId: 'org-1', tenantBusinessId: 'business-1', actorUserId: 'owner-1', appId: 'app-1', bootstrap, fetchImpl });
  return { run, rpc, bootstrap, fetchImpl };
}

describe('registered Meta API number from staged Vault', () => {
  it('verifies provider membership and app subscription before canonical bootstrap, using GET only', async () => {
    const test = setup();
    const result = await test.run();
    expect(test.fetchImpl).toHaveBeenCalledTimes(5);
    expect(test.bootstrap).toHaveBeenCalledOnce();
    expect(test.rpc).toHaveBeenCalledWith('start_meta_whatsapp_setup_attempt', expect.objectContaining({ p_connection_mode: 'API_NEW_NUMBER', p_purpose: 'CONNECT' }));
    expect(test.rpc).toHaveBeenCalledWith('complete_meta_whatsapp_setup_attempt', expect.objectContaining({ p_access_token: staged.access_token, p_actor_user_id: 'owner-1' }));
    expect(result).toMatchObject({ ok: true, replayed: false, bindingId: 'binding-1' });
    expect(JSON.stringify(result)).not.toContain(staged.access_token);
    expect(JSON.stringify(result)).not.toContain(staged.secret_ref);
  });
  it.each([{ member: false }, { number: '+968 9111 1111' }, { subscribed: false }, { secretError: true }])('fails closed before creating any binding for %j', async (options) => {
    const test = setup(options);
    await expect(test.run()).rejects.toThrow();
    expect(test.bootstrap).not.toHaveBeenCalled();
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it('never replaces an existing different Meta destination', async () => {
    const test = setup({ existing: { provider_destination_id: 'old-phone', provider: 'META', provider_account_id: 'other', provider_secret_ref: 'old-secret' } });
    await expect(test.run()).rejects.toThrow('another Meta asset');
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it('replays the exact existing binding without a new setup or credential write', async () => {
    const test = setup({ existing: { provider: 'META', provider_account_id: 'waba-1', provider_destination_id: 'phone-1', provider_secret_ref: 'bound-secret' } });
    await expect(test.run()).resolves.toMatchObject({ replayed: true });
    expect(test.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not reconnect a human-disconnected binding implicitly', async () => {
    const test = setup({ existing: { provider: 'META', provider_account_id: 'waba-1', provider_destination_id: 'phone-1', provider_secret_ref: 'bound-secret', last_error_code: 'MANUAL_DISCONNECTED' } });
    await expect(test.run()).rejects.toThrow('lifecycle reconciliation');
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
});

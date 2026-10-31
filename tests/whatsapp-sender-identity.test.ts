import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaCloudWhatsAppProvider, metaSenderIdentityErrorCode } from '@/lib/whatsapp/meta-cloud';

describe('read-only WhatsApp sender identity', () => {
  it('preserves numeric Meta diagnostics while discarding credential-bearing error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 190, error_subcode: 463, message: 'private-token-secret',
    } }), { status: 400 })));
    let caught: unknown;
    try { await new MetaCloudWhatsAppProvider({ token: 'test', phoneNumberId: '12345' }).inspectSender('96877402910'); }
    catch (error) { caught = error; }
    expect(metaSenderIdentityErrorCode(caught)).toBe('META_HTTP_400_CODE_190_SUBCODE_463');
    expect(JSON.stringify(caught)).not.toContain('private-token-secret');
  });
  it.each([
    [new Error('Meta sender identity check failed (401)'), 'META_HTTP_401'],
    [new Error('WhatsApp access token and phone-number ID are required'), 'MISSING_PROVIDER_CONFIG'],
    [new Error('Meta sender identity evidence is incomplete or conflicting'), 'INCOMPLETE_PROVIDER_IDENTITY'],
    [new DOMException('private timeout details', 'TimeoutError'), 'PROVIDER_READ_TIMEOUT'],
    [new DOMException('private abort details', 'AbortError'), 'PROVIDER_READ_ABORTED'],
    [new SyntaxError('private response body'), 'INVALID_PROVIDER_RESPONSE'],
    [new TypeError('private transport URL'), 'PROVIDER_TRANSPORT_OR_RUNTIME_ERROR'],
    [new Error('private-provider-secret'), 'UNKNOWN_ERROR'],
  ])('retains only a safe reason code for failed identity reads', (error, code) => {
    expect(metaSenderIdentityErrorCode(error)).toBe(code);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('checks the actual configured sender without invoking messages', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '12345', display_phone_number: '+968 7740 2910', verified_name: 'Smart Visions',
    })));
    vi.stubGlobal('fetch', fetcher);
    const identity = await new MetaCloudWhatsAppProvider({ token: 'test-secret', phoneNumberId: '12345' })
      .inspectSender('96877402910');
    expect(identity).toMatchObject({ matchesExpected: true, displayPhoneNumber: '+968 7740 2910', phoneNumberId: '12345' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).not.toContain('/messages');
    expect(options.method).toBe('GET');
    expect(options.cache).toBe('no-store');
    expect(JSON.stringify(identity)).not.toContain('test-secret');
  });
  it('surfaces a different sender as a mismatch, never as a broken connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '12345', display_phone_number: '+968 9319 1993', verified_name: 'Sahra',
    }))));
    const result = await new MetaCloudWhatsAppProvider({ token: 'test', phoneNumberId: '12345' }).inspectSender('96877402910');
    expect(result.matchesExpected).toBe(false);
  });
  it.each([{ id: '12345' }, { id: 'other', display_phone_number: '+96877402910' }])('fails closed on incomplete or conflicting provider evidence: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(new MetaCloudWhatsAppProvider({ token: 'test', phoneNumberId: '12345' }).inspectSender('96877402910')).rejects.toThrow();
  });
  it('does not leak a provider error body or token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-provider-detail', { status: 401 })));
    await expect(new MetaCloudWhatsAppProvider({ token: 'test', phoneNumberId: '12345' }).inspectSender('96877402910'))
      .rejects.toThrow('Meta sender identity check failed (401)');
  });
});

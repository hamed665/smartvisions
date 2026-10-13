import { afterEach, describe, expect, it, vi } from 'vitest';

const { project, context } = vi.hoisted(() => ({ project: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/whatsapp/chatwoot-projection', () => ({ provisionWhatsAppChatwootProjection: project }));
vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization: context }));

import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { POST } from '@/app/api/integrations/meta/whatsapp/embedded-signup/chatwoot/route';

const secret = 'upstream-private-token-must-never-appear';
function request() {
  return new Request('https://app.example.com/api/integrations/meta/whatsapp/embedded-signup/chatwoot', {
    method: 'POST', body: JSON.stringify({ bindingId: 'existing-binding' }),
  });
}
afterEach(() => { vi.restoreAllMocks(); project.mockReset(); context.mockReset(); });

describe('OWNER WhatsApp Chatwoot failure diagnostics', () => {
  it.each([['AUTH_FAILED', 401], ['NOT_FOUND', 404], ['NETWORK_FAILED', null]] as const)('returns only classified %s and status, never upstream details', async (code, status) => {
    context.mockResolvedValue({ organizationId: 'org', supabase: {} });
    project.mockRejectedValue(new ChatwootHttpError({ code, status, message: secret }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain(`Diagnostic: ${code}; HTTP ${status ?? 'unavailable'}`);
    expect(body).not.toContain(secret);
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it('requires OWNER authentication before any projection call', async () => {
    context.mockRejectedValue(new Error(secret));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request());
    expect(context).toHaveBeenCalledWith(true);
    expect(project).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secret);
  });

  it('does not expose forged codes or invalid HTTP statuses', async () => {
    context.mockResolvedValue({ organizationId: 'org', supabase: {} });
    const error = new ChatwootHttpError({ code: 'AUTH_FAILED', message: secret });
    Object.assign(error, { code: secret, status: secret });
    project.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request());
    const body = await response.text();
    expect(body).toContain('Diagnostic: UNKNOWN; HTTP unavailable');
    expect(body).not.toContain(secret);
  });
});

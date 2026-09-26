import { describe, expect, it } from 'vitest';

import { evaluateChatwootProvisioningActivation } from '@/lib/chatwoot/activation-contract';

describe('Chatwoot provisioning activation contract', () => {
  it('requires production, explicit enablement, base URL, and a server-only token', () => {
    expect(
      evaluateChatwootProvisioningActivation({
        deploymentEnvironment: 'production',
        provisioningEnabled: 'true',
        baseUrl: 'https://inbox.smartvisionsai.com',
        platformToken: 'server-secret',
      }),
    ).toEqual({
      deploymentEnvironment: 'production',
      requested: true,
      baseUrlConfigured: true,
      platformTokenConfigured: true,
      ready: true,
      blockers: [],
    });
  });

  it('fails closed outside Production even when every other input is present', () => {
    const state = evaluateChatwootProvisioningActivation({
      deploymentEnvironment: 'candidate',
      provisioningEnabled: 'true',
      baseUrl: 'https://inbox.smartvisionsai.com',
      platformToken: 'server-secret',
    });

    expect(state.ready).toBe(false);
    expect(state.blockers).toContain('NOT_PRODUCTION');
  });

  it('fails closed while provisioning is disabled', () => {
    const state = evaluateChatwootProvisioningActivation({
      deploymentEnvironment: 'production',
      provisioningEnabled: 'false',
      baseUrl: 'https://inbox.smartvisionsai.com',
      platformToken: 'server-secret',
    });

    expect(state.ready).toBe(false);
    expect(state.blockers).toContain('PROVISIONING_DISABLED');
  });

  it('rejects non-HTTPS or path-bearing Production base URLs', () => {
    for (const baseUrl of [
      'http://inbox.smartvisionsai.com',
      'https://inbox.smartvisionsai.com/api',
      'https://user:pass@inbox.smartvisionsai.com',
      'https://inbox.smartvisionsai.com?token=x',
    ]) {
      const state = evaluateChatwootProvisioningActivation({
        deploymentEnvironment: 'production',
        provisioningEnabled: 'true',
        baseUrl,
        platformToken: 'server-secret',
      });

      expect(state.ready).toBe(false);
      expect(state.blockers).toContain('BASE_URL_INVALID');
    }
  });

  it('reports token presence only and never returns the token value', () => {
    const secret = 'super-sensitive-platform-token';
    const state = evaluateChatwootProvisioningActivation({
      deploymentEnvironment: 'production',
      provisioningEnabled: 'true',
      baseUrl: 'https://inbox.smartvisionsai.com',
      platformToken: secret,
    });

    expect(JSON.stringify(state)).not.toContain(secret);
    expect(state.platformTokenConfigured).toBe(true);
  });

  it('rejects control-character tokens as not safely configured', () => {
    const state = evaluateChatwootProvisioningActivation({
      deploymentEnvironment: 'production',
      provisioningEnabled: 'true',
      baseUrl: 'https://inbox.smartvisionsai.com',
      platformToken: 'bad\ntoken',
    });

    expect(state.ready).toBe(false);
    expect(state.blockers).toContain('PLATFORM_TOKEN_MISSING');
  });
});

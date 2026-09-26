import { describe, expect, it } from 'vitest';

import { buildChatwootReadiness } from '@/lib/chatwoot/readiness-contract';

function readyInput() {
  return {
    deploymentEnvironment: 'production',
    provisioningEnabled: false,
    baseUrlValid: true,
    platformTokenConfigured: true,
    chatwootHealthy: true,
    brandCount: 1,
    tenantBusinessCount: 1,
    accountMappingCount: 0,
    userMappingCount: 0,
    membershipCount: 0,
    inboxMappingCount: 0,
    teamMappingCount: 0,
  };
}

describe('Chatwoot readiness contract', () => {
  it('is ready to activate before provisioning is enabled when all prerequisites exist', () => {
    const state = buildChatwootReadiness(readyInput());

    expect(state.activationReady).toBe(true);
    expect(state.liveProvisioningReady).toBe(false);
    expect(state.blockers).toEqual([]);
  });

  it('becomes live-ready only after the explicit provisioning flag is enabled', () => {
    const state = buildChatwootReadiness({
      ...readyInput(),
      provisioningEnabled: true,
    });

    expect(state.activationReady).toBe(true);
    expect(state.liveProvisioningReady).toBe(true);
  });

  it('fails closed while the server-only Platform token is absent', () => {
    const state = buildChatwootReadiness({
      ...readyInput(),
      platformTokenConfigured: false,
    });

    expect(state.activationReady).toBe(false);
    expect(state.blockers).toContain('PLATFORM_TOKEN_MISSING');
  });

  it('requires evidence-backed Brand and tenant Business scope', () => {
    const state = buildChatwootReadiness({
      ...readyInput(),
      brandCount: 0,
      tenantBusinessCount: 0,
    });

    expect(state.activationReady).toBe(false);
    expect(state.blockers).toEqual(
      expect.arrayContaining(['REAL_BRAND_MISSING', 'REAL_BUSINESS_MISSING']),
    );
  });

  it('requires real Chatwoot health and a valid Production routing boundary', () => {
    const state = buildChatwootReadiness({
      ...readyInput(),
      deploymentEnvironment: 'candidate',
      baseUrlValid: false,
      chatwootHealthy: false,
    });

    expect(state.activationReady).toBe(false);
    expect(state.blockers).toEqual(
      expect.arrayContaining([
        'NOT_PRODUCTION',
        'BASE_URL_INVALID',
        'CHATWOOT_UNHEALTHY',
      ]),
    );
  });

  it('exposes only sanitized readiness and projection counts', () => {
    const serialized = JSON.stringify(buildChatwootReadiness(readyInput()));

    expect(serialized).toContain('"platformTokenConfigured":true');
    expect(serialized).not.toContain('api_access_token');
    expect(serialized).not.toContain('CHATWOOT_PLATFORM_TOKEN');
  });
});

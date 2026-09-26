export type ChatwootReadinessInput = {
  deploymentEnvironment: string | null;
  provisioningEnabled: boolean;
  baseUrlValid: boolean;
  platformTokenConfigured: boolean;
  chatwootHealthy: boolean;
  brandCount: number;
  tenantBusinessCount: number;
  accountMappingCount: number;
  userMappingCount: number;
  membershipCount: number;
  inboxMappingCount: number;
  teamMappingCount: number;
};

export type ChatwootReadinessBlocker =
  | 'NOT_PRODUCTION'
  | 'BASE_URL_INVALID'
  | 'CHATWOOT_UNHEALTHY'
  | 'PLATFORM_TOKEN_MISSING'
  | 'REAL_BRAND_MISSING'
  | 'REAL_BUSINESS_MISSING';

export function buildChatwootReadiness(input: ChatwootReadinessInput) {
  const blockers: ChatwootReadinessBlocker[] = [];

  if (input.deploymentEnvironment !== 'production') blockers.push('NOT_PRODUCTION');
  if (!input.baseUrlValid) blockers.push('BASE_URL_INVALID');
  if (!input.chatwootHealthy) blockers.push('CHATWOOT_UNHEALTHY');
  if (!input.platformTokenConfigured) blockers.push('PLATFORM_TOKEN_MISSING');
  if (input.brandCount < 1) blockers.push('REAL_BRAND_MISSING');
  if (input.tenantBusinessCount < 1) blockers.push('REAL_BUSINESS_MISSING');

  const activationReady = blockers.length === 0;
  const liveProvisioningReady = activationReady && input.provisioningEnabled;

  return {
    deploymentEnvironment: input.deploymentEnvironment,
    provisioningEnabled: input.provisioningEnabled,
    baseUrlValid: input.baseUrlValid,
    platformTokenConfigured: input.platformTokenConfigured,
    chatwootHealthy: input.chatwootHealthy,
    brandCount: input.brandCount,
    tenantBusinessCount: input.tenantBusinessCount,
    projectionCounts: {
      accounts: input.accountMappingCount,
      users: input.userMappingCount,
      memberships: input.membershipCount,
      inboxes: input.inboxMappingCount,
      teams: input.teamMappingCount,
    },
    activationReady,
    liveProvisioningReady,
    blockers,
  };
}

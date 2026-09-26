export type ChatwootProvisioningBlocker =
  | 'NOT_PRODUCTION'
  | 'PROVISIONING_DISABLED'
  | 'BASE_URL_INVALID'
  | 'PLATFORM_TOKEN_MISSING';

export type ChatwootProvisioningActivation = {
  deploymentEnvironment: string | null;
  requested: boolean;
  baseUrlConfigured: boolean;
  platformTokenConfigured: boolean;
  ready: boolean;
  blockers: ChatwootProvisioningBlocker[];
};

function hasSafeSecretShape(value: unknown) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 4096 &&
    !/[\x00-\x1F\x7F]/.test(value)
  );
}

export function evaluateChatwootProvisioningActivation(input: {
  deploymentEnvironment: unknown;
  provisioningEnabled: unknown;
  baseUrl: unknown;
  platformToken: unknown;
}): ChatwootProvisioningActivation {
  const deploymentEnvironment =
    typeof input.deploymentEnvironment === 'string'
      ? input.deploymentEnvironment.trim()
      : null;
  const requested = input.provisioningEnabled === 'true';
  const baseUrlConfigured =
    typeof input.baseUrl === 'string' && input.baseUrl.trim().length > 0;
  const platformTokenConfigured = hasSafeSecretShape(input.platformToken);

  const blockers: ChatwootProvisioningBlocker[] = [];

  if (deploymentEnvironment !== 'production') {
    blockers.push('NOT_PRODUCTION');
  }
  if (!requested) {
    blockers.push('PROVISIONING_DISABLED');
  }
  if (!baseUrlConfigured) {
    blockers.push('BASE_URL_INVALID');
  }
  if (!platformTokenConfigured) {
    blockers.push('PLATFORM_TOKEN_MISSING');
  }

  return {
    deploymentEnvironment,
    requested,
    baseUrlConfigured,
    platformTokenConfigured,
    ready: blockers.length === 0,
    blockers,
  };
}

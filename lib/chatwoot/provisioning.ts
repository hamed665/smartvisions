import 'server-only';

import {
  ChatwootHttpError,
  chatwootPlatformProvisioningRequest,
} from '@/lib/chatwoot/http';
import {
  accountProjectionMatchesTenant,
  buildChatwootAccountCustomAttributes,
  buildChatwootUserCustomAttributes,
  buildChatwootUserPresentation,
  findProjectedAccount,
  inspectChatwootUserProjectionMarker,
  normalizeCanonicalEmail,
  parseChatwootAccount,
  parseChatwootAccountUser,
  parseChatwootUser,
  userProjectionMarker,
  type ChatwootAccountProjection,
  type ChatwootAccountUserProjection,
  type ChatwootUserProjection,
} from '@/lib/chatwoot/provisioning-contract';
import {
  normalizeChatwootInt32Id,
  type ChatwootAccountRole,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

export type ChatwootProvisioningErrorCode =
  | 'INVALID_INPUT'
  | 'DUPLICATE_MATCH'
  | 'IDENTITY_CONFLICT'
  | 'UPSTREAM_MISMATCH'
  | 'RECONCILIATION_REQUIRED';

export class ChatwootProvisioningError extends Error {
  code: ChatwootProvisioningErrorCode;

  constructor(code: ChatwootProvisioningErrorCode, message: string) {
    super(message);
    this.name = 'ChatwootProvisioningError';
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, field: string) {
  const normalized = value.trim();
  if (!UUID_RE.test(normalized)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      `${field} must be a canonical UUID`,
    );
  }
  return normalized;
}

function requireName(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      `${field} is invalid`,
    );
  }
  return normalized;
}

export function generateEphemeralChatwootPassword() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function listProjectedAccounts(input: {
  tenantBusinessId: string;
  fetchImpl?: typeof fetch;
}) {
  const values = await chatwootPlatformProvisioningRequest<unknown>({
    path: '/platform/api/v1/accounts',
    fetchImpl: input.fetchImpl,
  });

  return findProjectedAccount(values, input.tenantBusinessId);
}

export async function ensureChatwootAccount(input: {
  tenantBusinessId: string;
  name: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  account: ChatwootAccountProjection;
  outcome: 'ADOPTED' | 'CREATED' | 'ADOPTED_AFTER_AMBIGUOUS_CREATE';
}> {
  const tenantBusinessId = requireUuid(
    input.tenantBusinessId,
    'tenantBusinessId',
  );
  const name = requireName(input.name, 'Account name');

  const existing = await listProjectedAccounts({
    tenantBusinessId,
    fetchImpl: input.fetchImpl,
  });

  if (existing.kind === 'AMBIGUOUS') {
    throw new ChatwootProvisioningError(
      'DUPLICATE_MATCH',
      'Multiple Chatwoot Accounts match the tenant Business marker',
    );
  }

  if (existing.kind === 'ONE') {
    return { account: existing.account, outcome: 'ADOPTED' };
  }

  try {
    const raw = await chatwootPlatformProvisioningRequest<unknown>({
      path: '/platform/api/v1/accounts',
      method: 'POST',
      body: {
        name,
        custom_attributes: buildChatwootAccountCustomAttributes(
          tenantBusinessId,
        ),
      },
      fetchImpl: input.fetchImpl,
    });

    const account = parseChatwootAccount(raw);
    if (!accountProjectionMatchesTenant(account, tenantBusinessId)) {
      throw new ChatwootProvisioningError(
        'UPSTREAM_MISMATCH',
        'Created Chatwoot Account is missing the expected projection marker',
      );
    }

    return { account, outcome: 'CREATED' };
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    const reconciled = await listProjectedAccounts({
      tenantBusinessId,
      fetchImpl: input.fetchImpl,
    });

    if (reconciled.kind === 'ONE') {
      return {
        account: reconciled.account,
        outcome: 'ADOPTED_AFTER_AMBIGUOUS_CREATE',
      };
    }

    if (reconciled.kind === 'AMBIGUOUS') {
      throw new ChatwootProvisioningError(
        'DUPLICATE_MATCH',
        'Ambiguous Account create reconciled to multiple marker matches',
      );
    }

    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Ambiguous Account create has no confirmed external match',
    );
  }
}

async function createChatwootUserOnce(input: {
  email: string;
  name: string;
  displayName: string | null;
  password: string;
  smartUserId: string;
  fetchImpl?: typeof fetch;
}) {
  return chatwootPlatformProvisioningRequest<unknown>({
    path: '/platform/api/v1/users',
    method: 'POST',
    body: {
      email: input.email,
      name: input.name,
      ...(input.displayName ? { display_name: input.displayName } : {}),
      password: input.password,
      custom_attributes: buildChatwootUserCustomAttributes(input.smartUserId),
    },
    fetchImpl: input.fetchImpl,
  });
}

export async function ensureChatwootUser(input: {
  smartUserId: string;
  email: string;
  trustedDisplayName?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{
  user: ChatwootUserProjection;
  outcome: 'CREATED_OR_ADOPTED' | 'RECOVERED_BY_SAFE_EMAIL_RETRY';
}> {
  const smartUserId = requireUuid(input.smartUserId, 'smartUserId');
  const presentation = buildChatwootUserPresentation({
    email: input.email,
    trustedDisplayName: input.trustedDisplayName,
  });
  const password = generateEphemeralChatwootPassword();

  let raw: unknown;
  let outcome: 'CREATED_OR_ADOPTED' | 'RECOVERED_BY_SAFE_EMAIL_RETRY' =
    'CREATED_OR_ADOPTED';

  try {
    raw = await createChatwootUserOnce({
      email: presentation.email,
      name: presentation.name,
      displayName: presentation.displayName,
      password,
      smartUserId,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    try {
      raw = await createChatwootUserOnce({
        email: presentation.email,
        name: presentation.name,
        displayName: presentation.displayName,
        password,
        smartUserId,
        fetchImpl: input.fetchImpl,
      });
      outcome = 'RECOVERED_BY_SAFE_EMAIL_RETRY';
    } catch (retryError) {
      if (
        retryError instanceof ChatwootHttpError &&
        retryError.ambiguousMutationOutcome
      ) {
        throw new ChatwootProvisioningError(
          'RECONCILIATION_REQUIRED',
          'Chatwoot User create remains ambiguous after safe email retry',
        );
      }
      throw retryError;
    }
  }

  const adopted = parseChatwootUser(raw);
  if (adopted.email !== normalizeCanonicalEmail(presentation.email)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot User email does not match canonical Smart identity',
    );
  }

  const marker = inspectChatwootUserProjectionMarker(adopted);
  if (marker.kind === 'INVALID') {
    throw new ChatwootProvisioningError(
      'IDENTITY_CONFLICT',
      'Chatwoot User has malformed Smart projection identity metadata',
    );
  }
  if (marker.kind === 'VALID' && marker.smartUserId !== smartUserId) {
    throw new ChatwootProvisioningError(
      'IDENTITY_CONFLICT',
      'Chatwoot User is already projected from another Smart user',
    );
  }

  let patchedRaw: unknown;
  try {
    patchedRaw = await chatwootPlatformProvisioningRequest<unknown>({
      path: `/platform/api/v1/users/${adopted.id}`,
      method: 'PATCH',
      body: {
        email: presentation.email,
        name: presentation.name,
        ...(presentation.displayName
          ? { display_name: presentation.displayName }
          : {}),
        custom_attributes: buildChatwootUserCustomAttributes(smartUserId),
      },
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (
      error instanceof ChatwootHttpError &&
      error.ambiguousMutationOutcome
    ) {
      throw new ChatwootProvisioningError(
        'RECONCILIATION_REQUIRED',
        'Chatwoot User marker update has an ambiguous external outcome',
      );
    }
    throw error;
  }

  const user = parseChatwootUser(patchedRaw);
  if (
    user.id !== adopted.id ||
    user.email !== presentation.email ||
    userProjectionMarker(user) !== smartUserId
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot User verification failed after projection marker update',
    );
  }

  return { user, outcome };
}

async function createOrUpdateAccountUserOnce(input: {
  accountId: number;
  userId: number;
  role: ChatwootAccountRole;
  fetchImpl?: typeof fetch;
}) {
  return chatwootPlatformProvisioningRequest<unknown>({
    path: `/platform/api/v1/accounts/${input.accountId}/account_users`,
    method: 'POST',
    body: {
      user_id: input.userId,
      role: input.role,
    },
    fetchImpl: input.fetchImpl,
  });
}

export async function ensureChatwootAccountUser(input: {
  accountId: number;
  userId: number;
  role: ChatwootAccountRole;
  fetchImpl?: typeof fetch;
}): Promise<{
  accountUser: ChatwootAccountUserProjection;
  outcome: 'CREATED_OR_UPDATED' | 'RECOVERED_BY_SAFE_MEMBERSHIP_RETRY';
}> {
  const accountId = normalizeChatwootInt32Id(input.accountId);
  const userId = normalizeChatwootInt32Id(input.userId);
  if (
    accountId === null ||
    userId === null ||
    (input.role !== 'agent' && input.role !== 'administrator')
  ) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Chatwoot Account/User membership input is invalid',
    );
  }

  const normalizedInput = {
    ...input,
    accountId,
    userId,
  };

  let raw: unknown;
  let outcome:
    | 'CREATED_OR_UPDATED'
    | 'RECOVERED_BY_SAFE_MEMBERSHIP_RETRY' = 'CREATED_OR_UPDATED';

  try {
    raw = await createOrUpdateAccountUserOnce(normalizedInput);
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    try {
      raw = await createOrUpdateAccountUserOnce(normalizedInput);
      outcome = 'RECOVERED_BY_SAFE_MEMBERSHIP_RETRY';
    } catch (retryError) {
      if (
        retryError instanceof ChatwootHttpError &&
        retryError.ambiguousMutationOutcome
      ) {
        throw new ChatwootProvisioningError(
          'RECONCILIATION_REQUIRED',
          'Chatwoot AccountUser mutation remains ambiguous after safe retry',
        );
      }
      throw retryError;
    }
  }

  const accountUser = parseChatwootAccountUser(raw);
  if (
    accountUser.accountId !== accountId ||
    accountUser.userId !== userId ||
    accountUser.role !== input.role
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot AccountUser response does not match requested membership',
    );
  }

  return { accountUser, outcome };
}

import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
  projectedChatwootUserName,
  type ChatwootAccountRole,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

export const CHATWOOT_PROJECTION_VERSION = '1';

export const CHATWOOT_ACCOUNT_MARKER_KEY = 'smartvisions_tenant_business_id';
export const CHATWOOT_USER_MARKER_KEY = 'smartvisions_user_id';
export const CHATWOOT_PROJECTION_MARKER_KEY = 'smartvisions_projection';
export const CHATWOOT_PROJECTION_VERSION_KEY = 'smartvisions_projection_version';

export type ChatwootAccountProjection = {
  id: number;
  name: string;
  customAttributes: Record<string, unknown>;
};

export type ChatwootUserProjection = {
  id: number;
  email: string;
  name: string;
  displayName: string | null;
  customAttributes: Record<string, unknown>;
};

export type ChatwootAccountUserProjection = {
  id: string;
  accountId: number;
  userId: number;
  role: ChatwootAccountRole;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Chatwoot response field ${field} is invalid`);
  }
  return value.trim();
}

export function normalizeCanonicalEmail(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toLowerCase();
}

export function buildChatwootAccountCustomAttributes(tenantBusinessId: string) {
  return {
    [CHATWOOT_ACCOUNT_MARKER_KEY]: tenantBusinessId,
    [CHATWOOT_PROJECTION_MARKER_KEY]: true,
    [CHATWOOT_PROJECTION_VERSION_KEY]: CHATWOOT_PROJECTION_VERSION,
  };
}

export function buildChatwootUserCustomAttributes(smartUserId: string) {
  return {
    [CHATWOOT_USER_MARKER_KEY]: smartUserId,
    [CHATWOOT_PROJECTION_MARKER_KEY]: true,
    [CHATWOOT_PROJECTION_VERSION_KEY]: CHATWOOT_PROJECTION_VERSION,
  };
}

export function parseChatwootAccount(value: unknown): ChatwootAccountProjection {
  const row = record(value);
  const id = normalizeChatwootInt32Id(row.id);
  if (id === null) throw new Error('Chatwoot Account ID is invalid');

  return {
    id,
    name: requiredString(row.name, 'name'),
    customAttributes: record(row.custom_attributes),
  };
}

export function parseChatwootUser(value: unknown): ChatwootUserProjection {
  const row = record(value);
  const id = normalizeChatwootInt32Id(row.id);
  if (id === null) throw new Error('Chatwoot User ID is invalid');

  const email = normalizeCanonicalEmail(row.email);
  if (!email) throw new Error('Chatwoot User email is invalid');

  return {
    id,
    email,
    name: requiredString(row.name, 'name'),
    displayName:
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim()
        : null,
    customAttributes: record(row.custom_attributes),
  };
}

export function parseChatwootAccountUser(
  value: unknown,
): ChatwootAccountUserProjection {
  const row = record(value);
  const id = normalizeChatwootInt64Id(row.id);
  const accountId = normalizeChatwootInt32Id(row.account_id);
  const userId = normalizeChatwootInt32Id(row.user_id);
  const role = row.role;

  if (id === null) throw new Error('Chatwoot AccountUser ID is invalid');
  if (accountId === null) throw new Error('Chatwoot AccountUser Account ID is invalid');
  if (userId === null) throw new Error('Chatwoot AccountUser User ID is invalid');
  if (role !== 'agent' && role !== 'administrator') {
    throw new Error('Chatwoot AccountUser role is invalid');
  }

  return {
    id,
    accountId,
    userId,
    role,
  };
}

export function accountProjectionMatchesTenant(
  account: ChatwootAccountProjection,
  tenantBusinessId: string,
) {
  return (
    account.customAttributes[CHATWOOT_ACCOUNT_MARKER_KEY] === tenantBusinessId &&
    account.customAttributes[CHATWOOT_PROJECTION_MARKER_KEY] === true &&
    account.customAttributes[CHATWOOT_PROJECTION_VERSION_KEY] ===
      CHATWOOT_PROJECTION_VERSION
  );
}

export function inspectChatwootUserProjectionMarker(
  user: ChatwootUserProjection,
):
  | { kind: 'ABSENT' }
  | { kind: 'VALID'; smartUserId: string }
  | { kind: 'INVALID' } {
  const attributes = user.customAttributes;
  const rawUserId = attributes[CHATWOOT_USER_MARKER_KEY];
  const projection = attributes[CHATWOOT_PROJECTION_MARKER_KEY];
  const version = attributes[CHATWOOT_PROJECTION_VERSION_KEY];

  const hasAnyMarker =
    rawUserId !== undefined ||
    projection !== undefined ||
    version !== undefined;

  if (!hasAnyMarker) return { kind: 'ABSENT' };

  if (
    typeof rawUserId !== 'string' ||
    !rawUserId.trim() ||
    projection !== true ||
    version !== CHATWOOT_PROJECTION_VERSION
  ) {
    return { kind: 'INVALID' };
  }

  return { kind: 'VALID', smartUserId: rawUserId.trim() };
}

export function userProjectionMarker(
  user: ChatwootUserProjection,
): string | null {
  const marker = inspectChatwootUserProjectionMarker(user);
  return marker.kind === 'VALID' ? marker.smartUserId : null;
}

export function findProjectedAccount(
  values: unknown,
  tenantBusinessId: string,
):
  | { kind: 'NONE' }
  | { kind: 'ONE'; account: ChatwootAccountProjection }
  | { kind: 'AMBIGUOUS'; accounts: ChatwootAccountProjection[] } {
  if (!Array.isArray(values)) {
    throw new Error('Chatwoot Account list response is invalid');
  }

  const matches = values
    .map(parseChatwootAccount)
    .filter((account) => accountProjectionMatchesTenant(account, tenantBusinessId));

  if (matches.length === 0) return { kind: 'NONE' };
  if (matches.length === 1) return { kind: 'ONE', account: matches[0] };
  return { kind: 'AMBIGUOUS', accounts: matches };
}

export function buildChatwootUserPresentation(input: {
  email: string;
  trustedDisplayName?: string | null;
}) {
  const email = normalizeCanonicalEmail(input.email);
  if (!email) throw new Error('Canonical Smart user email is invalid');

  const name = projectedChatwootUserName({
    email,
    trustedDisplayName: input.trustedDisplayName,
  });

  return {
    email,
    name,
    displayName: input.trustedDisplayName?.trim() || null,
  };
}

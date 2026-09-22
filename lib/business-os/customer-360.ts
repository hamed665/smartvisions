export const CRM_CONTACT_STATES = ['ACTIVE', 'ARCHIVED', 'MERGED'] as const;
export type CrmContactState = (typeof CRM_CONTACT_STATES)[number];

export const CRM_IDENTITY_TYPES = ['EMAIL', 'PHONE', 'WHATSAPP'] as const;
export type CrmIdentityType = (typeof CRM_IDENTITY_TYPES)[number];

export const CRM_IDENTITY_STATES = ['ACTIVE', 'RETIRED'] as const;
export type CrmIdentityState = (typeof CRM_IDENTITY_STATES)[number];

export function normalizeCrmIdentityValue(
  identityType: CrmIdentityType,
  rawValue: string,
): string {
  const value = rawValue.trim();
  if (identityType === 'EMAIL') return value.toLowerCase();
  return value.replace(/[^0-9]+/g, '');
}

export function crmIdentityKey(input: {
  organizationId: string;
  identityType: CrmIdentityType;
  rawValue: string;
}) {
  const normalized = normalizeCrmIdentityValue(input.identityType, input.rawValue);
  if (!input.organizationId.trim()) throw new Error('organizationId is required');
  if (!normalized) throw new Error('identity value normalizes to empty');
  return `${input.organizationId}:${input.identityType}:${normalized}`;
}

export function isCrmContactTransitionAllowed(
  from: CrmContactState,
  to: CrmContactState,
) {
  if (from === to) return true;
  if (from === 'MERGED') return false;
  if (from === 'ACTIVE') return to === 'ARCHIVED' || to === 'MERGED';
  if (from === 'ARCHIVED') return to === 'ACTIVE' || to === 'MERGED';
  return false;
}

export function isCrmIdentityTransitionAllowed(
  from: CrmIdentityState,
  to: CrmIdentityState,
) {
  if (from === to) return true;
  return from === 'ACTIVE' && to === 'RETIRED';
}

export function canonicalCrmContactId(input: {
  id: string;
  status: CrmContactState;
  mergedIntoContactId?: string | null;
}) {
  if (input.status !== 'MERGED') return input.id;
  if (!input.mergedIntoContactId) {
    throw new Error('MERGED contact requires mergedIntoContactId');
  }
  if (input.mergedIntoContactId === input.id) {
    throw new Error('contact cannot merge into itself');
  }
  return input.mergedIntoContactId;
}

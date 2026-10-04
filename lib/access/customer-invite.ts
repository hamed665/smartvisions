import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

export const CUSTOMER_INVITE_COOKIE = 'sv_customer_invite';

export function createCustomerInviteSecret() {
  return randomBytes(32).toString('hex');
}

export function normalizeCustomerInviteSecret(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

export function hashCustomerInviteSecret(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function customerInviteCookieOptions(expiresAt: string | Date) {
  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax' as const,
    path: '/api/access/invites',
    expires,
  };
}

export function normalizeCustomerInviteEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 320) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export const CUSTOMER_INVITE_ROLES = [
  'OWNER',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
  'VIEWER',
] as const;

export type CustomerInviteRole = (typeof CUSTOMER_INVITE_ROLES)[number];

export function normalizeCustomerInviteRole(value: unknown): CustomerInviteRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CUSTOMER_INVITE_ROLES.includes(role as CustomerInviteRole)
    ? role as CustomerInviteRole
    : null;
}

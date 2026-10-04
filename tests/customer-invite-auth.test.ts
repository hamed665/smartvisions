import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  CUSTOMER_INVITE_COOKIE,
  createCustomerInviteSecret,
  customerInviteCookieOptions,
  hashCustomerInviteSecret,
  normalizeCustomerInviteEmail,
  normalizeCustomerInviteRole,
  normalizeCustomerInviteSecret,
} from '@/lib/access/customer-invite';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('customer invite + auth capability', () => {
  it('uses 256-bit bearer secrets and persists only hashes', () => {
    const secret = createCustomerInviteSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeCustomerInviteSecret(secret)).toBe(secret);
    expect(normalizeCustomerInviteSecret('not-a-token')).toBeNull();

    const hash = hashCustomerInviteSecret(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(secret);
  });

  it('normalizes canonical email and role inputs', () => {
    expect(normalizeCustomerInviteEmail(' Customer@Example.COM ')).toBe('customer@example.com');
    expect(normalizeCustomerInviteEmail('invalid')).toBeNull();
    expect(normalizeCustomerInviteRole('admin')).toBe('ADMIN');
    expect(normalizeCustomerInviteRole('SUPER_ADMIN')).toBeNull();
  });

  it('keeps the invitation session HttpOnly and bounded', () => {
    const options = customerInviteCookieOptions('2030-01-01T00:00:00.000Z');
    expect(CUSTOMER_INVITE_COOKIE).toBe('sv_customer_invite');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.expires.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('keeps canonical Auth and membership authorities instead of creating parallel IAM', () => {
    const migration = read('supabase/migrations/20261004213900_customer_invite_auth.sql');
    expect(migration).toContain('references public.organization_members');
    expect(migration).toContain('insert into public.organization_members');
    expect(migration).toContain('from auth.users');
    expect(migration).toContain('alter table public.organization_member_invitations enable row level security');
    expect(migration).toContain('organization_member_invitations_owner_read');
    expect(migration).toContain('security definer');
    expect(migration).toContain('security invoker');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('grant execute on function public.accept_organization_member_invitation');
    expect(migration).not.toContain('customer_users');
    expect(migration).not.toContain('customer_tenants');
    expect(migration).not.toContain('user_metadata');
  });

  it('accepts membership only through the authenticated Supabase session', () => {
    const acceptRoute = read('app/api/access/invites/accept/route.ts');
    expect(acceptRoute).toContain("import { createClient } from '@/lib/supabase/server'");
    expect(acceptRoute).toContain('supabase.auth.getUser()');
    expect(acceptRoute).toContain("supabase.rpc('accept_organization_member_invitation'");
    expect(acceptRoute).not.toContain('createSupabaseServiceClient');
    expect(acceptRoute).not.toContain('p_actor_user_id');
    expect(acceptRoute).not.toContain('p_actor_email');
  });

  it('uses the server service credential only for anonymous capability redemption/context', () => {
    const issueRoute = read('app/api/access/invites/route.ts');
    const redeemRoute = read('app/api/access/invites/redeem/route.ts');
    const sessionRoute = read('app/api/access/invites/session/route.ts');

    expect(issueRoute).not.toContain('createSupabaseServiceClient');
    expect(redeemRoute).toContain('createSupabaseServiceClient');
    expect(redeemRoute).toContain('hashCustomerInviteSecret(token)');
    expect(sessionRoute).toContain('createSupabaseServiceClient');
    expect(redeemRoute).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(sessionRoute).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps passwords inside Supabase Auth and supports PKCE callback/recovery', () => {
    const page = read('app/invite/accept/page.tsx');
    const callback = read('app/auth/callback/route.ts');
    const recovery = read('app/auth/forgot-password/page.tsx');

    expect(page).toContain('supabase.auth.signUp');
    expect(page).toContain('supabase.auth.signInWithPassword');
    expect(page).not.toMatch(/fetch\([^)]*password/i);
    expect(callback).toContain('exchangeCodeForSession');
    expect(callback).toContain("value.startsWith('//')");
    expect(recovery).toContain('resetPasswordForEmail');
  });

  it('opens only the bounded unauthenticated invite surfaces in the session proxy', () => {
    const proxy = read('lib/supabase/proxy.ts');
    expect(proxy).toContain("'/api/access/invites/redeem'");
    expect(proxy).toContain("'/api/access/invites/session'");
    expect(proxy).toContain("'/invite/accept'");
    expect(proxy).not.toContain("'/api/access/invites/accept',");
    expect(proxy).toContain("'Cache-Control', 'private, no-store'");
  });
});

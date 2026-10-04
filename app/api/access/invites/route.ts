import { NextResponse } from 'next/server';

import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import {
  createCustomerInviteSecret,
  hashCustomerInviteSecret,
  normalizeCustomerInviteEmail,
  normalizeCustomerInviteRole,
} from '@/lib/access/customer-invite';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const runtime = 'nodejs';

type InviteBody = {
  email?: string;
  role?: string;
  tenantBusinessId?: string;
};

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as InviteBody;
    const email = normalizeCustomerInviteEmail(body.email);
    const role = normalizeCustomerInviteRole(body.role);
    const tenantBusinessId = body.tenantBusinessId
      ? normalizeCustomerBusinessId(body.tenantBusinessId)
      : null;

    if (!email || !role || (body.tenantBusinessId && !tenantBusinessId)) {
      return NextResponse.json(
        { error: 'A valid email, canonical role, and Business id are required.' },
        { status: 400 },
      );
    }

    if (role !== 'OWNER' && !tenantBusinessId) {
      return NextResponse.json(
        { error: 'Non-OWNER customer invitations require an explicit Business.' },
        { status: 400 },
      );
    }

    const secret = createCustomerInviteSecret();
    const tokenHash = hashCustomerInviteSecret(secret);
    const requestKey = `customer-invite-issue:${crypto.randomUUID()}`;

    const rpc = tenantBusinessId
      ? 'issue_organization_member_business_invitation'
      : 'issue_organization_member_invitation';
    const args = tenantBusinessId
      ? {
          p_organization_id: ctx.organizationId,
          p_tenant_business_id: tenantBusinessId,
          p_email: email,
          p_role: role,
          p_invitation_token_hash: tokenHash,
          p_request_key: requestKey,
        }
      : {
          p_organization_id: ctx.organizationId,
          p_email: email,
          p_role: role,
          p_invitation_token_hash: tokenHash,
          p_request_key: requestKey,
        };

    const { data, error } = await ctx.supabase.rpc(rpc, args);
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.invitation_id || !row?.expires_at) {
      return NextResponse.json(
        { error: 'Unable to issue customer invitation safely.' },
        { status: 409 },
      );
    }

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ok: true,
      invitationId: row.invitation_id,
      organizationId: row.organization_id,
      tenantBusinessId: row.tenant_business_id ?? null,
      email: row.email,
      role: row.role,
      version: row.version,
      expiresAt: row.expires_at,
      inviteUrl: `${origin}/invite/accept#${secret}`,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to issue customer invitation.' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

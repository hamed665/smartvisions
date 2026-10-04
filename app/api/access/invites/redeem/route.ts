import { NextResponse } from 'next/server';

import {
  CUSTOMER_INVITE_COOKIE,
  createCustomerInviteSecret,
  customerInviteCookieOptions,
  hashCustomerInviteSecret,
  normalizeCustomerInviteSecret,
} from '@/lib/access/customer-invite';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

type RedeemBody = { token?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json() as RedeemBody;
    const token = normalizeCustomerInviteSecret(body.token);
    if (!token) {
      return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });
    }

    const sessionSecret = createCustomerInviteSecret();
    const sessionHash = hashCustomerInviteSecret(sessionSecret);
    const service = createSupabaseServiceClient();

    const { data, error } = await service.rpc(
      'redeem_organization_member_invitation',
      {
        p_invitation_token_hash: hashCustomerInviteSecret(token),
        p_session_token_hash: sessionHash,
        p_request_key: `customer-invite-redeem:${crypto.randomUUID()}`,
      },
    );
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.invitation_id || !row?.session_expires_at) {
      return NextResponse.json(
        { error: 'Invitation is expired, used, or revoked.' },
        {
          status: 410,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    const { data: contextData, error: contextError } = await service.rpc(
      'get_organization_member_business_invitation_context',
      { p_session_token_hash: sessionHash },
    );
    const context = Array.isArray(contextData) ? contextData[0] : contextData;
    if (contextError || !context?.invitation_id) {
      return NextResponse.json(
        { error: 'Invitation context is unavailable.' },
        {
          status: 410,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    const response = NextResponse.json({
      ok: true,
      invitationId: context.invitation_id,
      organizationId: context.organization_id,
      organizationName: context.organization_name,
      tenantBusinessId: context.tenant_business_id ?? null,
      businessName: context.business_name ?? null,
      email: context.email,
      role: context.role,
      version: context.version,
      expiresAt: context.session_expires_at,
      acceptedAt: context.accepted_at,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });

    response.cookies.set(
      CUSTOMER_INVITE_COOKIE,
      sessionSecret,
      customerInviteCookieOptions(row.session_expires_at),
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Unable to redeem invitation.' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

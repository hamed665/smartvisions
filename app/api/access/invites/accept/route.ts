import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  CUSTOMER_INVITE_COOKIE,
  hashCustomerInviteSecret,
  normalizeCustomerInviteSecret,
} from '@/lib/access/customer-invite';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const secret = normalizeCustomerInviteSecret(
      cookieStore.get(CUSTOMER_INVITE_COOKIE)?.value,
    );
    if (!secret) {
      return NextResponse.json({ error: 'Invitation session required.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc(
      'accept_organization_member_business_invitation',
      {
        p_session_token_hash: hashCustomerInviteSecret(secret),
        p_request_key: `customer-invite-accept:${crypto.randomUUID()}`,
      },
    );
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.organization_id || row.user_id !== userData.user.id) {
      return NextResponse.json(
        { error: 'Invitation cannot be accepted by this account.' },
        {
          status: 403,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    return NextResponse.json({
      ok: true,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.canonical_role,
      invitedRole: row.invited_role,
      tenantBusinessId: row.tenant_business_id ?? null,
      businessRole: row.business_role ?? null,
      acceptedAt: row.accepted_at,
      replayed: row.replayed,
      scopeReplayed: row.scope_replayed,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to accept invitation.' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  CUSTOMER_INVITE_COOKIE,
  hashCustomerInviteSecret,
  normalizeCustomerInviteSecret,
} from '@/lib/access/customer-invite';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const secret = normalizeCustomerInviteSecret(
      cookieStore.get(CUSTOMER_INVITE_COOKIE)?.value,
    );
    if (!secret) {
      return NextResponse.json({ error: 'Invitation session required.' }, { status: 401 });
    }

    const service = createSupabaseServiceClient();
    const { data, error } = await service.rpc(
      'get_organization_member_business_invitation_context',
      {
        p_session_token_hash: hashCustomerInviteSecret(secret),
      },
    );
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.invitation_id) {
      return NextResponse.json(
        { error: 'Invitation session is no longer valid.' },
        { status: 410 },
      );
    }

    return NextResponse.json({
      ok: true,
      invitationId: row.invitation_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      tenantBusinessId: row.tenant_business_id ?? null,
      businessName: row.business_name ?? null,
      email: row.email,
      role: row.role,
      version: row.version,
      expiresAt: row.session_expires_at,
      acceptedAt: row.accepted_at,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load invitation session.' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

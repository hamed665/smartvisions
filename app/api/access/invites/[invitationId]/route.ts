import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const runtime = 'nodejs';

type RevokeBody = { expectedVersion?: number };

export async function DELETE(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    const ctx = await getCurrentOrganization(true);
    const { invitationId } = await context.params;
    const body = await request.json() as RevokeBody;
    const expectedVersion = Number(body.expectedVersion);

    if (!/^[0-9a-f-]{36}$/i.test(invitationId)
        || !Number.isInteger(expectedVersion)
        || expectedVersion < 1) {
      return NextResponse.json({ error: 'Invalid revoke request.' }, { status: 400 });
    }

    const { data, error } = await ctx.supabase.rpc('revoke_organization_member_invitation', {
      p_organization_id: ctx.organizationId,
      p_invitation_id: invitationId,
      p_expected_version: expectedVersion,
      p_request_key: `customer-invite-revoke:${crypto.randomUUID()}`,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.invitation_id) {
      return NextResponse.json({ error: 'Unable to revoke invitation safely.' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      invitationId: row.invitation_id,
      organizationId: row.organization_id,
      version: row.version,
      revokedAt: row.revoked_at,
      replayed: row.replayed,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to revoke invitation.' }, {
      status: 500,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}

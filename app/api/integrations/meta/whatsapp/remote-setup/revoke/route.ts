import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

type RevokeBody = {
  attemptId?: string;
  attemptVersion?: number;
  bindingId?: string;
};

function clean(value: unknown, max = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as RevokeBody;
    const attemptId = clean(body.attemptId);
    const bindingId = clean(body.bindingId);
    const attemptVersion = Number(body.attemptVersion);

    if (!attemptId || !bindingId || !Number.isInteger(attemptVersion) || attemptVersion < 1) {
      return NextResponse.json({ error: 'Invalid setup revoke request' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data, error } = await service.rpc('revoke_meta_whatsapp_remote_setup_invite', {
      p_organization_id: ctx.organizationId,
      p_attempt_id: attemptId,
      p_binding_id: bindingId,
      p_expected_attempt_version: attemptVersion,
      p_actor_user_id: ctx.userId,
      p_request_key: `meta-whatsapp-remote-revoke:${attemptId}:${crypto.randomUUID()}`,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.id) {
      return NextResponse.json({ error: 'Unable to revoke this setup link' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      attemptId: row.id,
      attemptVersion: row.version,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to revoke WhatsApp remote setup' }, { status: 500 });
  }
}

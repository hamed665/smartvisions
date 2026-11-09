import { NextResponse } from 'next/server';
import { isStudioRequestOrigin, studioOwnerThread } from '@/lib/access/customer-studio';
import { getCurrentOrganization } from '@/lib/supabase/org';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as { action?: string; businessId?: unknown };
    if (body.businessId !== undefined && !isStudioRequestOrigin(request)) {
      return NextResponse.json({ error: 'Invalid workspace request origin' }, { status: 403 });
    }
    const action = String(body.action ?? '').toUpperCase();

    if (action !== 'TAKEOVER' && action !== 'RESUME') {
      return NextResponse.json({ error: 'action must be TAKEOVER or RESUME' }, { status: 400 });
    }

    const owner = body.businessId === undefined ? await getCurrentOrganization(true) : await studioOwnerThread(body.businessId, id);
    if (!owner || (body.businessId !== undefined && action !== 'TAKEOVER')) {
      return NextResponse.json({ error: 'Conversation control is unavailable in this workspace' }, { status: 403 });
    }
    const { supabase, organizationId } = owner;
    const rpc = action === 'TAKEOVER' ? 'claim_human_takeover' : 'release_human_takeover';
    const { data, error } = await supabase.rpc(rpc, {
      p_organization_id: organizationId,
      p_conversation_id: id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ ok: true, action, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conversation control failed';
    const status = /Authentication|Owner permission|membership/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, organizationId } = await getCurrentOrganization(true);
    const body = await request.json() as { action?: string };
    const action = String(body.action ?? '').toUpperCase();

    if (action !== 'TAKEOVER' && action !== 'RESUME') {
      return NextResponse.json({ error: 'action must be TAKEOVER or RESUME' }, { status: 400 });
    }

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

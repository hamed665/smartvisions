import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { isCanonicalUuid } from '@/lib/conversations/unified-inbox-query';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isCanonicalUuid(id)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
    }

    const { supabase, organizationId } = await getCurrentOrganization();
    const { data, error } = await supabase.rpc('mark_unified_inbox_conversation_read', {
      p_organization_id: organizationId,
      p_conversation_id: id,
    });

    if (error) {
      const denied = /not permitted|membership|not found/i.test(error.message);
      return NextResponse.json(
        { error: denied ? 'Conversation not found' : 'Unable to mark conversation read' },
        { status: denied ? 404 : 500 },
      );
    }

    return NextResponse.json(
      { read: true, state: data },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to mark conversation read';
    const status = /Authentication|membership/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, organizationId, role } = await getCurrentOrganization();

    const { data: conversation, error: conversationError } = await supabase
      .from('sales_conversations')
      .select('id,lead_id,channel,stage,priority,unread_count,awaiting_party,requires_human,last_inbound_at,last_outbound_at,last_message_at,detected_language,detected_dialect,persian_summary,intent_label,sentiment_label,stage_reason,agent_mode,updated_at')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 500 });
    }
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const [{ data: messages, error: messagesError }, leadResult] = await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id,direction,media_type,original_text,transcript,detected_language,detected_dialect,persian_translation,intent_label,sentiment_label,confidence,status,requires_approval,approval_reason,provider_message_id,created_at,sent_at')
        .eq('organization_id', organizationId)
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
        .limit(250),
      conversation.lead_id
        ? supabase
          .from('leads')
          .select('id,status,agent_mode,recommended_offer')
          .eq('organization_id', organizationId)
          .eq('id', conversation.lead_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }
    if (leadResult.error) {
      return NextResponse.json({ error: leadResult.error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        conversation,
        messages: messages ?? [],
        lead: leadResult.data ?? null,
        editable: role === 'OWNER',
        serverTime: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load conversation';
    const status = /Authentication|membership/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

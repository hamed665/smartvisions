import { notFound } from 'next/navigation';
import { updateConversation } from '@/app/management-actions';
import {
  LiveConversationConsole,
  type InboxConversationItem,
  type LiveConversationSnapshot,
} from './live-conversation';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const stages = ['NEW','ACTIVE','CLOSING','WAITING_CUSTOMER','UNANSWERED','HOT','NEEDS_HUMAN','FOLLOW_UP_DUE','WON','LOST','DO_NOT_CONTACT','SPAM','PAUSED'];

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, organizationId, role } = await getCurrentOrganization();

  const [conversationResult, messagesResult, briefsResult, runsResult, inboxResult] = await Promise.all([
    supabase
      .from('sales_conversations')
      .select('id,lead_id,channel,stage,priority,unread_count,awaiting_party,requires_human,last_inbound_at,last_outbound_at,last_message_at,detected_language,detected_dialect,persian_summary,intent_label,sentiment_label,stage_reason,agent_mode,updated_at')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('conversation_messages')
      .select('id,direction,media_type,original_text,transcript,detected_language,detected_dialect,persian_translation,intent_label,sentiment_label,confidence,status,requires_approval,approval_reason,provider_message_id,metadata,created_at,sent_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('operator_briefs')
      .select('id,title,summary,created_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('agent_runs')
      .select('id,status,routed_agents,trace,started_at,completed_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', id)
      .order('started_at', { ascending: false })
      .limit(10),
    supabase
      .from('sales_conversations')
      .select('id,channel,stage,unread_count,requires_human,agent_mode,persian_summary,last_message_at')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(40),
  ]);

  const conversation = conversationResult.data;
  if (conversationResult.error) throw conversationResult.error;
  if (!conversation) notFound();
  if (messagesResult.error) throw messagesResult.error;
  if (inboxResult.error) throw inboxResult.error;

  const leadResult = conversation.lead_id
    ? await supabase
      .from('leads')
      .select('id,status,agent_mode,recommended_offer')
      .eq('organization_id', organizationId)
      .eq('id', conversation.lead_id)
      .maybeSingle()
    : { data: null, error: null };
  if (leadResult.error) throw leadResult.error;

  const initialSnapshot: LiveConversationSnapshot = {
    conversation,
    messages: [...(messagesResult.data ?? [])].reverse(),
    lead: leadResult.data ?? null,
    editable: role === 'OWNER',
    serverTime: new Date().toISOString(),
  };
  const inbox = (inboxResult.data ?? []) as InboxConversationItem[];
  const editable = role === 'OWNER';

  return (
    <div className="conversationDetailRoot">
      <LiveConversationConsole initialSnapshot={initialSnapshot} inbox={inbox} />

      <details className="conversationAdvanced panel">
        <summary>Advanced conversation controls & diagnostics</summary>
        <div className="twoCol conversationAdvancedGrid">
          <section>
            <h2>Stage & priority</h2>
            <form action={updateConversation} className="settingsGrid">
              <input type="hidden" name="id" value={conversation.id} />
              <input type="hidden" name="requires_human" value={conversation.requires_human ? 'on' : ''} />
              <label>
                Stage
                <select name="stage" defaultValue={conversation.stage} disabled={!editable}>
                  {stages.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </label>
              <label>
                Priority
                <input type="number" name="priority" min="0" max="100" defaultValue={conversation.priority} disabled={!editable} />
              </label>
              <button disabled={!editable}>Save</button>
            </form>
            <p className="muted">Use the Take Over / Resume AI controls in the live chat for agent ownership. This form intentionally does not mutate takeover state.</p>
          </section>
          <section>
            <h2>Recent operator briefs</h2>
            {(briefsResult.data ?? []).length === 0 ? <p className="muted">No briefs yet.</p> : null}
            {(briefsResult.data ?? []).map((brief) => (
              <div key={brief.id} className="briefItem">
                <strong>{brief.title}</strong>
                <div className="persianBrief" dir="rtl">{brief.summary}</div>
              </div>
            ))}
          </section>
        </div>
        <section>
          <h2>Agent traces</h2>
          {(runsResult.data ?? []).length === 0 ? <p className="muted">No agent runs yet.</p> : null}
          {(runsResult.data ?? []).map((run) => (
            <details key={run.id}>
              <summary>{run.status} · {new Date(run.started_at).toLocaleString()}</summary>
              <pre className="auditJson">{JSON.stringify({ agents: run.routed_agents, trace: run.trace }, null, 2)}</pre>
            </details>
          ))}
        </section>
      </details>
    </div>
  );
}

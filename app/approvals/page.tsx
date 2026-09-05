import { approveMessage, rejectMessage } from '@/app/management-actions';
import { processLatestWhatsAppInboundPilot, sendApprovedWhatsAppCatalogPilot } from '@/app/whatsapp-pilot-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function recordValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export default async function ApprovalsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const [
    { data: messages },
    { data: briefs },
    { data: rules },
    { data: controls },
    { data: latestInbound },
    { data: pilotCandidates },
  ] = await Promise.all([
    supabase.from('conversation_messages')
      .select('id,conversation_id,channel,original_text,transcript,persian_translation,persian_summary,approval_reason,status,created_at,metadata')
      .eq('organization_id', organizationId)
      .eq('requires_approval', true)
      .in('status', ['APPROVAL_REQUIRED', 'READY'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('operator_briefs')
      .select('id,title,summary,details,created_at')
      .eq('organization_id', organizationId)
      .eq('requires_action', true)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('approval_rules')
      .select('action_key,requires_approval')
      .eq('organization_id', organizationId),
    supabase.from('system_controls')
      .select('shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('outreach_messages')
      .select('id,body,received_at')
      .eq('organization_id', organizationId)
      .eq('channel', 'WHATSAPP')
      .eq('direction', 'INBOUND')
      .not('lead_id', 'is', null)
      .not('received_at', 'is', null)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('conversation_messages')
      .select('id,channel,original_text,status,requires_approval,approval_reason,provider_message_id,sent_at,created_at,metadata')
      .eq('organization_id', organizationId)
      .eq('channel', 'WHATSAPP')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const queue = messages ?? [];
  const operator = briefs ?? [];
  const editable = role === 'OWNER';
  const latestPilotIdempotencyKey = latestInbound
    ? `agent:whatsapp-pilot:${latestInbound.id}:shadow`
    : null;
  const pilotMessage = (pilotCandidates ?? []).find((candidate) => {
    const metadata = recordValue(candidate.metadata);
    return latestPilotIdempotencyKey && metadata.idempotency_key === latestPilotIdempotencyKey;
  });
  const pilotMetadata = recordValue(pilotMessage?.metadata);
  const pilotSendContext = recordValue(pilotMetadata.send_context);
  const pilotCatalogContentId = typeof pilotSendContext.catalog_content_id === 'string'
    ? pilotSendContext.catalog_content_id
    : null;
  const pilotMode = pilotCatalogContentId ? 'CATALOG' : 'TEXT';

  const controlsClear = Boolean(
    controls?.shadow_mode
    && !controls?.global_kill_switch
    && !controls?.agents_paused
    && !controls?.whatsapp_ai_paused,
  );
  const pilotReady = Boolean(editable && latestInbound && controlsClear && !pilotMessage);
  const pilotSendReady = Boolean(
    editable
    && controlsClear
    && pilotMessage?.status === 'APPROVED'
    && !pilotMessage.requires_approval,
  );

  return <div>
    <div className="headerRow">
      <div>
        <h1>Approvals</h1>
        <p className="muted">Only exceptional or high-risk decisions should land here. Routine replies stay autonomous.</p>
      </div>
      <span className="status">{queue.length + operator.length} waiting</span>
    </div>

    {editable ? <section className="panel">
      <div className="conversationTopline">
        <strong>Controlled WhatsApp Agent Pilot</strong>
        <span className="humanBadge">SHADOW MODE</span>
      </div>
      <p className="muted">Processes only the latest real linked WhatsApp inbound for the INTERNAL_TEST business through the existing idempotent Agent → Shadow Approval path. It never sends to Meta until the owner separately approves and explicitly sends the controlled pilot artifact.</p>
      {latestInbound
        ? <p><strong>Latest inbound:</strong> {latestInbound.body || 'Media message'}</p>
        : <p className="muted">No linked inbound is currently available.</p>}
      <form action={processLatestWhatsAppInboundPilot}>
        <button className="approveButton" disabled={!pilotReady}>Process latest inbound into Approval</button>
      </form>
      {pilotMessage ? <p className="muted">This inbound already has a durable pilot artifact. Re-processing is disabled.</p> : null}
      {!controls?.shadow_mode ? <p className="muted">Blocked because Shadow Mode is OFF.</p> : null}
    </section> : null}

    {editable && pilotMessage && pilotMessage.status !== 'APPROVAL_REQUIRED' ? <section className="panel">
      <div className="conversationTopline">
        <strong>Controlled WhatsApp {pilotMode === 'CATALOG' ? 'Catalog' : 'Text'} Send</strong>
        <span className="humanBadge">{pilotMessage.status}</span>
      </div>
      <p>{pilotMessage.original_text || 'Approved WhatsApp pilot reply'}</p>
      {pilotCatalogContentId ? <p className="muted"><strong>Catalog:</strong> {pilotCatalogContentId}</p> : null}
      <p className="muted">Shadow Mode stays ON globally. Only this owner-approved INTERNAL_TEST artifact with exact recipient linkage can use the controlled pilot exception. DNC, human takeover, kill switch, channel pause, Cost Guard, market window and WhatsApp 24-hour checks still run immediately before provider send.</p>
      {pilotMessage.status === 'APPROVED' ? <form action={sendApprovedWhatsAppCatalogPilot}>
        <input type="hidden" name="id" value={pilotMessage.id} />
        <button className="approveButton" disabled={!pilotSendReady}>Send approved {pilotMode === 'CATALOG' ? 'catalog' : 'text'} pilot</button>
      </form> : null}
      {pilotMessage.status === 'PROCESSING' ? <p className="muted">Provider send is already claimed. Do not retry.</p> : null}
      {pilotMessage.status === 'SENT' ? <p className="muted">Provider accepted the controlled pilot message. Delivery/read evidence can now be verified from the webhook ledger.</p> : null}
      {pilotMessage.status === 'FAILED' ? <p className="muted">The send failed before provider acceptance. Review the recorded failure before any manual retry: {pilotMessage.approval_reason || 'No detail recorded.'}</p> : null}
    </section> : null}

    <section className="grid">
      <div className="card"><span className="muted">Message approvals</span><div className="value">{queue.length}</div></div>
      <div className="card"><span className="muted">Operator actions</span><div className="value">{operator.length}</div></div>
      <div className="card"><span className="muted">Approval rules enabled</span><div className="value">{(rules ?? []).filter((rule) => rule.requires_approval).length}</div></div>
    </section>

    <div className="conversationList">
      {queue.map((message) => {
        const sendContext = recordValue(recordValue(message.metadata).send_context);
        const catalogContentId = sendContext.catalog_content_id;
        return <section className="conversationCard" key={message.id}>
          <div className="conversationTopline"><strong>{message.channel}</strong><span className="humanBadge">APPROVAL</span></div>
          <p>{message.transcript || message.original_text || 'Media message'}</p>
          {catalogContentId ? <p className="muted"><strong>Catalog:</strong> {String(catalogContentId)}</p> : null}
          {message.persian_translation ? <div className="persianBrief">{message.persian_translation}</div> : null}
          {message.persian_summary ? <p className="muted" dir="rtl">{message.persian_summary}</p> : null}
          <div className="conversationMeta">
            <span>{message.approval_reason || 'Policy review'}</span>
            <span>{new Date(message.created_at).toLocaleString()}</span>
          </div>
          {editable ? <div className="approvalActions">
            <form action={approveMessage}><input type="hidden" name="id" value={message.id} /><button className="approveButton">Approve</button></form>
            <form action={rejectMessage}><input type="hidden" name="id" value={message.id} /><input name="reason" placeholder="Reason (optional)" /><button className="rejectButton">Reject</button></form>
          </div> : null}
        </section>;
      })}
      {operator.map((brief) => <section className="conversationCard" key={brief.id}><strong>{brief.title}</strong><div className="persianBrief">{brief.summary}</div></section>)}
      {queue.length + operator.length === 0 ? <section className="panel"><h2>Queue clear</h2><p className="muted">No decisions currently need owner attention.</p></section> : null}
    </div>
  </div>;
}

import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function muscatDayRange() {
  const muscatNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const dateKey = muscatNow.toISOString().slice(0, 10);
  return {
    dateKey,
    startIso: new Date(`${dateKey}T00:00:00+04:00`).toISOString(),
    endIso: new Date(`${dateKey}T23:59:59.999+04:00`).toISOString(),
  };
}

const clip = (value: unknown, max = 90) => String(value ?? '').trim().slice(0, max);

export default async function CommandCenterPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const day = muscatDayRange();

  const [campaignsResult, mailboxesResult, sentResult, inboundResult, eventsResult, commandsResult, notificationsResult] = await Promise.all([
    supabase.from('campaigns').select('id,name,country_code,city,industry,target_count,status,config,updated_at').eq('organization_id', organizationId).eq('status', 'RUNNING').order('updated_at', { ascending: false }),
    supabase.from('mailboxes').select('id,address,enabled,daily_limit,warmup_status,health_status').eq('organization_id', organizationId).eq('enabled', true).order('address'),
    supabase.from('conversation_messages').select('id,lead_id,provider_message_id,sent_at,status').eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND').eq('status', 'SENT').gte('sent_at', day.startIso).lte('sent_at', day.endIso),
    supabase.from('outreach_messages').select('id,lead_id,received_at').eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'INBOUND').gte('received_at', day.startIso).lte('received_at', day.endIso),
    supabase.from('email_events').select('provider_message_id,event_type,created_at').eq('organization_id', organizationId).gte('created_at', day.startIso).lte('created_at', day.endIso),
    supabase.from('telegram_command_runs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(12),
    supabase.from('telegram_notification_events').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(12),
  ]);

  const firstError = [campaignsResult.error, mailboxesResult.error, sentResult.error, inboundResult.error, eventsResult.error, commandsResult.error, notificationsResult.error].find(Boolean);
  if (firstError) throw firstError;

  const campaigns = campaignsResult.data ?? [];
  const mailboxes = mailboxesResult.data ?? [];
  const sent = sentResult.data ?? [];
  const inbound = inboundResult.data ?? [];
  const events = eventsResult.data ?? [];
  const providerIds = new Set(sent.map((row) => String(row.provider_message_id ?? '')).filter(Boolean));
  const delivered = new Set(events.filter((row) => providerIds.has(String(row.provider_message_id ?? '')) && String(row.event_type).toLowerCase() === 'email.delivered').map((row) => String(row.provider_message_id))).size;
  const bounced = new Set(events.filter((row) => providerIds.has(String(row.provider_message_id ?? '')) && /bounce/i.test(String(row.event_type))).map((row) => String(row.provider_message_id))).size;
  const target = campaigns.reduce((sum, row) => sum + Number(row.target_count ?? 0), 0);
  const healthyCapacity = mailboxes
    .filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase()))
    .reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const commands = (commandsResult.data ?? []) as Array<Record<string, unknown>>;
  const notifications = (notificationsResult.data ?? []) as Array<Record<string, unknown>>;

  const metrics: Array<[string, string | number]> = [
    ['Email sent today', sent.length],
    ['Delivered', delivered],
    ['Bounce', bounced],
    ['Replies today', inbound.length],
    ['Active target', target],
    ['Healthy mailbox capacity', `${healthyCapacity}/day`],
    ['Running campaigns', campaigns.length],
    ['Telegram commands', commands.length],
  ];

  return <div>
    <div className="headerRow">
      <div>
        <h1>Command Center</h1>
        <p className="muted">Telegram owner control + live provider-backed outreach reporting. Mutating commands require confirmation and remain subject to canonical Safety, DNC, quota and mailbox gates.</p>
      </div>
      <span className="status">{day.dateKey} · Muscat</span>
    </div>

    <div className="grid">{metrics.map(([label,value]) => <div className="card" key={label}><div className="muted">{label}</div><div className="value">{value}</div></div>)}</div>

    <section className="panel">
      <div className="headerRow"><div><h2>Telegram commands</h2><p className="muted">Natural Persian or explicit slash commands. Reads execute immediately; writes show Preview and require Owner confirmation.</p></div><span className="pill">Daily digest after 19:00 Muscat</span></div>
      <div className="healthList">
        <span><strong>گزارش:</strong> چند تا ایمیل دادی؟</span>
        <span><strong>بازار:</strong> گزارش ایمیل عمان</span>
        <span><strong>شروع:</strong> امروز 10 تا ایمیل عمان برای dental شروع کن</span>
        <span><strong>Slash:</strong> /email OM 10 dental</span>
      </div>
      <p className="muted">اگر market هنوز end-to-end Production-verified نباشد یا target از ظرفیت Mailbox بیشتر باشد، فرمان Fail Closed می‌شود. یک RUNNING سبزِ بی‌خاصیت تولید نمی‌کنیم، چون بشر به اندازه کافی داشبورد سبز بی‌خاصیت ساخته است.</p>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Active campaigns</h2><p className="muted">Current RUNNING campaigns and their explicit daily targets.</p></div></div>
      {campaigns.length ? <div className="tableWrap"><table className="dataTable"><thead><tr><th>Market</th><th>Industry</th><th>City</th><th>Target</th><th>Status</th></tr></thead><tbody>{campaigns.map((row) => <tr key={row.id}><td>{row.country_code}</td><td>{row.industry ?? 'All eligible'}</td><td>{row.city ?? '—'}</td><td>{row.target_count}</td><td>{row.status}</td></tr>)}</tbody></table></div> : <p className="muted">No RUNNING campaign.</p>}
    </section>

    <section className="twoCol">
      <div className="panel">
        <h2>Mailboxes</h2>
        <div className="tableWrap"><table className="dataTable"><thead><tr><th>Mailbox</th><th>Health</th><th>Warmup</th><th>Daily limit</th></tr></thead><tbody>{mailboxes.map((row) => <tr key={row.id}><td>{row.address}</td><td>{row.health_status}</td><td>{row.warmup_status}</td><td>{row.daily_limit}</td></tr>)}</tbody></table></div>
      </div>
      <div className="panel">
        <h2>Recent Telegram command journal</h2>
        {commands.length ? <div className="healthList">{commands.map((row) => <span key={String(row.id)}><strong>{clip(row.command_type, 40)}</strong> · {clip(row.status, 30)}<br/><small>{clip(row.raw_text, 120)}</small></span>)}</div> : <p className="muted">No Telegram commands recorded yet.</p>}
      </div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Telegram delivery journal</h2><p className="muted">Recent alerts and daily digests. Duplicate event keys are suppressed by the database journal.</p></div></div>
      {notifications.length ? <div className="tableWrap"><table className="dataTable"><thead><tr><th>Type</th><th>Status</th><th>Event</th><th>Sent</th></tr></thead><tbody>{notifications.map((row) => <tr key={String(row.id)}><td>{clip(row.notification_type ?? row.kind, 40)}</td><td>{clip(row.status, 30)}</td><td>{clip(row.event_key, 100)}</td><td>{clip(row.sent_at ?? row.created_at, 32)}</td></tr>)}</tbody></table></div> : <p className="muted">No Telegram notification journal entries.</p>}
    </section>
  </div>;
}

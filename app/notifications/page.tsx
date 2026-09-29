import { acknowledgeNotification, markNotificationRead, saveNotificationPreferences } from '@/app/notification-actions';
import { getAutomationNotificationReadiness } from '@/lib/notifications/runtime';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

type Preference = {
  in_app_enabled: boolean;
  telegram_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  minimum_severity: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
  escalation_enabled: boolean;
};

const defaults = (role: string): Preference => ({
  in_app_enabled: true,
  telegram_enabled: role === 'OWNER',
  email_enabled: false,
  push_enabled: false,
  sms_enabled: false,
  minimum_severity: 'MEDIUM',
  escalation_enabled: true,
});

export default async function NotificationsPage() {
  const { supabase, organizationId, userId, role } = await getCurrentOrganization();
  const service = createSupabaseServiceClient();

  const [
    { data: notifications, error: notificationError },
    { data: preferenceRow },
    { data: deliveries },
    readiness,
  ] = await Promise.all([
    supabase.from('notification_inbox')
      .select('id,event_key,notification_type,severity,title,body,entity_type,entity_id,escalation_level,escalated_at,read_at,acknowledged_at,created_at,payload')
      .eq('organization_id', organizationId)
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('notification_preferences')
      .select('in_app_enabled,telegram_enabled,email_enabled,push_enabled,sms_enabled,minimum_severity,escalation_enabled')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('notification_delivery_receipts')
      .select('notification_id,channel,escalation_level,status,provider_message_id,reason,sent_at,created_at')
      .eq('organization_id', organizationId)
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    getAutomationNotificationReadiness({
      supabase: service,
      organizationId,
      userId,
      role,
    }),
  ]);

  const preference = { ...defaults(role), ...(preferenceRow ?? {}) } as Preference;
  const rows = notifications ?? [];
  const receipts = deliveries ?? [];
  const unread = rows.filter((row) => !row.read_at).length;
  const unacknowledged = rows.filter((row) => !row.acknowledged_at).length;

  return <div>
    <div className="headerRow">
      <div>
        <h1>Notifications</h1>
        <p className="muted">Operational alerts projected from governed approval and Automation runtime evidence.</p>
      </div>
      <span className="status">{unread} unread · {unacknowledged} unacknowledged</span>
    </div>

    <section className="panel" style={{ marginBottom: 18 }}>
      <h2>Delivery readiness</h2>
      <div className="healthList">
        <span>In-app <strong>READY</strong></span>
        <span>Telegram owner <strong>{readiness.telegram.ready ? 'READY' : 'NOT CONFIGURED'}</strong></span>
        <span>Email <strong>{readiness.email.ready ? 'READY' : 'BLOCKED'}</strong></span>
        <span>Push <strong>DEPENDENCY PENDING</strong></span>
        <span>SMS <strong>DEPENDENCY PENDING</strong></span>
      </div>
      {!readiness.email.ready ? <p className="muted">Email blocker: {readiness.email.reason}</p> : null}
      <p className="muted">
        Push requires a canonical device-registration/provider boundary. SMS requires a Production-verified OMNI-SMS-RCS provider route.
        Neither channel is treated as active merely because someone put a checkbox on a page.
      </p>
    </section>

    <section className="panel" style={{ marginBottom: 18 }}>
      <h2>My notification preferences</h2>
      <form action={saveNotificationPreferences} className="settingsGrid">
        <label className="toggleLabel">
          <input type="checkbox" name="in_app_enabled" defaultChecked={preference.in_app_enabled} /> In-app
        </label>
        <label className="toggleLabel">
          <input type="checkbox" name="telegram_enabled" defaultChecked={preference.telegram_enabled} disabled={role !== 'OWNER'} /> Telegram owner
        </label>
        <label className="toggleLabel">
          <input type="checkbox" name="email_enabled" defaultChecked={preference.email_enabled} disabled={role !== 'OWNER'} /> Email
        </label>
        <label className="toggleLabel">
          <input type="checkbox" name="push_enabled" defaultChecked={preference.push_enabled} disabled /> Push
        </label>
        <label className="toggleLabel">
          <input type="checkbox" name="sms_enabled" defaultChecked={preference.sms_enabled} disabled /> SMS
        </label>
        <label>
          Minimum severity
          <select name="minimum_severity" defaultValue={preference.minimum_severity}>
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>CRITICAL</option>
          </select>
        </label>
        <label className="toggleLabel">
          <input type="checkbox" name="escalation_enabled" defaultChecked={preference.escalation_enabled} /> Escalate unacknowledged high-priority alerts
        </label>
        <button type="submit">Save preferences</button>
      </form>
    </section>

    {notificationError ? <section className="panel">
      <p className="muted">Notification projection is not available on this database revision yet.</p>
    </section> : null}

    <div className="conversationList">
      {rows.length === 0 ? <section className="panel">
        <h2>No current notifications</h2>
        <p className="muted">Only new governed events after AUTO-NOTIFICATIONS activation are projected. Historical alerts are not replayed.</p>
      </section> : rows.map((notification) => {
        const related = receipts.filter((receipt) => receipt.notification_id === notification.id);
        return <section className="conversationCard" key={notification.id}>
          <div className="headerRow">
            <div>
              <h2>{notification.title}</h2>
              <p className="muted">{notification.notification_type} · {notification.severity} · {new Date(notification.created_at).toLocaleString()}</p>
            </div>
            <span className="status">{notification.acknowledged_at ? 'ACKNOWLEDGED' : notification.read_at ? 'READ' : 'NEW'}</span>
          </div>
          <p>{notification.body}</p>
          <div className="conversationMeta">
            {notification.entity_type && notification.entity_id ? <span>{notification.entity_type}: {notification.entity_id}</span> : null}
            <span>Escalation level {notification.escalation_level}</span>
            {notification.escalated_at ? <span>Escalated {new Date(notification.escalated_at).toLocaleString()}</span> : null}
          </div>
          {related.length ? <div className="conversationMeta">
            {related.map((receipt) => <span key={`${receipt.channel}:${receipt.escalation_level}`}>
              {receipt.channel}: {receipt.status}
            </span>)}
          </div> : null}
          {!notification.acknowledged_at ? <div className="approvalActions">
            {!notification.read_at ? <form action={markNotificationRead}>
              <input type="hidden" name="id" value={notification.id} />
              <button type="submit">Mark read</button>
            </form> : null}
            <form action={acknowledgeNotification}>
              <input type="hidden" name="id" value={notification.id} />
              <button type="submit">Acknowledge</button>
            </form>
          </div> : null}
        </section>;
      })}
    </div>
  </div>;
}

import { updateOutreachPolicy } from '@/app/management-actions';
import { updateMailbox } from '@/app/extended-actions';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { getCurrentOrganization } from '@/lib/supabase/org';
export const dynamic='force-dynamic';

export default async function OutreachPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const [{data:policies},{data:mailboxes},{data:controls}]=await Promise.all([
    supabase.from('outreach_policies').select('*').eq('organization_id',organizationId).order('country_code'),
    supabase.from('mailboxes').select('id,provider,address,sending_domain,enabled,daily_limit,sent_today,warmup_status,health_status,bounce_rate,complaint_rate,reply_rate').eq('organization_id',organizationId).order('address'),
    supabase.from('system_controls').select('email_paused,global_kill_switch,shadow_mode').eq('organization_id',organizationId).maybeSingle()
  ]);
  const rows=policies??[],boxes=mailboxes??[];const editable=role==='OWNER';
  const rollingUsageEntries=await Promise.all(boxes.map(async (mailbox)=>{
    try {
      const sent=await countMailboxSendsLast24Hours({supabase,organizationId,mailboxId:String(mailbox.id)});
      return [String(mailbox.id),sent] as const;
    } catch {
      return [String(mailbox.id),null] as const;
    }
  }));
  const rollingUsageById=new Map(rollingUsageEntries);
  const rollingUsageKnown=rollingUsageEntries.every(([,sent])=>sent!==null);
  const rollingSent=rollingUsageKnown?rollingUsageEntries.reduce((sum,[,sent])=>sum+Number(sent??0),0):null;
  return <div>
    <div className="headerRow"><div><h1>Outreach Control</h1><p className="muted">Country-local send windows, business days, volume limits, follow-ups and mailbox health.</p></div><span className={`status ${controls?.email_paused||controls?.global_kill_switch?'dangerStatus':''}`}>{controls?.global_kill_switch?'Globally stopped':controls?.email_paused?'Email paused':controls?.shadow_mode?'Shadow mode':'Live'}</span></div>
    <section className="grid"><div className="card"><span className="muted">Markets enabled</span><div className="value">{rows.filter(r=>r.enabled).length}</div></div><div className="card"><span className="muted">Manual review</span><div className="value">{rows.filter(r=>r.enabled&&r.manual_review_required).length}/{rows.filter(r=>r.enabled).length}</div></div><div className="card"><span className="muted">Sent · rolling 24h</span><div className="value">{rollingSent??'—'}</div></div><div className="card"><span className="muted">Daily capacity</span><div className="value">{boxes.reduce((n,b)=>n+(b.daily_limit??0),0)}</div></div></section>
    {!rollingUsageKnown?<section className="panel dangerPanel"><strong>Mailbox usage unavailable</strong><p className="muted">Rolling 24-hour send evidence could not be reconciled for every mailbox. The send gate remains fail-closed; this page will not substitute legacy sent_today as quota authority.</p></section>:null}
    <h2 className="sectionTitle">Market policies</h2>
    <div className="settingsList">{rows.map(r=><form action={updateOutreachPolicy} className="settingsRow outreachRow" key={r.id}>
      <input type="hidden" name="id" value={r.id}/><div><strong>{r.country_code}</strong><span className="muted smallText">Local outreach policy</span></div>
      <label>From<input type="time" name="send_window_start" defaultValue={String(r.send_window_start).slice(0,5)} disabled={!editable}/></label>
      <label>Until<input type="time" name="send_window_end" defaultValue={String(r.send_window_end).slice(0,5)} disabled={!editable}/></label>
      <label>Business days<input name="business_days" defaultValue={(r.business_days??[]).join(',')} placeholder="0,1,2,3,4" disabled={!editable}/></label>
      <label>Daily max<input type="number" min="0" name="max_emails_per_day" defaultValue={r.max_emails_per_day} disabled={!editable}/></label>
      <label>Per mailbox<input type="number" min="0" name="max_emails_per_mailbox" defaultValue={r.max_emails_per_mailbox} disabled={!editable}/></label>
      <label>Follow-ups<input type="number" min="0" max="10" name="max_followups" defaultValue={r.max_followups} disabled={!editable}/></label>
      <label>Follow-up delays<input name="followup_delays_days" defaultValue={(r.followup_delays_days??[]).join(',')} placeholder="3,7" disabled={!editable}/></label>
      <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={r.enabled} disabled={!editable}/> Enabled</label>
      <label className="toggleLabel"><input type="checkbox" name="manual_review_required" defaultChecked={r.manual_review_required} disabled={!editable}/> Manual review</label><button disabled={!editable}>Save</button>
    </form>)}</div>
    <section className="panel"><p className="muted">Business days use 0=Sunday through 6=Saturday. Follow-up delays are comma-separated days from the original touch and must cover every configured follow-up.</p></section>
    <h2 className="sectionTitle">Mailboxes</h2><div className="settingsList">{boxes.map(b=><form action={updateMailbox} className="settingsRow" key={b.id}><input type="hidden" name="id" value={b.id}/><div><strong>{b.address}</strong><span className="muted smallText">{b.provider} · {b.sending_domain}</span><span className="muted smallText">Health {b.health_status} · Warmup {b.warmup_status}</span></div><label>Daily limit<input type="number" min="0" name="daily_limit" defaultValue={b.daily_limit} disabled={!editable}/></label><div className="healthList compactHealth"><span>Sent 24h <strong>{rollingUsageById.get(String(b.id))??'—'}</strong></span><span>Bounce <strong>{b.bounce_rate??0}%</strong></span><span>Complaint <strong>{b.complaint_rate??0}%</strong></span><span>Reply <strong>{b.reply_rate??0}%</strong></span></div><label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={b.enabled} disabled={!editable}/> Enabled</label><button disabled={!editable}>Save</button></form>)}</div>
  </div>
}

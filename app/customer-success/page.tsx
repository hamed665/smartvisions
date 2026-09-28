import { randomUUID } from 'node:crypto';
import Link from 'next/link';

import {
  getCustomerSuccessSummary,
  listCustomerSuccessAccounts,
} from '@/lib/crm/customer-success';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  acceptCustomerSuccessTask,
  classifyCustomerSuccessLifecycleCampaign,
  recordCustomerLoyalty,
  recordCustomerReferralAction,
  rewardCustomerReferral,
  transitionCustomerReferralAction,
} from './customer-success-actions';

export const dynamic='force-dynamic';

type ReferralRow={
  id:string;
  referrer_business_id:string;
  referred_lead_id:string|null;
  referred_business_id:string|null;
  status:string;
  source_ref:string;
  created_at:string;
};
type LoyaltyRow={
  id:string;
  business_id:string;
  event_type:string;
  points_delta:number;
  reward_key:string|null;
  source_type:string;
  occurred_at:string;
};
type CampaignRow={
  id:string;
  name:string;
  status:string;
  approval_status:string;
  customer_success_lifecycle:string|null;
};
type LeadRow={id:string;business_id:string;status:string};
type MemberRow={user_id:string;role:string};

function date(value:string|null|undefined){
  if(!value) return '—';
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB') : '—';
}

export default async function CustomerSuccessPage(){
  const {supabase,organizationId,role,userId}=await getCurrentOrganization();
  const [summary,accounts,referralsResult,loyaltyResult,campaignsResult,leadsResult,membersResult]=await Promise.all([
    getCustomerSuccessSummary({supabase,organizationId}),
    listCustomerSuccessAccounts({supabase,organizationId,limit:200}),
    supabase.from('customer_referrals')
      .select('id,referrer_business_id,referred_lead_id,referred_business_id,status,source_ref,created_at')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100),
    supabase.from('customer_loyalty_events')
      .select('id,business_id,event_type,points_delta,reward_key,source_type,occurred_at')
      .eq('organization_id',organizationId).order('occurred_at',{ascending:false}).limit(100),
    supabase.from('campaigns')
      .select('id,name,status,approval_status,customer_success_lifecycle')
      .eq('organization_id',organizationId).eq('campaign_kind','MARKETING')
      .order('updated_at',{ascending:false}).limit(100),
    supabase.from('leads').select('id,business_id,status')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(200),
    supabase.from('organization_members').select('user_id,role')
      .eq('organization_id',organizationId)
      .in('role',['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']),
  ]);

  for(const [name,result] of [
    ['referrals',referralsResult],['loyalty',loyaltyResult],['campaigns',campaignsResult],
    ['leads',leadsResult],['members',membersResult],
  ] as const){
    if(result.error) throw new Error(`Customer Success ${name} query failed: ${result.error.message}`);
  }

  const referrals=(referralsResult.data ?? []) as ReferralRow[];
  const loyalty=(loyaltyResult.data ?? []) as LoyaltyRow[];
  const campaigns=(campaignsResult.data ?? []) as CampaignRow[];
  const leads=(leadsResult.data ?? []) as LeadRow[];
  const members=(membersResult.data ?? []) as MemberRow[];
  const accountById=new Map(accounts.map(account=>[account.business_id,account]));
  const canManage=['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));
  const canTask=['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Customer Success & Loyalty</h1>
        <p className="muted">
          Explainable health, onboarding, retention and reactivation over canonical CRM truth.
          Loyalty points are promotional evidence, never money, billing credit or collected revenue.
        </p>
      </div>
      <div>
        <Link className="textLink" href="/tasks">Tasks →</Link>{' · '}
        <Link className="textLink" href="/segments">Segments →</Link>{' · '}
        <Link className="textLink" href="/campaigns">Lifecycle campaigns →</Link>
      </div>
    </div>

    <section className="grid">
      <div className="card"><span className="muted">Customers</span><div className="value">{Number(summary?.customer_account_count ?? 0)}</div></div>
      <div className="card"><span className="muted">Former customers</span><div className="value">{Number(summary?.former_customer_count ?? 0)}</div></div>
      <div className="card"><span className="muted">Open CS tasks</span><div className="value">{Number(summary?.open_customer_success_task_count ?? 0)}</div></div>
      <div className="card"><span className="muted">Loyalty balance</span><div className="value">{Number(summary?.loyalty_points_balance ?? 0)}</div></div>
      <div className="card"><span className="muted">Referrals</span><div className="value">{Number(summary?.referral_count ?? 0)}</div></div>
      <div className="card"><span className="muted">Lifecycle campaigns</span><div className="value">{Number(summary?.lifecycle_campaign_count ?? 0)}</div></div>
    </section>

    <section className="panel sectionTitle">
      <div className="headerRow">
        <div>
          <h2>Customer health & lifecycle work</h2>
          <p className="muted">
            Health is deterministic evidence from CRM activity, Support, Tasks and recent sentiment.
            It is not an opaque AI score. A suggestion becomes work only after a human accepts it into canonical CRM Tasks.
          </p>
        </div>
      </div>
      <div className="tableWrap">
        <table className="dataTable">
          <thead><tr>
            <th>Account</th><th>Lifecycle</th><th>Health</th><th>Signals</th>
            <th>Activity</th><th>Loyalty</th><th>Suggested work</th>
          </tr></thead>
          <tbody>
            {accounts.map(account=><tr key={account.business_id}>
              <td>
                <strong>{account.business_name}</strong>
                <div className="muted smallText">{account.business_id.slice(0,8)}</div>
              </td>
              <td>
                {account.account_lifecycle}
                <div className="muted smallText">Onboarding: {account.onboarding_state}</div>
              </td>
              <td>
                <strong>{account.health_status}</strong> · {account.health_score}
                <div className="muted smallText">{account.open_support_case_count} open case(s) · {account.overdue_task_count} overdue task(s)</div>
              </td>
              <td>{account.risk_signals.length ? account.risk_signals.join(' · ') : 'No active risk signal'}</td>
              <td>{date(account.last_activity_at)}</td>
              <td>{account.loyalty_points_balance} pts · {account.referral_count} referral(s)</td>
              <td>
                {account.suggested_action_kind==='NONE' ? <span className="muted">No intervention suggested</span> : <>
                  <strong>{account.suggested_title}</strong>
                  <div className="muted smallText">{account.suggested_priority} · {account.suggested_task_type}</div>
                  {canTask ? <form action={acceptCustomerSuccessTask} className="inlineForm">
                    <input type="hidden" name="business_id" value={account.business_id}/>
                    <input type="hidden" name="action_kind" value={account.suggested_action_kind}/>
                    <input type="hidden" name="request_key" value={`cs-task-${account.business_id}-${account.suggested_action_kind}-${randomUUID()}`}/>
                    <select name="assignee_user_id" defaultValue={userId}>
                      {members.map(member=><option value={member.user_id} key={member.user_id}>
                        {member.user_id===userId ? 'Me' : member.user_id.slice(0,8)} · {member.role}
                      </option>)}
                    </select>
                    <button type="submit">Accept as CRM Task</button>
                  </form> : null}
                </>}
              </td>
            </tr>)}
            {accounts.length===0 ? <tr><td colSpan={7} className="muted">
              No canonical CUSTOMER or FORMER_CUSTOMER Account exists yet. No fake customer was created for this module.
            </td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>

    <section className="twoCol">
      <article className="panel">
        <h2>Loyalty / rewards ledger</h2>
        <p className="muted">
          Append-only non-cash points. Redemption cannot push an Account below zero. This ledger cannot alter invoices, payments, subscriptions or billing credit.
        </p>
        {canManage && accounts.some(a=>a.account_lifecycle==='CUSTOMER') ? <form action={recordCustomerLoyalty} className="settingsGrid">
          <input type="hidden" name="request_key" value={`cs-loyalty-${randomUUID()}`}/>
          <input type="hidden" name="source_type" value="MANUAL"/>
          <input type="hidden" name="source_ref" value="customer-success-operator"/>
          <label>Customer<select name="business_id" required>
            {accounts.filter(a=>a.account_lifecycle==='CUSTOMER').map(a=><option value={a.business_id} key={a.business_id}>{a.business_name}</option>)}
          </select></label>
          <label>Event<select name="event_type" defaultValue="EARN">
            <option>EARN</option><option>REDEEM</option><option>ADJUST</option><option>EXPIRE</option>
          </select></label>
          <label>Points<input type="number" name="points_delta" required placeholder="100 or -50"/></label>
          <label>Reward key<input name="reward_key" maxLength={120} placeholder="WELCOME_100"/></label>
          <button type="submit">Record points evidence</button>
        </form> : <p className="muted">A canonical CUSTOMER Account is required before loyalty events can be recorded.</p>}
        <div className="settingsList">
          {loyalty.slice(0,12).map(event=><div className="settingsRow" key={event.id}>
            <div><strong>{accountById.get(event.business_id)?.business_name ?? event.business_id.slice(0,8)}</strong>
              <span className="muted smallText">{date(event.occurred_at)}</span>
            </div>
            <div>{event.event_type}</div><div>{event.points_delta} pts</div><div>{event.reward_key ?? '—'}</div><div>{event.source_type}</div>
          </div>)}
        </div>
      </article>

      <article className="panel">
        <h2>Referrals</h2>
        <p className="muted">
          Referral conversion is not operator opinion: CONVERT requires a canonical WON Deal after the referral.
          REWARD then requires a positive loyalty event linked to that referral.
        </p>
        {canManage && accounts.some(a=>a.account_lifecycle==='CUSTOMER') && leads.length ? <form action={recordCustomerReferralAction} className="settingsGrid">
          <input type="hidden" name="request_key" value={`cs-referral-${randomUUID()}`}/>
          <input type="hidden" name="source_ref" value="customer-success-operator"/>
          <label>Referrer<select name="referrer_business_id" required>
            {accounts.filter(a=>a.account_lifecycle==='CUSTOMER').map(a=><option value={a.business_id} key={a.business_id}>{a.business_name}</option>)}
          </select></label>
          <label>Referred Lead<select name="referred_lead_id" required>
            {leads.map(lead=><option value={lead.id} key={lead.id}>{lead.id.slice(0,8)} · {lead.status}</option>)}
          </select></label>
          <label className="wideField">Evidence note<input name="evidence_note" maxLength={1000} required placeholder="Verified referral source"/></label>
          <button type="submit">Record referral</button>
        </form> : <p className="muted">Recording a referral requires a Customer Account and a canonical referred Lead.</p>}

        <div className="settingsList">
          {referrals.map(referral=><div className="settingsRow" key={referral.id}>
            <div>
              <strong>{accountById.get(referral.referrer_business_id)?.business_name ?? referral.referrer_business_id.slice(0,8)}</strong>
              <span className="muted smallText">{referral.status} · {date(referral.created_at)}</span>
            </div>
            <div>{referral.referred_lead_id ? `Lead ${referral.referred_lead_id.slice(0,8)}` : `Account ${referral.referred_business_id?.slice(0,8) ?? '—'}`}</div>
            {canManage && referral.status==='RECORDED' ? <form action={transitionCustomerReferralAction} className="inlineForm">
              <input type="hidden" name="referral_id" value={referral.id}/><input type="hidden" name="action" value="QUALIFY"/>
              <input type="hidden" name="evidence_note" value="Operator qualification"/>
              <button type="submit">Qualify</button>
            </form> : null}
            {canManage && referral.status==='QUALIFIED' ? <form action={transitionCustomerReferralAction} className="inlineForm">
              <input type="hidden" name="referral_id" value={referral.id}/><input type="hidden" name="action" value="CONVERT"/>
              <input type="hidden" name="evidence_note" value="Canonical WON Deal validation"/>
              <button type="submit">Validate conversion</button>
            </form> : null}
            {canManage && referral.status==='CONVERTED' ? <form action={rewardCustomerReferral} className="inlineForm">
              <input type="hidden" name="referral_id" value={referral.id}/>
              <input type="hidden" name="business_id" value={referral.referrer_business_id}/>
              <input type="hidden" name="request_key" value={`cs-referral-reward-${referral.id}`}/>
              <input type="number" name="points" min={1} defaultValue={100}/>
              <button type="submit">Reward with points</button>
            </form> : null}
            {canManage && ['RECORDED','QUALIFIED'].includes(referral.status) ? <form action={transitionCustomerReferralAction} className="inlineForm">
              <input type="hidden" name="referral_id" value={referral.id}/><input type="hidden" name="action" value="CANCEL"/>
              <input type="hidden" name="evidence_note" value="Operator canceled referral"/>
              <button type="submit">Cancel</button>
            </form> : null}
          </div>)}
        </div>
      </article>
    </section>

    <section className="panel sectionTitle">
      <div className="headerRow">
        <div>
          <h2>Lifecycle campaigns</h2>
          <p className="muted">
            Customer Success does not own a second campaign engine. Create the audience Snapshot and MARKETING Campaign through the canonical Campaign workflow, then classify its lifecycle here.
          </p>
        </div>
        <Link className="textLink" href="/campaigns">Create / approve campaigns →</Link>
      </div>
      <div className="settingsList">
        {campaigns.map(campaign=><form action={classifyCustomerSuccessLifecycleCampaign} className="settingsRow" key={campaign.id}>
          <input type="hidden" name="campaign_id" value={campaign.id}/>
          <div><strong>{campaign.name}</strong><span className="muted smallText">{campaign.status} · {campaign.approval_status}</span></div>
          <label>Lifecycle<select name="lifecycle" defaultValue={campaign.customer_success_lifecycle ?? ''} disabled={!canManage}>
            <option value="">Unclassified</option>
            <option>ONBOARDING</option><option>RETENTION</option><option>REACTIVATION</option><option>LOYALTY</option><option>REFERRAL</option>
          </select></label>
          <button type="submit" disabled={!canManage}>Save lifecycle</button>
        </form>)}
        {campaigns.length===0 ? <p className="muted">No canonical MARKETING Campaign exists yet. Nothing was fabricated for Customer Success.</p> : null}
      </div>
    </section>

    <section className="panel sectionTitle">
      <h2>Safety boundary</h2>
      <p className="muted">
        Customer Success can suggest and materialize human CRM work, record non-cash loyalty/referral evidence,
        and classify canonical Marketing Campaigns. It cannot send a customer message, bypass Marketing permission,
        activate a campaign, change Deal truth, create collected revenue, alter billing credit, or disable Shadow Mode.
      </p>
    </section>
  </div>;
}

[Reading 270 lines from start (total: 270 lines, 0 remaining)]

import Link from 'next/link';

import { loadDataDashboard, type DashboardHistoricalMetric, type DashboardLiveGauge } from '@/lib/analytics/dashboard';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type SearchParamsInput=Record<string,string|string[]|undefined>;

function one(value:string|string[]|undefined){
  return Array.isArray(value)?value[0]:value;
}

function formatNumber(value:number|null){
  if(value==null)return '—';
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
}

function historicalDisplay(metric:DashboardHistoricalMetric|undefined){
  if(!metric||!metric.available)return 'Unavailable';
  const units=Object.entries(metric.valuesByUnit);
  if(units.length){
    return units.map(([unit,value])=>`${formatNumber(value)} ${unit}`).join(' · ');
  }
  if(metric.value==null)return '—';
  if(metric.unit==='PERCENT')return `${formatNumber(metric.value)}%`;
  return formatNumber(metric.value);
}

function liveDisplay(metric:DashboardLiveGauge|undefined){
  return metric?.available?formatNumber(metric.value):'Unavailable';
}

function sourcePill(source:string){
  return <span className="pill">{source}</span>;
}

function MetricCard({
  label,
  value,
  source,
  note,
}:{
  label:string;
  value:string;
  source:string;
  note?:string|null;
}){
  return <div className="card">
    <div className="headerRow">
      <div className="muted">{label}</div>
      {sourcePill(source)}
    </div>
    <div className="value">{value}</div>
    {note?<div className="muted">{note}</div>:null}
  </div>;
}

export default async function ReportsPage({
  searchParams,
}:{
  searchParams:Promise<SearchParamsInput>;
}){
  const params=await searchParams;
  const {supabase,organizationId}=await getCurrentOrganization();
  const rawDays=Number(one(params.days)??30);
  const dashboard=await loadDataDashboard({
    supabase,
    organizationId,
    days:rawDays,
    requestedTenantBusinessId:one(params.business)??null,
    requestedBranchId:one(params.branch)??null,
  });

  const hist=new Map(dashboard.historical.map((metric)=>[metric.key,metric]));
  const live=new Map(dashboard.live.map((metric)=>[metric.key,metric]));
  const missing=new Map(dashboard.unavailable.map((metric)=>[metric.key,metric]));
  const selectedBusiness=dashboard.scope.tenantBusinessId??'';
  const selectedBranch=dashboard.scope.branchId??'';
  const visibleBranches=selectedBusiness
    ?dashboard.scopeOptions.branches.filter((branch)=>branch.tenantBusinessId===selectedBusiness)
    :dashboard.scopeOptions.branches;

  const paymentCaptured=hist.get('payment.captured.amount');
  const paymentRefunded=hist.get('payment.refunded.amount');
  const aiCost=hist.get('ai.usage.cost_usd');
  const whatsappSent=hist.get('communication.whatsapp.sent.count');
  const whatsappDelivered=hist.get('communication.whatsapp.delivered.count');
  const whatsappRead=hist.get('communication.whatsapp.read.count');
  const emailSent=hist.get('communication.email.sent.count');
  const emailDelivered=hist.get('communication.email.delivered.count');

  return <section>
    <div className="headerRow">
      <div>
        <p className="muted">Governed Analytics · v1</p>
        <h1>Business dashboards</h1>
        <p className="muted">
          Historical metrics come from the versioned Metrics Registry + Analytics Warehouse.
          Current-state gauges are marked LIVE. Unsupported evidence stays unavailable instead of being guessed.
        </p>
      </div>
      <div className="status">{dashboard.scope.label} · {dashboard.window.days}d</div>
    </div>

    <div className="panel">
      <div className="headerRow">
        <div>
          <h2>Scope & freshness</h2>
          <p className="muted">Organization / Business / Branch scope is never silently widened.</p>
        </div>
        <span className="pill">
          Warehouse lag {dashboard.freshness.warehouseLagSeconds==null?'—':`${dashboard.freshness.warehouseLagSeconds}s`}
        </span>
      </div>
      <form method="get" className="conversationFilters">
        <label>
          <span className="muted">Window</span>
          <select name="days" defaultValue={String(dashboard.window.days)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <label>
          <span className="muted">Business</span>
          <select name="business" defaultValue={selectedBusiness}>
            <option value="">Organization-wide</option>
            {dashboard.scopeOptions.businesses.map((business)=>
              <option key={business.id} value={business.id}>{business.label}</option>
            )}
          </select>
        </label>
        <label>
          <span className="muted">Branch</span>
          <select name="branch" defaultValue={selectedBranch}>
            <option value="">All visible branches</option>
            {visibleBranches.map((branch)=>
              <option key={branch.id} value={branch.id}>{branch.label}</option>
            )}
          </select>
        </label>
        <button type="submit">Apply</button>
        <Link className="textLink" href="/reports">Reset</Link>
      </form>
      <div className="healthList">
        <span>Organization warehouse facts <strong>{formatNumber(dashboard.freshness.warehouseFactCount)}</strong></span>
        <span>Last complete <strong>{dashboard.freshness.warehouseLastCompleteThrough??'—'}</strong></span>
        <span>Last source event <strong>{dashboard.freshness.warehouseLastSourceEventAt??'—'}</strong></span>
        <span>History cap <strong>{dashboard.freshness.historyTruncated?'Reached · narrow the window':'Within bound'}</strong></span>
      </div>
    </div>

    <div className="grid">
      <MetricCard label="Leads" value={liveDisplay(live.get('leads.total'))} source="LIVE" note={live.get('leads.total')?.reason}/>
      <MetricCard label="Customers / people" value={liveDisplay(live.get('customers.total'))} source="LIVE" note={live.get('customers.total')?.reason}/>
      <MetricCard label="Conversations" value={liveDisplay(live.get('conversations.total'))} source="LIVE" note={live.get('conversations.total')?.reason}/>
      <MetricCard label="Human takeovers" value={historicalDisplay(hist.get('conversation.human_takeover.count'))} source="WAREHOUSE" note={hist.get('conversation.human_takeover.count')?.reason}/>
      <MetricCard label="Open deals" value={liveDisplay(live.get('pipeline.open'))} source="LIVE" note={live.get('pipeline.open')?.reason}/>
      <MetricCard label="Won leads" value={liveDisplay(live.get('leads.won'))} source="LIVE" note={live.get('leads.won')?.reason}/>
      <MetricCard label="Captured revenue" value={historicalDisplay(paymentCaptured)} source="WAREHOUSE" note={paymentCaptured?.reason}/>
      <MetricCard label="AI/provider cost" value={historicalDisplay(aiCost)} source="WAREHOUSE" note={aiCost?.reason}/>
    </div>

    <section className="twoCol">
      <div className="panel">
        <div className="headerRow"><h2>Sales & pipeline</h2>{sourcePill('LIVE + WAREHOUSE')}</div>
        <div className="healthList">
          <span>Qualified leads <strong>{liveDisplay(live.get('leads.qualified'))}</strong></span>
          <span>Won leads <strong>{liveDisplay(live.get('leads.won'))}</strong></span>
          <span>Open deals <strong>{liveDisplay(live.get('pipeline.open'))}</strong></span>
          <span>Won deals <strong>{liveDisplay(live.get('pipeline.won'))}</strong></span>
          <span>Preview views <strong>{historicalDisplay(hist.get('preview.viewed.count'))}</strong></span>
        </div>
      </div>
      <div className="panel">
        <div className="headerRow"><h2>Response & retention</h2>{sourcePill('EVIDENCE GATED')}</div>
        <div className="healthList">
          <span>Response time <strong>Unavailable</strong></span>
          <span>Retention <strong>Unavailable</strong></span>
        </div>
        <p className="muted">{missing.get('response_time')?.reason}</p>
        <p className="muted">{missing.get('retention')?.reason}</p>
      </div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Commerce</h2><p className="muted">Current object counts plus governed lifecycle history.</p></div>{sourcePill('LIVE + WAREHOUSE')}</div>
      <div className="grid">
        <MetricCard label="Bookings · live" value={liveDisplay(live.get('bookings.total'))} source="LIVE" note={live.get('bookings.total')?.reason}/>
        <MetricCard label="Bookings confirmed" value={historicalDisplay(hist.get('booking.confirmed.count'))} source="WAREHOUSE" note={hist.get('booking.confirmed.count')?.reason}/>
        <MetricCard label="Bookings completed" value={historicalDisplay(hist.get('booking.completed.count'))} source="WAREHOUSE" note={hist.get('booking.completed.count')?.reason}/>
        <MetricCard label="Quotes · live" value={liveDisplay(live.get('quotes.total'))} source="LIVE" note={live.get('quotes.total')?.reason}/>
        <MetricCard label="Quotes accepted" value={historicalDisplay(hist.get('quote.accepted.count'))} source="WAREHOUSE" note={hist.get('quote.accepted.count')?.reason}/>
        <MetricCard label="Orders · live" value={liveDisplay(live.get('orders.total'))} source="LIVE" note={live.get('orders.total')?.reason}/>
        <MetricCard label="Orders created" value={historicalDisplay(hist.get('order.created.count'))} source="WAREHOUSE" note={hist.get('order.created.count')?.reason}/>
        <MetricCard label="Invoices issued" value={historicalDisplay(hist.get('invoice.issued.count'))} source="WAREHOUSE" note={hist.get('invoice.issued.count')?.reason}/>
      </div>
    </section>

    <section className="twoCol">
      <div className="panel">
        <div className="headerRow"><h2>Payments & revenue</h2>{sourcePill('PROVIDER-VERIFIED')}</div>
        <div className="healthList">
          <span>Payment intents · live <strong>{liveDisplay(live.get('payments.total'))}</strong></span>
          <span>Captured payments <strong>{historicalDisplay(hist.get('payment.captured.count'))}</strong></span>
          <span>Captured amount <strong>{historicalDisplay(paymentCaptured)}</strong></span>
          <span>Refunded amount <strong>{historicalDisplay(paymentRefunded)}</strong></span>
        </div>
        <p className="muted">Currencies remain separate. No OMR/USD/AED total is manufactured.</p>
      </div>
      <div className="panel">
        <div className="headerRow"><h2>Staff, workflow & campaigns</h2>{sourcePill('LIVE')}</div>
        <div className="healthList">
          <span>Team members <strong>{liveDisplay(live.get('staff.members'))}</strong></span>
          <span>Open tasks <strong>{liveDisplay(live.get('tasks.open'))}</strong></span>
          <span>Enabled workflows <strong>{liveDisplay(live.get('workflows.enabled'))}</strong></span>
          <span>Marketing campaigns <strong>{liveDisplay(live.get('campaigns.total'))}</strong></span>
        </div>
      </div>
    </section>

    <section className="twoCol">
      <div className="panel">
        <div className="headerRow"><h2>Channels</h2>{sourcePill('WAREHOUSE')}</div>
        <div className="healthList">
          <span>WhatsApp sent <strong>{historicalDisplay(whatsappSent)}</strong></span>
          <span>WhatsApp delivered <strong>{historicalDisplay(whatsappDelivered)}</strong></span>
          <span>WhatsApp read <strong>{historicalDisplay(whatsappRead)}</strong></span>
          <span>Email sent <strong>{historicalDisplay(emailSent)}</strong></span>
          <span>Email delivered <strong>{historicalDisplay(emailDelivered)}</strong></span>
        </div>
      </div>
      <div className="panel">
        <div className="headerRow"><h2>AI</h2>{sourcePill('LIVE + WAREHOUSE')}</div>
        <div className="healthList">
          <span>Agent runs · window <strong>{liveDisplay(live.get('ai.runs.30d'))}</strong></span>
          <span>Agent failures · window <strong>{liveDisplay(live.get('ai.failures.30d'))}</strong></span>
          <span>Provider usage cost <strong>{historicalDisplay(aiCost)}</strong></span>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="headerRow">
        <div><h2>Recent daily activity</h2><p className="muted">Last 14 days inside the selected analytics window.</p></div>
        {sourcePill('WAREHOUSE')}
      </div>
      <div className="tableWrap">
        <table className="dataTable">
          <thead><tr><th>Day</th><th>Communication</th><th>Commerce</th><th>Booking</th><th>AI</th></tr></thead>
          <tbody>{dashboard.daily.map((row)=>
            <tr key={row.day}>
              <td>{row.day}</td>
              <td>{row.communication}</td>
              <td>{row.commerce}</td>
              <td>{row.booking}</td>
              <td>{row.ai}</td>
            </tr>
          )}</tbody>
        </table>
      </div>
    </section>

    <section className="panel">
      <h2>Evidence contract</h2>
      <div className="healthList">{dashboard.notes.map((note)=><span key={note}>{note}</span>)}</div>
    </section>
  </section>;
}

[executed on device: vps-eae2ade9 (4241b720-b387-477b-bb4f-5ea2a25fa2a6)]
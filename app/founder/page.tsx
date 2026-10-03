import { notFound } from 'next/navigation';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { founderOsV1Enabled, loadFounderStatusV1 } from '@/lib/founder/server';
import { buildFounderInvestorReadinessV1 } from '@/lib/founder/investor-readiness';
import { FounderAskPanel } from './founder-ask';
import { loadFounderFinanceV1 } from '@/lib/founder/finance-server';
import { FounderFinancePanel } from './finance-panel';

export const dynamic = 'force-dynamic';

function money(value: number | null) {
  return value == null ? '—' : `$${value.toFixed(2)}`;
}

export default async function FounderPage() {
  const current = await getCurrentOrganization();
  if (current.role !== 'OWNER') notFound();
  const service = createSupabaseServiceClient();
  const flag = await founderOsV1Enabled({
    supabase: service,
    organizationId: current.organizationId,
  });
  if (!flag.enabled) notFound();

  const [status, finance] = await Promise.all([
    loadFounderStatusV1({
      supabase: service,
      organizationId: current.organizationId,
    }),
    loadFounderFinanceV1({
      supabase: service,
      organizationId: current.organizationId,
    }),
  ]);

  const investorReadiness = buildFounderInvestorReadinessV1(status, finance);

  const productMetrics = [
    ['Operating mode', status.operatingMode],
    ['Enabled integrations', status.product.enabledIntegrations],
    ['Unhealthy enabled', status.product.unhealthyEnabledIntegrations],
    ['AI-registered actions', status.product.aiRegisteredActions],
    ['Active Knowledge', status.product.activeKnowledgeVersions],
    ['Active Memory', status.product.activeMemoryItems],
    ['Pending Memory', status.product.pendingMemoryItems],
    ['Agent runs · 30d', status.product.agentRuns30d],
    ['Agent failures · 30d', status.product.failedAgentRuns30d],
  ] as const;

  const salesMetrics = [
    ['Leads', status.sales.leads],
    ['Qualified', status.sales.qualifiedLeads],
    ['Won', status.sales.wonLeads],
    ['Conversations', status.sales.conversations],
    ['Tasks', status.sales.tasks],
    ['Active bookings', status.sales.activeBookings],
    ['Quotes', status.sales.quotes],
    ['Orders', status.sales.orders],
    ['Invoices', status.sales.invoices],
    ['Payment transactions', status.sales.paymentTransactions],
  ] as const;

  return <div>
    <div className="headerRow">
      <div>
        <h1>Founder</h1>
        <p className="muted">
          Founder OS V1 is an OWNER-only, feature-flagged, read-only evidence surface.
          It does not execute tools, mutate business state, or bypass canonical approval and runtime gates.
        </p>
      </div>
      <span className="status">{status.mode} · {status.operatingMode}</span>
    </div>

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>What needs attention</h2>
          <p className="muted">Deterministic evidence signals only. No AI recommendation is presented as a fact.</p>
        </div>
        <span className="pill">Snapshot {new Date(status.generatedAt).toLocaleString()}</span>
      </div>
      <div className="settingsList">
        {status.attention.map((item) => <div className="settingsRow" key={item.key}>
          <div>
            <strong>{item.title}</strong>
            <span className="muted smallText">{item.detail}</span>
          </div>
          <span className={item.level === 'BLOCKED' ? 'status dangerStatus' : 'status'}>{item.level}</span>
        </div>)}
      </div>
    </section>

    <FounderAskPanel />

    <FounderFinancePanel finance={finance} />

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>Investor readiness evidence</h2>
          <p className="muted">
            Deterministic evidence coverage only. No valuation, raise probability, investor interest,
            TAM or runway is invented from incomplete records.
          </p>
        </div>
        <span className="status">READ ONLY</span>
      </div>
      <div className="settingsList">
        {investorReadiness.items.map((item) => <div className="settingsRow" key={item.key}>
          <div>
            <strong>{item.title}</strong>
            <span className="muted smallText">{item.detail}</span>
            {item.authorities.length
              ? <span className="muted smallText">Evidence: {item.authorities.join(', ')}</span>
              : null}
          </div>
          <span className={item.state === 'MISSING' ? 'status dangerStatus' : 'status'}>
            {item.state}
          </span>
        </div>)}
      </div>
      <p className="muted smallText">
        Missing company financials, external market research, fundraising structure or investor-pipeline
        evidence stays explicitly missing until a governed authority is connected.
      </p>
    </section>

    <section className="panel">
      <h2>Product & AI</h2>
      <div className="grid">
        {productMetrics.map(([label, value]) => <div className="card" key={label}>
          <div className="muted">{label}</div>
          <div className="value">{value}</div>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <h2>Sales & commercial evidence</h2>
      <div className="grid">
        {salesMetrics.map(([label, value]) => <div className="card" key={label}>
          <div className="muted">{label}</div>
          <div className="value">{value}</div>
        </div>)}
      </div>
      <p className="muted smallText">
        Counts are current canonical records. They are not presented as causal attribution, cash revenue, or investor traction by themselves.
      </p>
    </section>

    <section className="panel">
      <h2>Cost guard</h2>
      <div className="grid">
        <div className="card"><div className="muted">Month spend</div><div className="value">{money(status.finance.monthSpendUsd)}</div></div>
        <div className="card"><div className="muted">Monthly guardrail</div><div className="value">{money(status.finance.monthlyBudgetUsd)}</div></div>
        <div className="card"><div className="muted">Budget used</div><div className="value">{status.finance.budgetUtilizationPct == null ? '—' : `${status.finance.budgetUtilizationPct}%`}</div></div>
      </div>
    </section>

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>Evidence manifest</h2>
          <p className="muted">Founder OS V1 shows where its numbers came from instead of asking everyone to admire a mysterious percentage.</p>
        </div>
      </div>
      <div className="tableWrap">
        <table className="dataTable">
          <thead><tr><th>Authority</th><th>Quality</th><th>Count</th><th>Observed</th><th>Boundary</th></tr></thead>
          <tbody>{status.evidence.map((source) => <tr key={source.authority}>
            <td><strong>{source.authority}</strong></td>
            <td>{source.quality}</td>
            <td>{source.count ?? '—'}</td>
            <td>{source.observedAt ? new Date(source.observedAt).toLocaleString() : '—'}</td>
            <td>{source.detail ?? '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}

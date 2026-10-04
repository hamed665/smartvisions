import { loadSaasBillingOverview, summarizeBillingFormula } from '@/lib/saas/billing';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(value);
}

function date(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB') : value;
}

export default async function BillingPage() {
  const current = await getCurrentOrganization();

  if (!['OWNER', 'ADMIN'].includes(String(current.role))) {
    return <div className="panel">
      <h1>SaaS Billing</h1>
      <p className="muted">Billing administration is limited to Organization OWNER/ADMIN roles.</p>
    </div>;
  }

  const overview = await loadSaasBillingOverview({
    supabase: current.supabase,
    organizationId: current.organizationId,
  });

  const readiness = overview.readiness;

  return <div>
    <div className="headerRow">
      <div>
        <h1>SaaS Billing</h1>
        <p className="muted">
          Smart Visions platform subscription, usage and billing evidence. Tenant customer invoices remain separate.
        </p>
      </div>
      <span className="status">{overview.statements.length} statements</span>
    </div>

    <section className="panel">
      <h2>Billing readiness</h2>
      <div className="settingsList">
        <div className="settingsRow">
          <strong>Subscription</strong>
          <span>{readiness.hasSubscription ? 'Configured' : 'Not configured'}</span>
        </div>
        <div className="settingsRow">
          <strong>Active pricing</strong>
          <span>{readiness.hasActivePricing ? 'Available' : 'Pending'}</span>
        </div>
        <div className="settingsRow">
          <strong>Tax / provider-cost profile</strong>
          <span>{readiness.hasBillingProfile ? 'Configured' : 'Not configured'}</span>
        </div>
        <div className="settingsRow">
          <strong>Coupons / discounts</strong>
          <span>Available via SAAS-COUPONS</span>
        </div>
        <div className="settingsRow">
          <strong>Payment collection</strong>
          <span>Not activated by billing ledger</span>
        </div>
      </div>
    </section>

    {overview.subscription ? <section className="panel">
      <h2>Current subscription</h2>
      <div className="settingsList">
        <div className="settingsRow"><strong>Plan</strong><span>{overview.subscription.plan?.name ?? 'Unavailable'}</span></div>
        <div className="settingsRow"><strong>Status</strong><span>{overview.subscription.status}</span></div>
        <div className="settingsRow"><strong>Period</strong><span>{date(overview.subscription.currentPeriodStart)} → {date(overview.subscription.currentPeriodEnd)}</span></div>
        <div className="settingsRow"><strong>Pricing lane</strong><span>{overview.subscription.pricing ? `${overview.subscription.pricing.currency} · ${overview.subscription.pricing.billingPeriod} · v${overview.subscription.pricing.version}` : 'Unavailable'}</span></div>
        <div className="settingsRow"><strong>AI policy</strong><span>{overview.subscription.pricing ? `${overview.subscription.pricing.aiCostMultiplier}× eligible BILLABLE raw AI cost` : 'Unavailable'}</span></div>
      </div>
    </section> : <section className="panel">
      <h2>No live subscription</h2>
      <p className="muted">
        No commercial subscription is active for this Organization. Smart Visions does not fabricate a plan price,
        allowance or billing statement merely to populate this page.
      </p>
    </section>}

    <section className="panel">
      <h2>Statements</h2>
      {overview.statements.length === 0 ? <p className="muted">No platform billing statement exists yet.</p> : null}
      <div className="settingsList">
        {overview.statements.map(statement => {
          const formula = summarizeBillingFormula(statement);
          return <div className="panel" key={statement.id}>
            <div className="headerRow">
              <div>
                <strong>{date(statement.periodStart)} → {date(statement.periodEnd)}</strong>
                <p className="muted smallText">{statement.status} · {statement.currency}</p>
              </div>
              <span className="status">{money(statement.total, statement.currency)}</span>
            </div>
            <div className="settingsList">
              {[
                ['Setup', formula.setup],
                ['Platform', formula.platform],
                ['Features / add-ons', formula.features],
                ['Channels', formula.channels],
                ['Seats', formula.seats],
                ['AI usage', formula.aiUsage],
                ['Third-party usage', formula.thirdPartyUsage],
                ['Overage', formula.overage],
                ['Discounts', -formula.discounts],
                ['Tax', formula.tax],
              ].map(([label, amount]) => <div className="settingsRow" key={String(label)}>
                <strong>{label}</strong>
                <span>{money(Number(amount), statement.currency)}</span>
              </div>)}
            </div>
          </div>;
        })}
      </div>
    </section>
  </div>;
}

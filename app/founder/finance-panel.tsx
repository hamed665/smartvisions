import type { FounderCurrencyAmount, FounderFinanceV1 } from '@/lib/founder/finance';
import {
  archiveFounderFinanceScenario,
  recordCompanyFinancialSnapshot,
  saveFounderFinanceScenario,
} from './finance-actions';

function money(currency: string, value: number | null) {
  return value == null ? '—' : `${currency} ${value.toFixed(2)}`;
}

function currencyList(items: FounderCurrencyAmount[]) {
  return items.length
    ? items.map((item) => money(item.currency, item.amount)).join(' · ')
    : 'No observed records';
}

export function FounderFinancePanel({ finance }: { finance: FounderFinanceV1 }) {
  const snapshot = finance.companySnapshot;

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Finance & unit economics</h2>
        <p className="muted">
          Canonical billing/payment observations stay separate from OWNER-confirmed company finance
          and from scenario assumptions. No FX conversion is guessed.
        </p>
      </div>
      <span className="status">{snapshot ? 'FINANCE EVIDENCE' : 'FINANCE GAP'}</span>
    </div>

    <div className="grid">
      <div className="card">
        <div className="muted">Derived subscription MRR</div>
        <div className="value smallText">{currencyList(finance.derived.subscriptionMrr)}</div>
      </div>
      <div className="card">
        <div className="muted">Derived subscription ARR</div>
        <div className="value smallText">{currencyList(finance.derived.subscriptionArr)}</div>
      </div>
      <div className="card">
        <div className="muted">Derived net cash collected · 30d</div>
        <div className="value smallText">{currencyList(finance.derived.netCaptured30d)}</div>
      </div>
      <div className="card">
        <div className="muted">Derived outstanding invoices</div>
        <div className="value smallText">{currencyList(finance.derived.outstandingInvoices)}</div>
      </div>
      <div className="card">
        <div className="muted">Derived average WON deal value</div>
        <div className="value smallText">{currencyList(finance.derived.averageWonDealValue)}</div>
      </div>
    </div>

    {snapshot ? <div className="settingsList">
      <div className="settingsRow">
        <div>
          <strong>Latest confirmed company snapshot · {snapshot.asOfDate}</strong>
          <span className="muted smallText">
            Cash {money(snapshot.currency, snapshot.cashBalance)} · net burn {money(snapshot.currency, snapshot.monthlyNetBurn)}/mo
            · runway {finance.companyRunwayMonths == null ? 'not finite from current snapshot' : `${finance.companyRunwayMonths} months`}
          </span>
          <span className="muted smallText">
            Payroll {money(snapshot.currency, snapshot.monthlyPayroll)} · sales/marketing {money(snapshot.currency, snapshot.monthlySalesMarketingSpend)}
            · other opex {money(snapshot.currency, snapshot.monthlyOtherOpex)}
          </span>
          <span className="muted smallText">
            A/R {money(snapshot.currency, snapshot.accountsReceivable)} · A/P {money(snapshot.currency, snapshot.accountsPayable)}
            · Source: {snapshot.sourceRef}
          </span>
        </div>
        <span className="status">USER PROVIDED · MANUAL CONFIRMED</span>
      </div>
    </div> : <p className="muted smallText">
      Cash, company burn and runway remain unknown until an OWNER-confirmed snapshot is recorded.
      Provider Cost Guard is not treated as company burn.
    </p>}

    <details className="promptEditor">
      <summary>Record company finance snapshot</summary>
      <form action={recordCompanyFinancialSnapshot} className="settingsGrid">
        <label>As of date<input type="date" name="as_of_date" required /></label>
        <label>Currency<input name="currency" defaultValue={snapshot?.currency ?? 'OMR'} maxLength={3} required /></label>
        <label>Cash balance<input type="number" min="0" step="0.01" name="cash_balance" required /></label>
        <label>Monthly net burn<input type="number" min="0" step="0.01" name="monthly_net_burn" required /></label>
        <label>Monthly payroll<input type="number" min="0" step="0.01" name="monthly_payroll" defaultValue="0" required /></label>
        <label>Monthly sales/marketing<input type="number" min="0" step="0.01" name="monthly_sales_marketing_spend" defaultValue="0" required /></label>
        <label>Monthly other opex<input type="number" min="0" step="0.01" name="monthly_other_opex" defaultValue="0" required /></label>
        <label>Accounts receivable<input type="number" min="0" step="0.01" name="accounts_receivable" defaultValue="0" required /></label>
        <label>Accounts payable<input type="number" min="0" step="0.01" name="accounts_payable" defaultValue="0" required /></label>
        <label className="wideField">Source reference<input name="source_ref" placeholder="Bank statement / accounting report / manual close reference" maxLength={512} required /></label>
        <label className="wideField">Evidence note<textarea name="note" rows={3} maxLength={1800} /></label>
        <button>Record immutable snapshot</button>
      </form>
    </details>

    <div className="settingsList">
      {finance.scenarios.map(({ scenario, metrics, customerCountProjections, revenueForecast }) => <div className="settingsRow" key={scenario.id}>
        <div>
          <strong>{scenario.name} · ASSUMPTION</strong>
          <span className="muted smallText">
            Runway {metrics.runwayMonths ?? '—'} mo · CAC {money(scenario.currency, metrics.cac)}
            · LTV {money(scenario.currency, metrics.ltv)} · LTV:CAC {metrics.ltvCacRatio ?? '—'}
            · payback {metrics.paybackMonths ?? '—'} mo
          </span>
          <span className="muted smallText">
            Gross profit/customer/mo {money(scenario.currency, metrics.grossProfitPerCustomerMonthly)}
            · break-even customer count {metrics.incrementalCustomersToOffsetNetBurn ?? '—'}
          </span>
          <span className="muted smallText">
            Revenue scenarios: {customerCountProjections.map((projection) =>
              `${projection.customerCount} customers = ${money(scenario.currency, projection.monthlyRevenue)}/mo · ${money(scenario.currency, projection.annualRevenueRunRate)} ARR`
            ).join(' | ')}
          </span>
          <span className="muted smallText">
            12-month SCENARIO forecast: month 1 {money(scenario.currency, revenueForecast[0]?.monthlyRevenue ?? null)}
            {' · '}month 6 {money(scenario.currency, revenueForecast[5]?.monthlyRevenue ?? null)}
            {' · '}month 12 {money(scenario.currency, revenueForecast[11]?.monthlyRevenue ?? null)}
          </span>
        </div>
        <details>
          <summary>Edit</summary>
          <form action={saveFounderFinanceScenario} className="settingsGrid">
            <input type="hidden" name="id" value={scenario.id}/>
            <input type="hidden" name="version" value={scenario.version}/>
            <label>Name<input name="name" defaultValue={scenario.name} maxLength={120} required /></label>
            <label>Currency<input name="currency" defaultValue={scenario.currency} maxLength={3} required /></label>
            <label>Cash assumption<input type="number" min="0" step="0.01" name="cash_balance_assumption" defaultValue={scenario.cashBalanceAssumption} required /></label>
            <label>Monthly net burn assumption<input type="number" min="0" step="0.01" name="monthly_net_burn_assumption" defaultValue={scenario.monthlyNetBurnAssumption} required /></label>
            <label>Sales/marketing/mo<input type="number" min="0" step="0.01" name="monthly_sales_marketing_spend_assumption" defaultValue={scenario.monthlySalesMarketingSpendAssumption} required /></label>
            <label>Starting customers<input type="number" min="0" step="1" name="starting_customer_count_assumption" defaultValue={scenario.startingCustomerCountAssumption} required /></label>
            <label>New customers/mo<input type="number" min="0" step="0.01" name="new_customers_per_month_assumption" defaultValue={scenario.newCustomersPerMonthAssumption} required /></label>
            <label>Custom target customers<input type="number" min="0" step="1" name="target_customer_count_assumption" defaultValue={scenario.targetCustomerCountAssumption} required /></label>
            <label>ARPA/mo<input type="number" min="0" step="0.01" name="monthly_arpa_assumption" defaultValue={scenario.monthlyArpaAssumption} required /></label>
            <label>Gross margin %<input type="number" min="0" max="100" step="0.01" name="gross_margin_pct_assumption" defaultValue={scenario.grossMarginBpsAssumption / 100} required /></label>
            <label>Monthly churn %<input type="number" min="0" max="100" step="0.01" name="monthly_churn_pct_assumption" defaultValue={scenario.monthlyChurnBpsAssumption / 100} required /></label>
            <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={scenario.notes ?? ''}/></label>
            <button>Save scenario</button>
          </form>
          <form action={archiveFounderFinanceScenario}>
            <input type="hidden" name="id" value={scenario.id}/>
            <input type="hidden" name="version" value={scenario.version}/>
            <button>Archive scenario</button>
          </form>
        </details>
      </div>)}
    </div>

    <details className="promptEditor">
      <summary>Create finance scenario</summary>
      <form action={saveFounderFinanceScenario} className="settingsGrid">
        <label>Name<input name="name" placeholder="Base case" maxLength={120} required /></label>
        <label>Currency<input name="currency" defaultValue={snapshot?.currency ?? 'OMR'} maxLength={3} required /></label>
        <label>Cash assumption<input type="number" min="0" step="0.01" name="cash_balance_assumption" defaultValue={snapshot?.cashBalance ?? 0} required /></label>
        <label>Monthly net burn assumption<input type="number" min="0" step="0.01" name="monthly_net_burn_assumption" defaultValue={snapshot?.monthlyNetBurn ?? 0} required /></label>
        <label>Sales/marketing/mo<input type="number" min="0" step="0.01" name="monthly_sales_marketing_spend_assumption" defaultValue={snapshot?.monthlySalesMarketingSpend ?? 0} required /></label>
        <label>Starting customers<input type="number" min="0" step="1" name="starting_customer_count_assumption" defaultValue="0" required /></label>
        <label>New customers/mo<input type="number" min="0" step="0.01" name="new_customers_per_month_assumption" defaultValue="0" required /></label>
        <label>Custom target customers<input type="number" min="0" step="1" name="target_customer_count_assumption" defaultValue="0" required /></label>
        <label>ARPA/mo<input type="number" min="0" step="0.01" name="monthly_arpa_assumption" defaultValue="0" required /></label>
        <label>Gross margin %<input type="number" min="0" max="100" step="0.01" name="gross_margin_pct_assumption" defaultValue="0" required /></label>
        <label>Monthly churn %<input type="number" min="0" max="100" step="0.01" name="monthly_churn_pct_assumption" defaultValue="0" required /></label>
        <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={2000}/></label>
        <button>Create scenario</button>
      </form>
    </details>

    <div className="settingsList">
      {finance.missingEvidence.map((item) => <div className="settingsRow" key={item.metric}>
        <div>
          <strong>{item.metric}</strong>
          <span className="muted smallText">{item.detail}</span>
        </div>
        <span className="status dangerStatus">MISSING EVIDENCE</span>
      </div>)}
    </div>

    <p className="muted smallText">
      Scenario metrics are derived assumptions, not accounting facts. Observed billing/payment/CRM values are grouped by currency and never converted using guessed FX.
    </p>
  </section>;
}

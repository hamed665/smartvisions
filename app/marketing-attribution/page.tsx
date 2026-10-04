import Link from 'next/link';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const MODELS = ['FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR'] as const;
const OUTCOMES = [
  'ALL',
  'DEAL_WON',
  'BOOKING_COMPLETED',
  'QUOTE_ACCEPTED',
  'ORDER_FULFILLED',
  'PAYMENT_CAPTURED',
] as const;

type AttributionModel = typeof MODELS[number];
type AttributionOutcome = typeof OUTCOMES[number];

type AttributionRow = {
  outcome_type: Exclude<AttributionOutcome,'ALL'>;
  outcome_id: string;
  outcome_evidence_id: string;
  lead_id: string;
  lead_link_basis: string;
  deal_id: string | null;
  outcome_at: string;
  outcome_value: number | string | null;
  outcome_currency: string | null;
  outcome_value_class: 'SALES_VALUE' | 'NON_MONETARY' | 'COMMERCIAL_VALUE' | 'COLLECTED_MONEY';
  campaign_id: string;
  campaign_name: string;
  campaign_channel: string;
  attribution_model: AttributionModel;
  credit_bps: number;
  first_touch_at: string;
  last_touch_at: string;
  touch_count: number;
  conversation_ids: string[];
  reply_count: number;
  explicit_conversion_evidence_count: number;
  causal_claim: boolean;
  collected_money_evidence: boolean;
  evidence_basis: string[];
};

function parseModel(value: string | string[] | undefined): AttributionModel {
  const raw = Array.isArray(value) ? value[0] : value;
  return MODELS.includes(raw as AttributionModel) ? raw as AttributionModel : 'LAST_TOUCH';
}

function parseOutcome(value: string | string[] | undefined): AttributionOutcome {
  const raw = Array.isArray(value) ? value[0] : value;
  return OUTCOMES.includes(raw as AttributionOutcome) ? raw as AttributionOutcome : 'ALL';
}

function parseDays(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 30);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(180, Math.max(1, parsed));
}

function displayValue(row: AttributionRow) {
  if (row.outcome_value == null) return '—';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(row.outcome_value));
  return row.outcome_currency ? `${amount} ${row.outcome_currency}` : amount;
}

function outcomeLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default async function MarketingAttributionPage({
  searchParams,
}: {
  searchParams: Promise<{
    model?: string | string[];
    outcome?: string | string[];
    days?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const model = parseModel(params.model);
  const outcome = parseOutcome(params.outcome);
  const days = parseDays(params.days);
  const { supabase, organizationId } = await getCurrentOrganization();

  const result = await supabase.rpc('get_observational_attribution_v2', {
    p_organization_id: organizationId,
    p_outcome_type: outcome,
    p_model: model,
    p_lookback_days: days,
    p_limit: 200,
  });

  const rows = (result.error ? [] : result.data ?? []) as AttributionRow[];
  const outcomeCount = new Set(rows.map((row) => `${row.outcome_type}:${row.outcome_id}:${row.outcome_evidence_id}`)).size;
  const campaignCount = new Set(rows.map((row) => row.campaign_id)).size;
  const exactConversationRows = rows.filter((row) => (row.conversation_ids ?? []).length > 0).length;
  const collectedMoneyRows = rows.filter((row) => row.collected_money_evidence).length;

  return (
    <div>
      <div className="headerRow">
        <div>
          <p className="muted">Governed Analytics · Observational only</p>
          <h1>Marketing & sales attribution</h1>
          <p className="muted">
            Observational credit is computed from real sent Marketing touchpoints plus timestamped canonical outcomes.
            It never claims causality. Commercial value and collected money are deliberately kept separate.
          </p>
        </div>
        <div>
          <Link className="textLink" href="/reports">Dashboards →</Link>{' · '}
          <Link className="textLink" href="/campaigns">Campaigns →</Link>
        </div>
      </div>

      <section className="statsGrid fourStats">
        <article><span>Attributed outcomes</span><strong>{outcomeCount}</strong></article>
        <article><span>Campaigns with credit</span><strong>{campaignCount}</strong></article>
        <article><span>Exact conversation links</span><strong>{exactConversationRows}</strong></article>
        <article><span>Captured-money rows</span><strong>{collectedMoneyRows}</strong></article>
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <strong>Bounded observational model</strong>
            <p className="muted">
              FIRST TOUCH and LAST TOUCH assign 100% observational credit to one eligible campaign.
              LINEAR splits exactly 100% across eligible campaigns inside the bounded lookback.
            </p>
          </div>
          <span className="pill">{days}d lookback</span>
        </div>

        <form method="get" className="conversationFilters">
          <label>
            <span className="muted">Outcome</span>
            <select name="outcome" defaultValue={outcome}>
              {OUTCOMES.map((item) => (
                <option key={item} value={item}>{outcomeLabel(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Model</span>
            <select name="model" defaultValue={model}>
              {MODELS.map((item) => (
                <option key={item} value={item}>{outcomeLabel(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Lookback</span>
            <select name="days" defaultValue={String(days)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
            </select>
          </label>
          <button type="submit">Apply</button>
          <Link className="textLink" href="/marketing-attribution">Reset</Link>
        </form>
      </section>

      <section className="panel">
        <strong>Outcome evidence classes</strong>
        <div className="healthList">
          <span>DEAL WON <strong>Sales value, not revenue</strong></span>
          <span>BOOKING COMPLETED <strong>Non-monetary lifecycle evidence</strong></span>
          <span>QUOTE ACCEPTED <strong>Commercial proposal value</strong></span>
          <span>ORDER FULFILLED <strong>Commercial order value</strong></span>
          <span>PAYMENT CAPTURED <strong>Immutable collected-money evidence</strong></span>
        </div>
      </section>

      {result.error ? (
        <section className="panel">
          <p className="muted">Attribution V2 is not available on this database revision yet.</p>
        </section>
      ) : null}

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Campaign</th>
              <th>Credit</th>
              <th>Value</th>
              <th>Class</th>
              <th>Lead link</th>
              <th>Touches</th>
              <th>Conversation</th>
              <th>Replies</th>
              <th>Direct evidence</th>
              <th>Last touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.outcome_type}:${row.outcome_evidence_id}:${row.campaign_id}`}>
                <td>
                  <strong>{outcomeLabel(row.outcome_type)}</strong><br/>
                  <span className="muted">{row.outcome_id.slice(0,8)}</span>
                </td>
                <td>{row.campaign_name} · {row.campaign_channel}</td>
                <td>{(row.credit_bps / 100).toFixed(2)}%</td>
                <td>{displayValue(row)}</td>
                <td>
                  {row.outcome_value_class}
                  {row.collected_money_evidence ? <><br/><span className="status">MONEY MOVEMENT</span></> : null}
                </td>
                <td>{row.lead_link_basis}</td>
                <td>{row.touch_count}</td>
                <td>{row.conversation_ids?.length ?? 0}</td>
                <td>{row.reply_count}</td>
                <td>{row.explicit_conversion_evidence_count}</td>
                <td>{new Date(row.last_touch_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel">
        <strong>Evidence boundary</strong>
        <div className="healthList">
          <span>Causality <strong>Never claimed</strong></span>
          <span>Touchpoint <strong>Real sent Marketing outreach only</strong></span>
          <span>Conversation link <strong>Exact provider message ID only</strong></span>
          <span>Lead link <strong>Direct / Deal / Booking linkage only</strong></span>
          <span>Captured money <strong>Immutable PAYMENT-CORE transaction only</strong></span>
        </div>
        <p className="muted">
          UTM, referrer and advertising click IDs are not used because there is no canonical timestamped touchpoint
          authority for them yet. Current-state source fields, person similarity and fuzzy cross-channel matching are not
          treated as historical attribution evidence.
        </p>
        <p className="muted">
          Deal amount is sales evidence, not payment or revenue. A captured payment may later be refunded. This surface
          reports the captured event as money-movement evidence; it does not silently convert that event into causal or
          net-revenue attribution.
        </p>
      </section>
    </div>
  );
}
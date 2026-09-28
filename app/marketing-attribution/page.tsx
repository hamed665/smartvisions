import Link from 'next/link';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const MODELS = ['FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR'] as const;
type AttributionModel = typeof MODELS[number];

type AttributionRow = {
  deal_id: string;
  lead_id: string;
  outcome_at: string;
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
  won_deal_amount: number | string | null;
  won_deal_currency: string | null;
  causal_claim: boolean;
  revenue_claimed: boolean;
  evidence_basis: string[];
};

function parseModel(value: string | string[] | undefined): AttributionModel {
  const raw = Array.isArray(value) ? value[0] : value;
  return MODELS.includes(raw as AttributionModel) ? raw as AttributionModel : 'LAST_TOUCH';
}

function parseDays(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 30);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(180, Math.max(1, parsed));
}

export default async function MarketingAttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[]; days?: string | string[] }>;
}) {
  const params = await searchParams;
  const model = parseModel(params.model);
  const days = parseDays(params.days);
  const { supabase, organizationId } = await getCurrentOrganization();

  const result = await supabase.rpc('get_marketing_attribution', {
    p_organization_id: organizationId,
    p_model: model,
    p_lookback_days: days,
    p_limit: 200,
  });

  const rows = (result.error ? [] : result.data ?? []) as AttributionRow[];
  const dealCount = new Set(rows.map((row) => row.deal_id)).size;
  const campaignCount = new Set(rows.map((row) => row.campaign_id)).size;
  const exactConversationRows = rows.filter((row) => (row.conversation_ids ?? []).length > 0).length;

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Marketing Attribution</h1>
          <p className="muted">
            Observational credit over real sent Marketing touchpoints and canonical WON Deals. This report never claims
            causality, clicks, views or collected revenue.
          </p>
        </div>
        <Link className="textLink" href="/campaigns">Campaigns →</Link>
      </div>

      <section className="statsGrid fourStats">
        <article><span>Attributed won deals</span><strong>{dealCount}</strong></article>
        <article><span>Campaigns with credit</span><strong>{campaignCount}</strong></article>
        <article><span>Exact conversation links</span><strong>{exactConversationRows}</strong></article>
        <article><span>Lookback</span><strong>{days}d</strong></article>
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <strong>Bounded model</strong>
            <p className="muted">
              FIRST_TOUCH and LAST_TOUCH assign 100% observational credit to one eligible campaign. LINEAR splits exactly
              100% across eligible campaigns inside the bounded lookback.
            </p>
          </div>
          <div>
            {MODELS.map((item) => (
              <Link
                className={item === model ? 'status' : 'textLink'}
                href={`/marketing-attribution?model=${item}&days=${days}`}
                key={item}
              >
                {item.replaceAll('_', ' ')}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {result.error ? (
        <section className="panel">
          <p className="muted">Marketing attribution is not available on this database revision yet.</p>
        </section>
      ) : null}

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Won deal</th>
              <th>Campaign</th>
              <th>Credit</th>
              <th>Touches</th>
              <th>Conversation</th>
              <th>Replies</th>
              <th>Direct evidence</th>
              <th>Deal amount</th>
              <th>Last touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.deal_id}:${row.campaign_id}`}>
                <td>{row.deal_id}</td>
                <td>{row.campaign_name} · {row.campaign_channel}</td>
                <td>{(row.credit_bps / 100).toFixed(2)}%</td>
                <td>{row.touch_count}</td>
                <td>{row.conversation_ids?.length ?? 0}</td>
                <td>{row.reply_count}</td>
                <td>{row.explicit_conversion_evidence_count}</td>
                <td>
                  {row.won_deal_amount == null
                    ? '—'
                    : `${row.won_deal_amount} ${row.won_deal_currency ?? ''}`.trim()}
                </td>
                <td>{new Date(row.last_touch_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel">
        <strong>Evidence boundary</strong>
        <p className="muted">
          Deal amount is sales evidence, not payment or revenue. Booking, Order, Invoice and Payment attribution stays
          deferred until those canonical authorities exist. Exact Conversation linkage requires the same provider message
          ID; no fuzzy cross-channel matching is used.
        </p>
      </section>
    </div>
  );
}

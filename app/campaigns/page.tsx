import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { createCampaign, updateCampaign } from '@/app/management-actions';
import {
  createMarketingCampaign,
  recordMarketingCampaignConversion,
  transitionMarketingCampaign,
  upsertMarketingCampaignVariant,
} from '@/app/marketing-campaign-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { effectiveCampaignStatus } from '@/lib/reliability/operational-truth';

export const dynamic = 'force-dynamic';

type MarketingCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  approval_status: string;
  country_code: string;
  channel: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  audience_snapshot_id: string;
  segment_id: string;
  segment_version: number;
  audience_member_count: number;
  frequency_cap_per_recipient: number;
  budget_cap_minor: number;
  budget_currency: string;
  variant_count: number;
  allocation_bps: number;
  control_variant_count: number;
  outbound_count: number;
  response_count: number;
  conversion_evidence_count: number;
  ready_to_start: boolean;
  readiness_issues: string[];
  version: number;
  updated_at: string;
};

type SnapshotRow = {
  id: string;
  segment_id: string;
  segment_version: number;
  entity_type: string;
  member_count: number;
  purpose: string;
  created_at: string;
};

type TemplateRow = {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  language: string;
  enabled: boolean;
};

type VariantRow = {
  id: string;
  campaign_id?: string | null;
  message_template_id?: string | null;
  variant_key: string;
  strategy: string;
  allocation_bps?: number | null;
  is_control?: boolean | null;
  enabled: boolean;
};

type DealRow = {
  id: string;
  title: string;
  state: string;
  amount: number | null;
  currency: string | null;
};

function currencyDecimals(currency: string) {
  if (['OMR', 'BHD', 'KWD', 'JOD', 'TND'].includes(currency)) return 3;
  if (['JPY', 'KRW'].includes(currency)) return 0;
  return 2;
}

function formatBudget(minor: number, currency: string) {
  const decimals = currencyDecimals(currency);
  const factor = 10 ** decimals;
  return `${(Number(minor) / factor).toFixed(decimals)} ${currency}`;
}

function dateTimeValue(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function transitionActions(row: MarketingCampaignRow, canApprove: boolean) {
  const actions: string[] = [];
  if (row.campaign_status === 'DRAFT' && ['DRAFT', 'REJECTED'].includes(row.approval_status)) actions.push('SUBMIT');
  if (row.approval_status === 'PENDING' && canApprove) actions.push('APPROVE', 'REJECT');
  if (row.campaign_status === 'DRAFT' && row.approval_status === 'APPROVED') actions.push('START');
  if (row.campaign_status === 'RUNNING') actions.push('PAUSE', 'COMPLETE');
  if (row.campaign_status === 'PAUSED') actions.push('RESUME', 'COMPLETE');
  return actions;
}

export default async function CampaignsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const canManageMarketing = ['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role);
  const canApprove = ['OWNER', 'ADMIN'].includes(role);
  const legacyEditable = role === 'OWNER';

  const [
    campaignsResult,
    marketingResult,
    snapshotsResult,
    templatesResult,
    variantsResult,
    dealsResult,
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    supabase.rpc('get_marketing_campaigns', { p_organization_id: organizationId, p_limit: 200 }),
    supabase
      .from('crm_segment_snapshots')
      .select('id,segment_id,segment_version,entity_type,member_count,purpose,created_at')
      .eq('organization_id', organizationId)
      .eq('purpose', 'CAMPAIGN')
      .eq('entity_type', 'LEAD')
      .order('created_at', { ascending: false }),
    supabase
      .from('message_templates')
      .select('id,name,channel,purpose,language,enabled')
      .eq('organization_id', organizationId)
      .eq('enabled', true)
      .order('updated_at', { ascending: false }),
    supabase
      .from('message_variants')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('crm_deals')
      .select('id,title,state,amount,currency')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  // Deploy-before-migration resilience: legacy Hunter campaigns remain usable if
  // the new read RPC is not present for a brief release ordering window.
  const allCampaigns = campaignsResult.data ?? [];
  const legacyRows = allCampaigns.filter((row) => String(row.campaign_kind ?? 'HUNTER') !== 'MARKETING');
  const effectiveLegacy = legacyRows.map((row) => ({ row, state: effectiveCampaignStatus(row) }));
  const marketingRows = (marketingResult.error ? [] : marketingResult.data ?? []) as MarketingCampaignRow[];
  const snapshots = (snapshotsResult.data ?? []) as SnapshotRow[];
  const templates = (templatesResult.data ?? []) as TemplateRow[];
  const variants = (variantsResult.data ?? []) as VariantRow[];
  const deals = (dealsResult.data ?? []) as DealRow[];

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Campaigns</h1>
          <p className="muted">
            Governed marketing campaigns use an immutable Segment Snapshot, explicit schedule and caps,
            approval, controlled variants, and evidence. Campaign state never bypasses the canonical send gate.
          </p>
        </div>
        <span className="status">
          {marketingRows.filter((row) => row.campaign_status === 'RUNNING').length} marketing running
        </span>
      </div>

      <section className="panel">
        <h2>Marketing campaigns</h2>
        <p className="muted">
          Snapshot membership is not consent. Every actual recipient still passes canonical DNC, suppression,
          channel permission, market-window, pause and Shadow Mode checks at send time. This page does not send messages.
        </p>

        {marketingResult.error ? (
          <p className="muted smallText">
            Marketing governance is not yet available on this database revision. Legacy campaigns remain read/write safe.
          </p>
        ) : null}

        <div className="settingsList">
          {marketingRows.map((campaign) => {
            const campaignVariants = variants.filter((variant) => variant.campaign_id === campaign.campaign_id);
            const matchingTemplates = templates.filter((template) => template.channel === campaign.channel);
            const actions = transitionActions(campaign, canApprove);
            return (
              <article className="settingsRow campaignRow" key={campaign.campaign_id}>
                <div className="wideField">
                  <strong>{campaign.campaign_name}</strong>
                  <span className="muted smallText">
                    {campaign.channel} · {campaign.country_code} · {campaign.campaign_status} · approval {campaign.approval_status}
                  </span>
                  <span className="muted smallText">
                    Segment v{campaign.segment_version} · frozen audience {campaign.audience_member_count} ·
                    {' '}frequency cap {campaign.frequency_cap_per_recipient}/recipient ·
                    {' '}budget {formatBudget(campaign.budget_cap_minor, campaign.budget_currency)}
                  </span>
                  <span className="muted smallText">
                    Variants {campaign.variant_count} · allocation {campaign.allocation_bps}/10000 bps ·
                    {' '}outbound evidence {campaign.outbound_count} · responses {campaign.response_count} ·
                    {' '}explicit conversions {campaign.conversion_evidence_count}
                  </span>
                  <span className="muted smallText">
                    Schedule {new Date(campaign.scheduled_start_at).toLocaleString()}
                    {campaign.scheduled_end_at ? ` → ${new Date(campaign.scheduled_end_at).toLocaleString()}` : ''}
                  </span>
                  <span className="muted smallText">
                    {campaign.ready_to_start ? 'Ready for governed start' : campaign.readiness_issues.join(' · ')}
                  </span>
                </div>

                {canManageMarketing && matchingTemplates.length ? (
                  <form action={upsertMarketingCampaignVariant} className="settingsGrid wideField">
                    <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                    <label>
                      Variant key
                      <input name="variant_key" placeholder="A" maxLength={40} required />
                    </label>
                    <label>
                      Template
                      <select name="message_template_id" required>
                        {matchingTemplates.map((template) => (
                          <option value={template.id} key={template.id}>
                            {template.name} · {template.language} · {template.purpose}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Strategy
                      <select name="strategy" defaultValue="direct_idea">
                        <option value="problem_first">Problem first</option>
                        <option value="opportunity_first">Opportunity first</option>
                        <option value="direct_idea">Direct idea</option>
                      </select>
                    </label>
                    <label>
                      Allocation bps
                      <input type="number" name="allocation_bps" min={1} max={10000} defaultValue={10000} required />
                    </label>
                    <label className="toggleLabel">
                      <input type="checkbox" name="is_control" /> Control
                    </label>
                    <button type="submit" disabled={campaign.campaign_status === 'RUNNING'}>
                      Add / update variant
                    </button>
                  </form>
                ) : (
                  <span className="muted smallText wideField">
                    {campaignVariants.length
                      ? 'Campaign variants are governed here; pause a running campaign before editing.'
                      : 'Create an enabled template for this channel in Message Studio before adding variants.'}
                  </span>
                )}

                {actions.length && canManageMarketing ? (
                  <div className="settingsGrid wideField">
                    {actions.map((action) => (
                      <form action={transitionMarketingCampaign} key={action}>
                        <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                        <input type="hidden" name="action" value={action} />
                        <button type="submit">{action}</button>
                      </form>
                    ))}
                  </div>
                ) : null}

                {canManageMarketing && deals.length ? (
                  <form action={recordMarketingCampaignConversion} className="settingsGrid wideField">
                    <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                    <input type="hidden" name="request_key" value={`campaign-conversion-${randomUUID()}`} />
                    <label>
                      Deal
                      <select name="deal_id" required>
                        {deals.map((deal) => (
                          <option value={deal.id} key={deal.id}>
                            {deal.title} · {deal.state}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Variant
                      <select name="message_variant_id" defaultValue="">
                        <option value="">No specific variant</option>
                        {campaignVariants.map((variant) => (
                          <option value={variant.id} key={variant.id}>
                            {variant.variant_key}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Occurred at
                      <input
                        type="datetime-local"
                        name="occurred_at"
                        defaultValue={dateTimeValue(new Date().toISOString())}
                        required
                      />
                    </label>
                    <label className="wideField">
                      Evidence note
                      <input name="evidence_note" maxLength={500} placeholder="Directly verified conversion evidence" required />
                    </label>
                    <button type="submit">Record explicit conversion evidence</button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>

        {canManageMarketing ? (
          <section className="settingsCreate">
            <h3>Create governed marketing campaign</h3>
            {snapshots.length === 0 ? (
              <p className="muted">
                No CAMPAIGN-purpose LEAD Segment Snapshot exists yet. Freeze the exact audience in{' '}
                <Link href="/segments">Segments</Link> first. Dynamic Segment membership cannot be used as campaign evidence.
              </p>
            ) : templates.length === 0 ? (
              <p className="muted">
                No enabled message template exists. Create one in <Link href="/messages">Message Studio</Link> before campaign setup.
              </p>
            ) : (
              <form action={createMarketingCampaign} className="settingsGrid">
                <input type="hidden" name="request_key" value={`marketing-campaign-${randomUUID()}`} />
                <label>
                  Name
                  <input name="name" required placeholder="September reactivation" maxLength={160} />
                </label>
                <label>
                  Audience snapshot
                  <select name="audience_snapshot_id" required>
                    {snapshots.map((snapshot) => (
                      <option value={snapshot.id} key={snapshot.id}>
                        Segment {snapshot.segment_id.slice(0, 8)} · v{snapshot.segment_version} · {snapshot.member_count} Leads
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue="EMAIL">
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="INSTAGRAM">Instagram</option>
                  </select>
                </label>
                <label>
                  Country
                  <input name="country_code" defaultValue="OM" minLength={2} maxLength={2} required />
                </label>
                <label>
                  Start
                  <input type="datetime-local" name="scheduled_start_at" required />
                </label>
                <label>
                  End
                  <input type="datetime-local" name="scheduled_end_at" />
                </label>
                <label>
                  Frequency cap / recipient
                  <input type="number" name="frequency_cap_per_recipient" min={1} max={100} defaultValue={1} required />
                </label>
                <label>
                  Budget
                  <input name="budget_amount" inputMode="decimal" defaultValue="25.000" required />
                </label>
                <label>
                  Currency
                  <input name="budget_currency" defaultValue="OMR" minLength={3} maxLength={3} required />
                </label>
                <button type="submit">Create draft</button>
              </form>
            )}
          </section>
        ) : null}
      </section>

      <section className="panel">
        <h2>Legacy Hunter campaigns</h2>
        <p className="muted">
          Existing discovery/acquisition campaigns remain on their original authority and runtime flags.
          They are not silently converted into Marketing campaigns.
        </p>
        <section className="grid">
          <div className="card"><span className="muted">Draft</span><div className="value">{effectiveLegacy.filter((x) => x.state.status === 'DRAFT').length}</div></div>
          <div className="card"><span className="muted">Running</span><div className="value">{effectiveLegacy.filter((x) => x.state.status === 'RUNNING').length}</div></div>
          <div className="card"><span className="muted">Paused</span><div className="value">{effectiveLegacy.filter((x) => x.state.status === 'PAUSED').length}</div></div>
          <div className="card"><span className="muted">Completed</span><div className="value">{effectiveLegacy.filter((x) => x.state.status === 'COMPLETED').length}</div></div>
        </section>

        <div className="settingsList">
          {effectiveLegacy.map(({ row: campaign, state }) => (
            <form action={updateCampaign} className="settingsRow campaignRow" key={campaign.id}>
              <input type="hidden" name="id" value={campaign.id} />
              <div>
                <strong>{campaign.name}</strong>
                <span className="muted smallText">
                  {campaign.hunter_type} · {[campaign.country_code, campaign.city, campaign.industry].filter(Boolean).join(' · ') || 'Global'}
                </span>
                {state.reason ? <span className="muted smallText">Effective state: {state.status} · {state.reason}</span> : null}
              </div>
              <label>
                Status
                <select name="status" defaultValue={state.status} disabled={!legacyEditable}>
                  <option>DRAFT</option>
                  <option>RUNNING</option>
                  <option>PAUSED</option>
                  <option>COMPLETED</option>
                  <option>FAILED</option>
                </select>
              </label>
              <label>
                Target count
                <input type="number" min={1} name="target_count" defaultValue={campaign.target_count} disabled={!legacyEditable} />
              </label>
              <button disabled={!legacyEditable}>Save</button>
            </form>
          ))}
        </div>

        {legacyEditable ? (
          <section className="settingsCreate">
            <h3>Create Hunter campaign</h3>
            <form action={createCampaign} className="settingsGrid">
              <label>Name<input name="name" required placeholder="Muscat dental clinics" /></label>
              <label>Hunter<select name="hunter_type"><option value="BUSINESS">Business Hunter</option><option value="INTENT">Project / Intent Hunter</option></select></label>
              <label>Country<input name="country_code" placeholder="OM" maxLength={2} /></label>
              <label>City<input name="city" placeholder="Muscat" /></label>
              <label>Industry<input name="industry" placeholder="Dental clinic" /></label>
              <label>Target leads<input type="number" min={1} name="target_count" defaultValue={25} /></label>
              <button>Create draft</button>
            </form>
          </section>
        ) : null}
      </section>
    </div>
  );
}

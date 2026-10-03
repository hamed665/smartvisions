import type { FounderInvestorWorkspaceV1 } from '@/lib/founder/investor';
import {
  confirmFounderInvestorCandidateToCrm,
  createFounderInvestorPipelineEntry,
  ensureFounderFundraisingPipeline,
  moveFounderInvestorDealStage,
  recordFounderInvestorResearchCandidate,
  saveFounderFundraisingRound,
} from './investor-actions';

function money(currency: string | null, value: number | null) {
  return currency && value != null ? `${currency} ${value.toFixed(2)}` : '—';
}

function allocation(round: FounderInvestorWorkspaceV1['rounds'][number], key: string) {
  const allocationPct = round.useOfFunds.allocationPct;
  if (!allocationPct || typeof allocationPct !== 'object' || Array.isArray(allocationPct)) return 0;
  const value = Number((allocationPct as Record<string, unknown>)[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function FounderInvestorPanel({ investor }: { investor: FounderInvestorWorkspaceV1 }) {
  const external = investor.candidates.filter((candidate) => candidate.recordState === 'DISCOVERED_EXTERNAL');
  const confirmed = investor.candidates.filter((candidate) => candidate.recordState === 'CRM_CONFIRMED');
  const activeRounds = investor.rounds.filter((round) => round.status === 'ACTIVE' || round.status === 'DRAFT');
  const dealCandidateIds = new Set(investor.pipeline.deals.map((deal) => deal.candidateId).filter(Boolean));
  const committed = investor.pipeline.deals.filter((deal) =>
    ['TERM_SHEET','COMMITTED','CLOSED'].includes(deal.stageName)
  ).length;

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Investor workspace</h2>
        <p className="muted">
          Fundraising assumptions, external investor research and canonical CRM workflow stay explicitly separated.
          CRM confirmation proves identity linkage only; it does not prove investor interest or commitment.
        </p>
      </div>
      <span className="status">OWNER GOVERNED</span>
    </div>

    <div className="grid">
      <div className="card"><div className="muted">Fundraising rounds</div><div className="value">{investor.rounds.length}</div></div>
      <div className="card"><div className="muted">External research</div><div className="value">{external.length}</div></div>
      <div className="card"><div className="muted">CRM confirmed</div><div className="value">{confirmed.length}</div></div>
      <div className="card"><div className="muted">Investor pipeline deals</div><div className="value">{investor.pipeline.deals.length}</div></div>
      <div className="card"><div className="muted">Term sheet / committed / closed</div><div className="value">{committed}</div></div>
    </div>

    <div className="settingsList">
      {investor.rounds.map((round) => <div className="settingsRow" key={round.id}>
        <div>
          <strong>{round.name} · {round.status}</strong>
          <span className="muted smallText">
            {round.instrument} · target {money(round.currency, round.targetRaise)}
            {' · '}pre-money assumption {money(round.currency, round.preMoneyValuationAssumption)}
            {' · '}valuation cap assumption {money(round.currency, round.valuationCapAssumption)}
          </span>
          <span className="muted smallText">
            Target runway assumption {round.targetRunwayMonthsAssumption ?? '—'} months
            {' · '}discount assumption {round.discountBpsAssumption == null ? '—' : `${round.discountBpsAssumption / 100}%`}
            {' · '}Source: {round.assumptionSourceRef}
          </span>
        </div>
        <details>
          <summary>Edit round</summary>
          <form action={saveFounderFundraisingRound} className="settingsGrid">
            <input type="hidden" name="id" value={round.id}/>
            <input type="hidden" name="version" value={round.version}/>
            <label>Name<input name="name" defaultValue={round.name} maxLength={160} required /></label>
            <label>Status<select name="status" defaultValue={round.status}>
              {['DRAFT','ACTIVE','PAUSED','CLOSED','CANCELED'].map((value) => <option key={value}>{value}</option>)}
            </select></label>
            <label>Instrument<select name="instrument" defaultValue={round.instrument}>
              {['EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER'].map((value) => <option key={value}>{value}</option>)}
            </select></label>
            <label>Currency<input name="currency" defaultValue={round.currency} maxLength={3} required /></label>
            <label>Target raise<input type="number" min="0.01" step="0.01" name="target_raise" defaultValue={round.targetRaise} required /></label>
            <label>Pre-money assumption<input type="number" min="0" step="0.01" name="pre_money_valuation_assumption" defaultValue={round.preMoneyValuationAssumption ?? ''}/></label>
            <label>Valuation cap assumption<input type="number" min="0" step="0.01" name="valuation_cap_assumption" defaultValue={round.valuationCapAssumption ?? ''}/></label>
            <label>Discount % assumption<input type="number" min="0" max="100" step="0.01" name="discount_pct_assumption" defaultValue={round.discountBpsAssumption == null ? '' : round.discountBpsAssumption / 100}/></label>
            <label>Target runway months<input type="number" min="0" step="0.1" name="target_runway_months_assumption" defaultValue={round.targetRunwayMonthsAssumption ?? ''}/></label>
            <label>Product %<input type="number" min="0" max="100" step="0.01" name="use_product_pct" defaultValue={allocation(round,'product')}/></label>
            <label>Go-to-market %<input type="number" min="0" max="100" step="0.01" name="use_gtm_pct" defaultValue={allocation(round,'goToMarket')}/></label>
            <label>Operations %<input type="number" min="0" max="100" step="0.01" name="use_operations_pct" defaultValue={allocation(round,'operations')}/></label>
            <label>Other %<input type="number" min="0" max="100" step="0.01" name="use_other_pct" defaultValue={allocation(round,'other')}/></label>
            <label className="wideField">Assumption source reference<input name="assumption_source_ref" defaultValue={round.assumptionSourceRef} maxLength={512} required /></label>
            <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000} defaultValue={round.notes ?? ''}/></label>
            <button>Save round</button>
          </form>
        </details>
      </div>)}
    </div>

    <details className="promptEditor">
      <summary>Create fundraising round</summary>
      <form action={saveFounderFundraisingRound} className="settingsGrid">
        <label>Name<input name="name" placeholder="Seed 2027" maxLength={160} required /></label>
        <label>Status<select name="status" defaultValue="DRAFT">{['DRAFT','ACTIVE','PAUSED'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Instrument<select name="instrument" defaultValue="EQUITY">{['EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Currency<input name="currency" defaultValue="USD" maxLength={3} required /></label>
        <label>Target raise<input type="number" min="0.01" step="0.01" name="target_raise" required /></label>
        <label>Pre-money assumption<input type="number" min="0" step="0.01" name="pre_money_valuation_assumption"/></label>
        <label>Valuation cap assumption<input type="number" min="0" step="0.01" name="valuation_cap_assumption"/></label>
        <label>Discount % assumption<input type="number" min="0" max="100" step="0.01" name="discount_pct_assumption"/></label>
        <label>Target runway months<input type="number" min="0" step="0.1" name="target_runway_months_assumption"/></label>
        <label>Product %<input type="number" min="0" max="100" step="0.01" name="use_product_pct" defaultValue="0"/></label>
        <label>Go-to-market %<input type="number" min="0" max="100" step="0.01" name="use_gtm_pct" defaultValue="0"/></label>
        <label>Operations %<input type="number" min="0" max="100" step="0.01" name="use_operations_pct" defaultValue="0"/></label>
        <label>Other %<input type="number" min="0" max="100" step="0.01" name="use_other_pct" defaultValue="0"/></label>
        <label className="wideField">Assumption source reference<input name="assumption_source_ref" placeholder="Founder plan / board model / financing memo" maxLength={512} required /></label>
        <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label>
        <button>Create round</button>
      </form>
    </details>

    <div className="headerRow">
      <div>
        <h3>Canonical fundraising pipeline</h3>
        <p className="muted smallText">
          Uses the existing CRM Deal authority with FUNDRAISING purpose. It is excluded from Sales forecast and sales unit economics.
        </p>
      </div>
      <span className="status">{investor.pipeline.id ? `${investor.pipeline.status} · ${investor.pipeline.stages.length} stages` : 'NOT CREATED'}</span>
    </div>
    {!investor.pipeline.id ? <form action={ensureFounderFundraisingPipeline}>
      <input type="hidden" name="name" value="Investor Fundraising"/>
      <button>Create canonical fundraising pipeline</button>
    </form> : null}

    <div className="settingsList">
      {investor.pipeline.deals.map((deal) => <div className="settingsRow" key={deal.id}>
        <div>
          <strong>{deal.businessName} · {deal.stageName}</strong>
          <span className="muted smallText">
            {money(deal.currency, deal.amount)} · expected close {deal.expectedCloseAt ? new Date(deal.expectedCloseAt).toLocaleDateString() : '—'}
            {' · '}state {deal.state}
          </span>
        </div>
        {deal.state === 'OPEN' ? <details>
          <summary>Move stage</summary>
          <form action={moveFounderInvestorDealStage} className="settingsGrid">
            <input type="hidden" name="deal_id" value={deal.id}/>
            <input type="hidden" name="version" value={deal.version}/>
            <label>Stage<select name="stage_id" defaultValue={deal.stageId}>
              {investor.pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select></label>
            <label>Amount<input type="number" min="0" step="0.01" name="amount" defaultValue={deal.amount ?? ''}/></label>
            <label>Currency<input name="currency" maxLength={3} defaultValue={deal.currency ?? activeRounds[0]?.currency ?? 'USD'}/></label>
            <label>Expected close date<input type="date" name="expected_close_date" defaultValue={deal.expectedCloseAt?.slice(0,10) ?? ''}/></label>
            <label>Terminal evidence type<select name="close_source_type" defaultValue="OPERATOR_CONFIRMED">
              {['OPERATOR_CONFIRMED','CONTRACT','PAYMENT','OTHER'].map((v)=><option key={v}>{v}</option>)}
            </select></label>
            <label className="wideField">Terminal evidence reference<input name="close_source_ref" maxLength={512} placeholder="Required only for CLOSED/PASSED"/></label>
            <label className="wideField">Passed reason<input name="lost_reason" maxLength={2000} placeholder="Required only for PASSED"/></label>
            <button>Move deal</button>
          </form>
        </details> : <span className="status">{deal.state}</span>}
      </div>)}
    </div>

    <div className="headerRow">
      <div>
        <h3>Investor research</h3>
        <p className="muted smallText">External discovery stays external until OWNER confirmation links it to an existing canonical CRM business/person.</p>
      </div>
    </div>
    <div className="settingsList">
      {investor.candidates.map((candidate) => {
        const hasDeal = dealCandidateIds.has(candidate.id);
        return <div className="settingsRow" key={candidate.id}>
          <div>
            <strong>{candidate.fundName}{candidate.personName ? ` · ${candidate.personName}` : ''}</strong>
            <span className="muted smallText">
              {candidate.geography ?? '—'} · {candidate.stageFit ?? '—'} · ticket {money(candidate.currency, candidate.ticketMin)}–{money(candidate.currency, candidate.ticketMax)}
            </span>
            <span className="muted smallText">
              <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source</a>
              {' · '}verified {new Date(candidate.lastVerifiedAt).toLocaleDateString()}
              {' · '}{candidate.recordState}
            </span>
          </div>
          <div>
            {candidate.recordState === 'DISCOVERED_EXTERNAL' && investor.crmOptions.businesses.length ? <details>
              <summary>Confirm existing CRM identity</summary>
              <form action={confirmFounderInvestorCandidateToCrm} className="settingsGrid">
                <input type="hidden" name="candidate_id" value={candidate.id}/>
                <input type="hidden" name="version" value={candidate.version}/>
                <label>CRM business<select name="business_id" required>
                  <option value="">Select business</option>
                  {investor.crmOptions.businesses.map((business) => <option key={business.id} value={business.id}>
                    {business.name} · {business.countryCode}{business.city ? ` · ${business.city}` : ''}
                  </option>)}
                </select></label>
                <label>CRM person (optional)<select name="person_id">
                  <option value="">Company only</option>
                  {investor.crmOptions.people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                </select></label>
                <button>Confirm CRM link</button>
              </form>
            </details> : null}
            {candidate.recordState === 'CRM_CONFIRMED' && !hasDeal && activeRounds.length ? <details>
              <summary>Add to fundraising pipeline</summary>
              <form action={createFounderInvestorPipelineEntry} className="settingsGrid">
                <input type="hidden" name="candidate_id" value={candidate.id}/>
                <label>Fundraising round<select name="round_id" required>
                  {activeRounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {round.status}</option>)}
                </select></label>
                <input type="hidden" name="round_currency" value={activeRounds[0]?.currency ?? 'USD'}/>
                <label>Potential amount<input type="number" min="0" step="0.01" name="amount"/></label>
                <label>Currency<input name="currency" maxLength={3} defaultValue={activeRounds[0]?.currency ?? 'USD'}/></label>
                <label>Expected close date<input type="date" name="expected_close_date"/></label>
                <button>Add investor deal</button>
              </form>
            </details> : null}
            {hasDeal ? <span className="status">IN PIPELINE</span> : null}
          </div>
        </div>;
      })}
    </div>

    <details className="promptEditor">
      <summary>Record external investor research</summary>
      <form action={recordFounderInvestorResearchCandidate} className="settingsGrid">
        <label>Fund<input name="fund_name" maxLength={240} required /></label>
        <label>Person<input name="person_name" maxLength={200}/></label>
        <label>Geography<input name="geography" maxLength={160}/></label>
        <label>Stage fit<input name="stage_fit" maxLength={160} placeholder="Pre-seed / Seed / Series A"/></label>
        <label>Ticket min<input type="number" min="0" step="0.01" name="ticket_min"/></label>
        <label>Ticket max<input type="number" min="0" step="0.01" name="ticket_max"/></label>
        <label>Currency<input name="currency" maxLength={3} defaultValue="USD"/></label>
        <label>AI / SaaS fit<select name="ai_saas_fit" defaultValue="UNKNOWN"><option>UNKNOWN</option><option>YES</option><option>NO</option></select></label>
        <label>MENA / GCC fit<select name="mena_gcc_fit" defaultValue="UNKNOWN"><option>UNKNOWN</option><option>YES</option><option>NO</option></select></label>
        <label className="wideField">Sector fit<input name="sector_fit" maxLength={500}/></label>
        <label className="wideField">Source URL<input type="url" name="source_url" maxLength={2048} required /></label>
        <label className="wideField">Source title<input name="source_title" maxLength={500}/></label>
        <label>Last verified date<input type="date" name="last_verified_date" required /></label>
        <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label>
        <button>Record external evidence</button>
      </form>
    </details>

    <p className="muted smallText">
      No investor interest, commitment, valuation or fundraising probability is inferred from research or CRM stage. Cap table, dilution, term sheets and diligence live in the governed Capital workspace below.
    </p>
  </section>;
}

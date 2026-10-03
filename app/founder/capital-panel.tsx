import type { FounderCapitalWorkspaceV1 } from '@/lib/founder/capital';
import type { FounderInvestorWorkspaceV1 } from '@/lib/founder/investor';
import {
  archiveFounderCapTableEntry,
  archiveFounderDilutionScenario,
  saveFounderCapTableEntry,
  saveFounderDilutionScenario,
  saveFounderDueDiligenceItem,
  saveFounderTermSheet,
} from './capital-actions';

function pct(value: number | null) {
  return value == null ? '—' : `${(value / 100).toFixed(2)}%`;
}
function money(currency: string | null, value: number | null) {
  return currency && value != null ? `${currency} ${value.toLocaleString(undefined,{maximumFractionDigits:2})}` : '—';
}
function tri(value: boolean | null) {
  return value == null ? 'UNKNOWN' : value ? 'YES' : 'NO';
}

export function FounderCapitalPanel({
  capital,
  investor,
}: {
  capital: FounderCapitalWorkspaceV1;
  investor: FounderInvestorWorkspaceV1;
}) {
  const activeRounds=investor.rounds.filter((round)=>round.status==='ACTIVE'||round.status==='DRAFT');
  const confirmedCandidates=investor.candidates.filter((candidate)=>candidate.recordState==='CRM_CONFIRMED');

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Capital, terms & diligence</h2>
        <p className="muted">
          Cap-table records are OWNER-confirmed evidence. Dilution is scenario math. Term sheets are recorded terms;
          diligence is checklist coverage. None of this is inferred from CRM stage or model memory.
        </p>
      </div>
      <span className="status">OWNER GOVERNED</span>
    </div>

    <div className="grid">
      <div className="card"><div className="muted">Active cap rows</div><div className="value">{capital.capEntries.filter((x)=>x.status==='ACTIVE').length}</div></div>
      <div className="card"><div className="muted">Fully diluted units</div><div className="value">{capital.capTable.totalFullyDilutedUnits.toLocaleString()}</div></div>
      <div className="card"><div className="muted">Dilution scenarios</div><div className="value">{capital.dilutionScenarios.filter((x)=>x.scenario.status==='ACTIVE').length}</div></div>
      <div className="card"><div className="muted">Term sheets</div><div className="value">{capital.termSheets.length}</div></div>
      <div className="card"><div className="muted">Diligence coverage</div><div className="value">{pct(capital.diligenceCoverage.coverageBps)}</div></div>
    </div>

    <h3>Cap table</h3>
    <div className="tableWrap">
      <table className="dataTable">
        <thead><tr><th>Holder</th><th>Type</th><th>Security</th><th>Units</th><th>Ownership</th><th>State</th><th>Action</th></tr></thead>
        <tbody>{capital.capEntries.map((entry)=>{
          const derived=capital.capTable.holders.find((holder)=>holder.id===entry.id);
          return <tr key={entry.id}>
            <td><strong>{entry.holderName}</strong><br/><span className="muted smallText">{entry.shareClass??'—'}</span></td>
            <td>{entry.holderType}</td><td>{entry.securityType}</td>
            <td>{(entry.issuedUnits+entry.reservedUnits).toLocaleString()}</td>
            <td>{entry.status==='ACTIVE'?pct(derived?.ownershipBps??null):'—'}</td><td>{entry.status}</td>
            <td>{entry.status==='ACTIVE'?<form action={archiveFounderCapTableEntry}>
              <input type="hidden" name="id" value={entry.id}/><input type="hidden" name="version" value={entry.version}/><button>Archive</button>
            </form>:null}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <details className="promptEditor"><summary>Add cap-table evidence</summary>
      <form action={saveFounderCapTableEntry} className="settingsGrid">
        <label>Holder type<select name="holder_type" defaultValue="FOUNDER">{['FOUNDER','EMPLOYEE','INVESTOR','OPTION_POOL','OTHER'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Holder name<input name="holder_name" maxLength={240} required/></label>
        <label>Security<select name="security_type" defaultValue="COMMON">{['COMMON','PREFERRED','OPTION_POOL','OTHER'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Share class<input name="share_class" maxLength={80}/></label>
        <label>Issued units<input name="issued_units" type="number" min="0" step="0.00000001" defaultValue="0" required/></label>
        <label>Reserved units<input name="reserved_units" type="number" min="0" step="0.00000001" defaultValue="0" required/></label>
        <label>CRM person<select name="person_id"><option value="">No link</option>{investor.crmOptions.people.map((p)=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
        <label>CRM business<select name="business_id"><option value="">No link</option>{investor.crmOptions.businesses.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label>
        <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label>
        <button>Add cap-table row</button>
      </form>
    </details>

    <h3>Dilution scenarios</h3>
    <div className="settingsList">{capital.dilutionScenarios.map(({scenario,result})=><div className="settingsRow" key={scenario.id}>
      <div><strong>{scenario.name} · {scenario.status}</strong>
        <span className="muted smallText">Pre-money {money(scenario.currency,scenario.preMoneyValuationAssumption)} · new money {money(scenario.currency,scenario.newMoneyAmountAssumption)} · pool top-up {scenario.optionPoolTopUpUnitsAssumption.toLocaleString()} units</span>
        <span className="muted smallText">New investor {pct(result.newInvestorOwnershipBps)} · existing after {pct(result.existingOwnershipAfterBps)} · pool top-up {pct(result.optionPoolTopUpOwnershipBps)} · price/unit {result.pricePerUnit??'—'}</span>
      </div>
      {scenario.status==='ACTIVE'?<form action={archiveFounderDilutionScenario}><input type="hidden" name="id" value={scenario.id}/><input type="hidden" name="version" value={scenario.version}/><button>Archive</button></form>:null}
    </div>)}</div>
    <details className="promptEditor"><summary>Create dilution scenario</summary>
      <form action={saveFounderDilutionScenario} className="settingsGrid">
        <label>Round<select name="fundraising_round_id" required><option value="">Select round</option>{activeRounds.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Name<input name="name" maxLength={160} required/></label>
        <label>Currency<input name="currency" maxLength={3} defaultValue={activeRounds[0]?.currency??'USD'} required/></label>
        <label>Pre-money valuation<input name="pre_money_valuation_assumption" type="number" min="0.01" step="0.01" required/></label>
        <label>New money<input name="new_money_amount_assumption" type="number" min="0.01" step="0.01" required/></label>
        <label>Option-pool top-up units<input name="option_pool_top_up_units_assumption" type="number" min="0" step="0.00000001" defaultValue="0" required/></label>
        <label className="wideField">Assumption source reference<input name="assumption_source_ref" maxLength={512} required/></label>
        <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label>
        <button>Create scenario</button>
      </form>
    </details>

    <h3>Term sheet comparison</h3>
    <div className="tableWrap"><table className="dataTable"><thead><tr><th>Counterparty</th><th>Status</th><th>Instrument</th><th>Investment</th><th>Pre-money / cap</th><th>Headline ownership</th><th>Rights</th></tr></thead>
      <tbody>{capital.termComparison.map((term)=><tr key={term.id}>
        <td><strong>{term.counterpartyName}</strong><br/><span className="muted smallText">{term.label}</span></td><td>{term.status}</td><td>{term.instrument}</td>
        <td>{money(term.currency,term.investmentAmount)}</td><td>{term.preMoneyValuation!=null?money(term.currency,term.preMoneyValuation):money(term.currency,term.valuationCap)}</td>
        <td>{pct(term.headlineNewInvestorOwnershipBps)}<br/><span className="muted smallText">{term.comparisonBoundary}</span></td>
        <td>LP {term.liquidationPreferenceMultiple??'—'}x · board {tri(term.boardSeatRights)} · pro-rata {tri(term.proRataRights)}</td>
      </tr>)}</tbody>
    </table></div>
    <details className="promptEditor"><summary>Record term sheet</summary>
      <form action={saveFounderTermSheet} className="settingsGrid">
        <label>Round<select name="fundraising_round_id" required><option value="">Select round</option>{activeRounds.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Confirmed investor<select name="investor_candidate_id"><option value="">No candidate link</option>{confirmedCandidates.map((c)=><option key={c.id} value={c.id}>{c.fundName}</option>)}</select></label>
        <label>Fundraising deal<select name="crm_deal_id"><option value="">No deal link</option>{investor.pipeline.deals.map((d)=><option key={d.id} value={d.id}>{d.businessName} · {d.stageName}</option>)}</select></label>
        <label>Counterparty<input name="counterparty_name" maxLength={240} required/></label><label>Label<input name="label" maxLength={160} required/></label>
        <label>Status<select name="status" defaultValue="RECEIVED">{['DRAFT','RECEIVED','COUNTERED','ACCEPTED','DECLINED','WITHDRAWN'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Instrument<select name="instrument" defaultValue="EQUITY">{['EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Currency<input name="currency" maxLength={3} defaultValue={activeRounds[0]?.currency??'USD'} required/></label><label>Investment amount<input name="investment_amount" type="number" min="0.01" step="0.01" required/></label>
        <label>Pre-money<input name="pre_money_valuation" type="number" min="0.01" step="0.01"/></label><label>Valuation cap<input name="valuation_cap" type="number" min="0.01" step="0.01"/></label>
        <label>Discount %<input name="discount_pct" type="number" min="0" max="100" step="0.01"/></label><label>Interest %<input name="interest_rate_pct" type="number" min="0" max="100" step="0.01"/></label>
        <label>Maturity months<input name="maturity_months" type="number" min="1" max="120"/></label><label>Liquidation preference x<input name="liquidation_preference_multiple" type="number" min="0.01" max="10" step="0.01"/></label>
        {['participating_preferred','board_seat_rights','pro_rata_rights','information_rights'].map((name)=><label key={name}>{name.replaceAll('_',' ')}<select name={name} defaultValue="UNKNOWN">{['UNKNOWN','YES','NO'].map((v)=><option key={v}>{v}</option>)}</select></label>)}
        <label>Exclusivity days<input name="exclusivity_days" type="number" min="0" max="365"/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label>
        <label className="wideField">Notes<textarea name="notes" rows={3} maxLength={6000}/></label><button>Record term sheet</button>
      </form>
    </details>

    <h3>Data room & due diligence</h3>
    <div className="settingsList">{capital.diligenceItems.map((item)=><div className="settingsRow" key={item.id}><div><strong>{item.category} · {item.title}</strong><span className="muted smallText">{item.status} · {item.sensitivity}{item.lastVerifiedAt?` · verified ${new Date(item.lastVerifiedAt).toLocaleDateString()}`:''}</span></div></div>)}</div>
    <details className="promptEditor"><summary>Add diligence item</summary>
      <form action={saveFounderDueDiligenceItem} className="settingsGrid">
        <label>Round<select name="fundraising_round_id"><option value="">Company-wide</option>{investor.rounds.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Category<select name="category" defaultValue="CORPORATE">{['CORPORATE','FINANCE','LEGAL','IP','SECURITY','PRODUCT','COMMERCIAL','HR','TAX','OTHER'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Title<input name="title" maxLength={240} required/></label><label>Status<select name="status" defaultValue="MISSING">{['MISSING','REQUESTED','READY','SHARED','NOT_APPLICABLE'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label>Sensitivity<select name="sensitivity" defaultValue="CONFIDENTIAL">{['INTERNAL','CONFIDENTIAL','RESTRICTED'].map((v)=><option key={v}>{v}</option>)}</select></label>
        <label className="wideField">Evidence reference<input name="evidence_ref" maxLength={1024} placeholder="Required for READY/SHARED"/></label>
        <label>Last verified<input name="last_verified_date" type="date"/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Add diligence item</button>
      </form>
    </details>

    <p className="muted smallText">Accepted terms do not equal received funds. SHARED diligence does not prove investor review or approval. Ownership changes stay scenarios until confirmed cap-table evidence is recorded.</p>
  </section>;
}

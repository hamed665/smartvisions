import type { FounderStrategyWorkspaceV1 } from '@/lib/founder/strategy';
import { saveFounderBoardReport,saveFounderKeyResult,saveFounderMarketResearchItem,saveFounderStrategicGoal } from './strategy-actions';
function today(){return new Date().toISOString().slice(0,10);}
export function FounderStrategyPanel({strategy}:{strategy:FounderStrategyWorkspaceV1}){
 const active=strategy.goals.filter(g=>g.status==='ACTIVE');
 return <section className="panel">
  <div className="headerRow"><div><h2>Founder Command Center</h2><p className="muted">OWNER-governed strategy, OKRs, sourced market intelligence and board reporting. Statuses are explicit evidence, not AI guesses.</p></div><span className="status">OWNER GOVERNED</span></div>
  <div className="grid">
   <div className="card"><div className="muted">Active goals</div><div className="value">{strategy.commandCenter.activeGoals}</div></div>
   <div className="card"><div className="muted">Active key results</div><div className="value">{strategy.commandCenter.activeKeyResults}</div></div>
   <div className="card"><div className="muted">At-risk KRs</div><div className="value">{strategy.commandCenter.atRiskKeyResults}</div></div>
   <div className="card"><div className="muted">Current research</div><div className="value">{strategy.commandCenter.currentResearchItems}</div></div>
  </div>
  <h3>Strategic goals</h3><div className="settingsList">{strategy.goals.map(g=><div className="settingsRow" key={g.id}><div><strong>{g.category} · {g.title}</strong><span className="muted smallText">{g.status} · {g.horizon}{g.endDate?` · ends ${g.endDate}`:''}</span>{g.description?<span className="smallText">{g.description}</span>:null}</div></div>)}</div>
  <details className="promptEditor"><summary>Add strategic goal</summary><form action={saveFounderStrategicGoal} className="settingsGrid">
   <label>Status<select name="status" defaultValue="ACTIVE">{['DRAFT','ACTIVE','COMPLETED','CANCELED'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Category<select name="category" defaultValue="GROWTH">{['GROWTH','PRODUCT','REVENUE','CUSTOMER','OPERATIONS','FUNDRAISING','TEAM','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Horizon<select name="horizon" defaultValue="QUARTER">{['QUARTER','YEAR','MULTI_YEAR','CUSTOM'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Title<input name="title" maxLength={240} required/></label><label>Start<input type="date" name="start_date"/></label><label>End<input type="date" name="end_date"/></label>
   <label className="wideField">Description<textarea name="description" rows={2} maxLength={6000}/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label>
   <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Save goal</button>
  </form></details>
  <h3>Key results</h3><div className="settingsList">{strategy.keyResults.map(k=><div className="settingsRow" key={k.id}><div><strong>{k.metricName}</strong><span className="muted smallText">{k.status} · current {k.currentValue??'—'} {k.unit??''} · target {k.targetValue??'—'} {k.unit??''}</span></div></div>)}</div>
  <details className="promptEditor"><summary>Add key result</summary><form action={saveFounderKeyResult} className="settingsGrid">
   <label>Goal<select name="goal_id" required><option value="">Select goal</option>{active.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
   <label>Status<select name="status" defaultValue="NOT_STARTED">{['NOT_STARTED','ON_TRACK','AT_RISK','ACHIEVED','CANCELED'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Metric<input name="metric_name" maxLength={240} required/></label><label>Unit<input name="unit" maxLength={80}/></label>
   <label>Direction<select name="direction" defaultValue="INCREASE">{['INCREASE','DECREASE','MAINTAIN','QUALITATIVE'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Baseline<input name="baseline_value" type="number" step="any"/></label><label>Target<input name="target_value" type="number" step="any"/></label><label>Current<input name="current_value" type="number" step="any"/></label><label>Due<input name="due_date" type="date"/></label>
   <label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Save key result</button>
  </form></details>
  <h3>Persistent market research</h3><div className="settingsList">{strategy.marketResearch.filter(x=>x.status!=='ARCHIVED').map(x=><div className="settingsRow" key={x.id}><div><strong>{x.researchType} · {x.title}</strong><span className="smallText">{x.claim}</span><span className="muted smallText">{x.status} · verified {x.lastVerifiedAt.slice(0,10)} · <a href={x.sourceUrl} target="_blank" rel="noreferrer">source</a></span></div></div>)}</div>
  <details className="promptEditor"><summary>Record sourced market evidence</summary><form action={saveFounderMarketResearchItem} className="settingsGrid">
   <label>Status<select name="status" defaultValue="CURRENT">{['CURRENT','STALE','ARCHIVED'].map(v=><option key={v}>{v}</option>)}</select></label><label>Type<select name="research_type" defaultValue="COMPETITOR">{['MARKET_SIZE','COMPETITOR','PRICING','REGULATION','TREND','INVESTOR','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Title<input name="title" maxLength={300} required/></label><label>Geography<input name="geography" maxLength={200}/></label><label>Segment<input name="segment" maxLength={240}/></label><label>Source title<input name="source_title" maxLength={500}/></label>
   <label className="wideField">Claim<textarea name="claim" rows={3} maxLength={4000} required/></label><label className="wideField">Source URL<input name="source_url" type="url" maxLength={2048} required/></label>
   <label>Observed<input name="observed_date" type="date" defaultValue={today()} required/></label><label>Last verified<input name="last_verified_date" type="date" defaultValue={today()} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Record research</button>
  </form></details>
  <h3>Board reports</h3><div className="settingsList">{strategy.boardReports.map(x=><div className="settingsRow" key={x.id}><div><strong>{x.title}</strong><span className="muted smallText">{x.status} · {x.periodStart} → {x.periodEnd}</span><span className="smallText">{x.executiveSummary}</span></div></div>)}</div>
  <details className="promptEditor"><summary>Create board report</summary><form action={saveFounderBoardReport} className="settingsGrid">
   <label>Status<select name="status" defaultValue="DRAFT">{['DRAFT','PUBLISHED','ARCHIVED'].map(v=><option key={v}>{v}</option>)}</select></label><label>Title<input name="title" maxLength={240} required/></label><label>Period start<input name="period_start" type="date" required/></label><label>Period end<input name="period_end" type="date" required/></label>
   <label className="wideField">Executive summary<textarea name="executive_summary" rows={5} maxLength={12000} required/></label><label className="wideField">Decisions needed · one per line<textarea name="decisions_needed" rows={3}/></label><label className="wideField">Risks · one per line<textarea name="risks" rows={3}/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label><button>Save board report</button>
  </form></details>
 </section>;
}

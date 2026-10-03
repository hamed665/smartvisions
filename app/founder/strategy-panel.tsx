import type { FounderStrategyWorkspaceV1 } from '@/lib/founder/strategy';
import { saveFounderBoardReport,saveFounderKeyResult,saveFounderMarketResearchItem,saveFounderStrategicGoal } from './strategy-actions';

const GOAL_STATUS=['DRAFT','ACTIVE','COMPLETED','CANCELED'] as const;
const GOAL_CATEGORY=['GROWTH','PRODUCT','REVENUE','CUSTOMER','OPERATIONS','FUNDRAISING','TEAM','OTHER'] as const;
const HORIZON=['QUARTER','YEAR','MULTI_YEAR','CUSTOM'] as const;
const KR_STATUS=['NOT_STARTED','ON_TRACK','AT_RISK','ACHIEVED','CANCELED'] as const;
const DIRECTIONS=['INCREASE','DECREASE','MAINTAIN','QUALITATIVE'] as const;
const RESEARCH_STATUS=['CURRENT','STALE','ARCHIVED'] as const;
const RESEARCH_TYPE=['MARKET_SIZE','COMPETITOR','PRICING','REGULATION','TREND','INVESTOR','OTHER'] as const;
const BOARD_STATUS=['DRAFT','PUBLISHED','ARCHIVED'] as const;
function today(){return new Date().toISOString().slice(0,10);}
function day(v:string|null){return v?.slice(0,10)??'';}
function lines(v:string[]){return v.join('\n');}

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

  <h3>Strategic goals</h3>
  <div className="settingsList">{strategy.goals.map(g=><details className="promptEditor" key={g.id}><summary>{g.category} · {g.title} · {g.status}</summary>
   <form action={saveFounderStrategicGoal} className="settingsGrid">
    <input type="hidden" name="id" value={g.id}/><input type="hidden" name="version" value={g.version}/>
    <label>Status<select name="status" defaultValue={g.status}>{GOAL_STATUS.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Category<select name="category" defaultValue={g.category}>{GOAL_CATEGORY.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Horizon<select name="horizon" defaultValue={g.horizon}>{HORIZON.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Title<input name="title" maxLength={240} defaultValue={g.title} required/></label>
    <label>Start<input type="date" name="start_date" defaultValue={day(g.startDate)}/></label><label>End<input type="date" name="end_date" defaultValue={day(g.endDate)}/></label>
    <label className="wideField">Description<textarea name="description" rows={2} maxLength={6000} defaultValue={g.description??''}/></label>
    <label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} defaultValue={g.sourceRef} required/></label>
    <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000} defaultValue={g.notes??''}/></label><button>Save goal</button>
   </form>
  </details>)}</div>
  <details className="promptEditor"><summary>Add strategic goal</summary><form action={saveFounderStrategicGoal} className="settingsGrid">
   <label>Status<select name="status" defaultValue="ACTIVE">{GOAL_STATUS.map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Category<select name="category" defaultValue="GROWTH">{GOAL_CATEGORY.map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Horizon<select name="horizon" defaultValue="QUARTER">{HORIZON.map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Title<input name="title" maxLength={240} required/></label><label>Start<input type="date" name="start_date"/></label><label>End<input type="date" name="end_date"/></label>
   <label className="wideField">Description<textarea name="description" rows={2} maxLength={6000}/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label>
   <label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Add goal</button>
  </form></details>

  <h3>Key results</h3>
  <div className="settingsList">{strategy.keyResults.map(k=><details className="promptEditor" key={k.id}><summary>{k.metricName} · {k.status} · {k.currentValue??'—'} / {k.targetValue??'—'} {k.unit??''}</summary>
   <form action={saveFounderKeyResult} className="settingsGrid">
    <input type="hidden" name="id" value={k.id}/><input type="hidden" name="version" value={k.version}/>
    <label>Goal<select name="goal_id" defaultValue={k.goalId} required>{strategy.goals.filter(g=>g.status!=='CANCELED').map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={k.status}>{KR_STATUS.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Metric<input name="metric_name" maxLength={240} defaultValue={k.metricName} required/></label><label>Unit<input name="unit" maxLength={80} defaultValue={k.unit??''}/></label>
    <label>Direction<select name="direction" defaultValue={k.direction}>{DIRECTIONS.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Baseline<input name="baseline_value" type="number" step="any" defaultValue={k.baselineValue??''}/></label><label>Target<input name="target_value" type="number" step="any" defaultValue={k.targetValue??''}/></label>
    <label>Current<input name="current_value" type="number" step="any" defaultValue={k.currentValue??''}/></label><label>Due<input name="due_date" type="date" defaultValue={day(k.dueDate)}/></label>
    <label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} defaultValue={k.sourceRef} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000} defaultValue={k.notes??''}/></label><button>Save key result</button>
   </form>
  </details>)}</div>
  <details className="promptEditor"><summary>Add key result</summary><form action={saveFounderKeyResult} className="settingsGrid">
   <label>Goal<select name="goal_id" required><option value="">Select goal</option>{active.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
   <label>Status<select name="status" defaultValue="NOT_STARTED">{KR_STATUS.map(v=><option key={v}>{v}</option>)}</select></label><label>Metric<input name="metric_name" maxLength={240} required/></label><label>Unit<input name="unit" maxLength={80}/></label>
   <label>Direction<select name="direction" defaultValue="INCREASE">{DIRECTIONS.map(v=><option key={v}>{v}</option>)}</select></label><label>Baseline<input name="baseline_value" type="number" step="any"/></label><label>Target<input name="target_value" type="number" step="any"/></label><label>Current<input name="current_value" type="number" step="any"/></label><label>Due<input name="due_date" type="date"/></label>
   <label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Add key result</button>
  </form></details>

  <h3>Persistent market research</h3>
  <div className="settingsList">{strategy.marketResearch.map(x=><details className="promptEditor" key={x.id}><summary>{x.researchType} · {x.title} · {x.status}</summary>
   <form action={saveFounderMarketResearchItem} className="settingsGrid">
    <input type="hidden" name="id" value={x.id}/><input type="hidden" name="version" value={x.version}/>
    <label>Status<select name="status" defaultValue={x.status}>{RESEARCH_STATUS.map(v=><option key={v}>{v}</option>)}</select></label><label>Type<select name="research_type" defaultValue={x.researchType}>{RESEARCH_TYPE.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Title<input name="title" maxLength={300} defaultValue={x.title} required/></label><label>Geography<input name="geography" maxLength={200} defaultValue={x.geography??''}/></label><label>Segment<input name="segment" maxLength={240} defaultValue={x.segment??''}/></label><label>Source title<input name="source_title" maxLength={500} defaultValue={x.sourceTitle??''}/></label>
    <label className="wideField">Claim<textarea name="claim" rows={3} maxLength={4000} defaultValue={x.claim} required/></label><label className="wideField">Source URL<input name="source_url" type="url" maxLength={2048} defaultValue={x.sourceUrl} required/></label>
    <label>Observed<input name="observed_date" type="date" defaultValue={day(x.observedAt)} required/></label><label>Last verified<input name="last_verified_date" type="date" defaultValue={day(x.lastVerifiedAt)} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000} defaultValue={x.notes??''}/></label><button>Save research</button>
   </form>
  </details>)}</div>
  <details className="promptEditor"><summary>Record sourced market evidence</summary><form action={saveFounderMarketResearchItem} className="settingsGrid">
   <label>Status<select name="status" defaultValue="CURRENT">{RESEARCH_STATUS.map(v=><option key={v}>{v}</option>)}</select></label><label>Type<select name="research_type" defaultValue="COMPETITOR">{RESEARCH_TYPE.map(v=><option key={v}>{v}</option>)}</select></label><label>Title<input name="title" maxLength={300} required/></label><label>Geography<input name="geography" maxLength={200}/></label><label>Segment<input name="segment" maxLength={240}/></label><label>Source title<input name="source_title" maxLength={500}/></label>
   <label className="wideField">Claim<textarea name="claim" rows={3} maxLength={4000} required/></label><label className="wideField">Source URL<input name="source_url" type="url" maxLength={2048} required/></label><label>Observed<input name="observed_date" type="date" defaultValue={today()} required/></label><label>Last verified<input name="last_verified_date" type="date" defaultValue={today()} required/></label><label className="wideField">Notes<textarea name="notes" rows={2} maxLength={4000}/></label><button>Record research</button>
  </form></details>

  <h3>Board reports</h3>
  <div className="settingsList">{strategy.boardReports.map(x=><details className="promptEditor" key={x.id}><summary>{x.title} · {x.status} · {x.periodStart} → {x.periodEnd}</summary>
   <form action={saveFounderBoardReport} className="settingsGrid">
    <input type="hidden" name="id" value={x.id}/><input type="hidden" name="version" value={x.version}/>
    <label>Status<select name="status" defaultValue={x.status}>{BOARD_STATUS.map(v=><option key={v}>{v}</option>)}</select></label><label>Title<input name="title" maxLength={240} defaultValue={x.title} required/></label><label>Period start<input name="period_start" type="date" defaultValue={day(x.periodStart)} required/></label><label>Period end<input name="period_end" type="date" defaultValue={day(x.periodEnd)} required/></label>
    <label className="wideField">Executive summary<textarea name="executive_summary" rows={5} maxLength={12000} defaultValue={x.executiveSummary} required/></label><label className="wideField">Decisions needed · one per line<textarea name="decisions_needed" rows={3} defaultValue={lines(x.decisionsNeeded)}/></label><label className="wideField">Risks · one per line<textarea name="risks" rows={3} defaultValue={lines(x.risks)}/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} defaultValue={x.sourceRef} required/></label><button>Save board report</button>
   </form>
  </details>)}</div>
  <details className="promptEditor"><summary>Create board report</summary><form action={saveFounderBoardReport} className="settingsGrid">
   <label>Status<select name="status" defaultValue="DRAFT">{BOARD_STATUS.map(v=><option key={v}>{v}</option>)}</select></label><label>Title<input name="title" maxLength={240} required/></label><label>Period start<input name="period_start" type="date" required/></label><label>Period end<input name="period_end" type="date" required/></label><label className="wideField">Executive summary<textarea name="executive_summary" rows={5} maxLength={12000} required/></label><label className="wideField">Decisions needed · one per line<textarea name="decisions_needed" rows={3}/></label><label className="wideField">Risks · one per line<textarea name="risks" rows={3}/></label><label className="wideField">Evidence/source reference<input name="source_ref" maxLength={512} required/></label><button>Create board report</button>
  </form></details>
 </section>;
}

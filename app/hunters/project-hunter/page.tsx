import Link from 'next/link';
import { addProjectHunterOpportunity, reviewProjectHunterOpportunity } from '@/app/project-hunter-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { PROJECT_CHANNELS } from '@/lib/hunters/intent/project-hunter';

export const dynamic = 'force-dynamic';

type Row = {
  id:string;title:string|null;source_url:string|null;project_channel:string|null;budget_amount:number|null;budget_currency:string|null;
  priority:string;intent_score:number;project_fit_score:number|null;project_review_status:string|null;
  project_proposal_draft:string|null;project_evidence:unknown;scoring_reasons:unknown;detected_at:string;
};

const reviewTransitions:Record<string,string[]> = {
  REVIEW:['REJECTED'],DRAFT_READY:['APPROVED_FOR_MANUAL_SEND','REVIEW','REJECTED'],
  APPROVED_FOR_MANUAL_SEND:['SENT_MANUALLY','REVIEW','REJECTED'],
  SENT_MANUALLY:['REPLIED','LOST'],REPLIED:['WON','LOST'],
  WON:[],LOST:[],REJECTED:['REVIEW'],
};
function safeUrl(value:string|null) {
  try {const url=new URL(value ?? '');return url.protocol==='https:'?url.toString():null;}catch{return null;}
}
function stringList(value:unknown):string[]{return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];}

export default async function ProjectHunterPage() {
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data,error}=await supabase.from('intent_opportunities')
    .select('id,title,source_url,project_channel,budget_amount,budget_currency,priority,intent_score,project_fit_score,project_review_status,project_proposal_draft,project_evidence,scoring_reasons,detected_at')
    .eq('organization_id',organizationId).not('project_channel','is',null).order('detected_at',{ascending:false}).limit(100);
  if(error)throw new Error('Project Hunter not available; confirm the ordered migration is deployed');
  const rows=(data??[]) as Row[];
  const owner=role==='OWNER';
  return <main className="pageStack">
    <section className="panel">
      <div className="headerRow"><div><p className="eyebrow">Smart Visions Project Hunter</p><h1>Project Opportunities</h1></div><Link className="textLink" href="/hunters">← Hunters</Link></div>
      <p className="muted">Manual verified-source intake for the controlled MVP. Reuses canonical intent opportunities. $0 deterministic matching and draft generation. No scraping, automated platform submissions, external email, provider spending, or CRM duplication.</p>
      <div className="grid">
        <div className="card"><span className="muted">Imported</span><div className="value">{rows.length}</div></div>
        <div className="card"><span className="muted">Draft ready</span><div className="value">{rows.filter(r=>r.project_review_status==='DRAFT_READY').length}</div></div>
        <div className="card"><span className="muted">Owner approved</span><div className="value">{rows.filter(r=>r.project_review_status==='APPROVED_FOR_MANUAL_SEND').length}</div></div>
        <div className="card"><span className="muted">Manual sends recorded</span><div className="value">{rows.filter(r=>['SENT_MANUALLY','REPLIED','WON','LOST'].includes(r.project_review_status??'')).length}</div></div>
      </div>
    </section>
    <section className="panel">
      <h2>Import an actual opportunity</h2>
      <p className="muted">Copy an authentic public listing URL and its real description, or a verifiable inbound request. Links and budgets are owner-supplied evidence, not verified by the software. One real source URL is imported only once.</p>
      <form action={addProjectHunterOpportunity} className="settingsCreate">
        <label>Channel<select name="channel" defaultValue="UPWORK" disabled={!owner}>{PROJECT_CHANNELS.map(channel=><option value={channel} key={channel}>{channel}</option>)}</select></label>
        <label>Project title<input name="title" required minLength={8} maxLength={180} disabled={!owner} placeholder="E.g. Next.js developer for an existing SaaS"/></label>
        <label className="wideField">Public original listing URL<input name="sourceUrl" type="url" required placeholder="https://..." disabled={!owner}/></label>
        <label className="wideField">Actual job description<textarea name="body" rows={7} minLength={40} maxLength={8000} required disabled={!owner} placeholder="Copy the real role description and requirements"/></label>
        <label>Posted date (optional)<input name="postedAt" type="date" disabled={!owner}/></label>
        <label>Budget (optional)<input name="budgetAmount" type="number" min={0} step="0.01" disabled={!owner}/></label>
        <label>Currency<input name="budgetCurrency" defaultValue="USD" maxLength={3} disabled={!owner}/></label>
        <label>Proposals seen (optional)<input name="proposalCount" type="number" min={0} step={1} disabled={!owner}/></label>
        <label className="toggleLabel"><input name="paymentVerified" type="checkbox" disabled={!owner}/> Payment verified on source (operator-observed)</label>
        <button disabled={!owner}>Score and save safely</button>
      </form>
    </section>
    <section className="panel"><h2>Opportunity review queue</h2>
      {rows.length===0?<p className="muted">No genuine opportunities imported yet. Start with a real public listing; no sample prospects are inserted into Production.</p>:null}
      <div className="settingsList">{rows.map(row=>{
        const url=safeUrl(row.source_url), transitions=reviewTransitions[row.project_review_status??'']??[];
        const evidence=row.project_evidence&&typeof row.project_evidence==='object'?row.project_evidence as Record<string,unknown>:{};
        return <article className="settingsRow" key={row.id}>
          <div>
            <strong>{row.title??'Untitled opportunity'}</strong>
            <p className="muted">{row.project_channel} · Fit {row.project_fit_score??0}/100 · Intent {row.intent_score}/100 · {row.priority} · {row.project_review_status} · {new Date(row.detected_at).toLocaleDateString('en-GB')}</p>
            {row.budget_amount!=null?<p>Reported budget: {row.budget_amount} {row.budget_currency??'USD'}</p>:null}
            <p className="muted">Source evidence: operator-supplied / not externally verified · Reported proposals: {typeof evidence.proposalCountReported==='number'?evidence.proposalCountReported:'unknown'} · Payment: {evidence.paymentVerifiedReported?'operator reported verified':'unconfirmed'}</p>
            {url?<a className="textLink" href={url} target="_blank" rel="noopener noreferrer">Open original listing ↗</a>:null}
            {stringList(row.scoring_reasons).length?<p className="muted">{stringList(row.scoring_reasons).slice(-5).join(' · ')}</p>:null}
            {row.project_proposal_draft?<details><summary>Draft proposal (review, personalize and submit manually)</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.project_proposal_draft}</pre></details>:<p className="muted">No draft: review fit, eligibility or missing skills first.</p>}
          </div>
          <div>
            {owner&&transitions.length?<form action={reviewProjectHunterOpportunity} className="settingsCreate">
              <input type="hidden" name="id" value={row.id}/>
              <label>Next manual state<select name="status">{transitions.map(stage=><option value={stage} key={stage}>{stage}</option>)}</select></label>
              {row.project_review_status==='APPROVED_FOR_MANUAL_SEND'?<label className="toggleLabel"><input type="checkbox" name="sentConfirmation" value="I_SENT_IT_MANUALLY"/> I personally sent this proposal on the source platform</label>:null}
              <button>Update review state</button>
            </form>:null}
          </div>
        </article>;
      })}</div>
    </section>
  </main>;
}

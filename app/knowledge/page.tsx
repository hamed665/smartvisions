import {createKnowledge} from '@/app/versioned-intelligence-actions';
import {
  approveKnowledgeVersionV2,
  configureKnowledgeSourceV2,
  rejectKnowledgeVersionV2,
  stageCanonicalCatalogKnowledgeV2,
  stageKnowledgeFileV2,
  stageKnowledgeTextV2,
  stageKnowledgeWebsiteV2,
} from './actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type SourceRow={
  id:string;
  source_key:string;
  source_type:string;
  title:string;
  source_locator:string|null;
  scope_type:string;
  tenant_business_id:string|null;
  branch_id:string|null;
  sensitivity:string;
  status:string;
  refresh_policy:string;
  refresh_interval_minutes:number|null;
  last_refreshed_at:string|null;
  stale_after_at:string|null;
  last_error_code:string|null;
  version:number;
};
type VersionRow={
  id:string;
  knowledge_key:string;
  version:number;
  payload:unknown;
  active:boolean;
  approval_status:string;
  source_id:string|null;
  provenance:Record<string,unknown>;
  conflict_state:string;
  stale_after_at:string|null;
  sensitivity:string;
  scope_type:string;
  created_at:string;
};
type BusinessRow={id:string;name:string};
type BranchRow={id:string;name:string};

function textPayload(payload:unknown){
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)){
    const text=(payload as Record<string,unknown>).text;
    if(typeof text==='string')return text;
  }
  return JSON.stringify(payload,null,2);
}
function stale(at:string|null){
  return Boolean(at&&new Date(at).getTime()<Date.now());
}

export default async function KnowledgePage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const manager=['OWNER','ADMIN'].includes(String(role));

  const [versionsResult,sourcesResult,businessesResult,branchesResult]=await Promise.all([
    supabase.from('knowledge_versions')
      .select('id,knowledge_key,version,payload,active,approval_status,source_id,provenance,conflict_state,stale_after_at,sensitivity,scope_type,created_at')
      .eq('organization_id',organizationId)
      .order('knowledge_key').order('version',{ascending:false}),
    manager
      ? supabase.from('knowledge_sources')
        .select('id,source_key,source_type,title,source_locator,scope_type,tenant_business_id,branch_id,sensitivity,status,refresh_policy,refresh_interval_minutes,last_refreshed_at,stale_after_at,last_error_code,version')
        .eq('organization_id',organizationId).order('updated_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),
    manager
      ? supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name')
      : Promise.resolve({data:[],error:null}),
    manager
      ? supabase.from('branches').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name')
      : Promise.resolve({data:[],error:null}),
  ]);
  const firstError=[versionsResult,sourcesResult,businessesResult,branchesResult].map(r=>r.error).find(Boolean);
  if(firstError)throw new Error('Knowledge Base read failed: '+firstError.message);

  const rows=(versionsResult.data??[]) as VersionRow[];
  const sources=(sourcesResult.data??[]) as SourceRow[];
  const businesses=(businessesResult.data??[]) as BusinessRow[];
  const branches=(branchesResult.data??[]) as BranchRow[];
  const sourceById=new Map(sources.map(row=>[row.id,row]));
  const active=rows.filter(row=>row.active&&row.approval_status==='APPROVED');
  const pending=manager?rows.filter(row=>row.approval_status==='PENDING_REVIEW'):[];
  const websites=sources.filter(row=>row.source_type==='WEBSITE'&&row.status==='ACTIVE');
  const catalogs=sources.filter(row=>row.source_type==='CATALOG'&&row.status==='ACTIVE');
  const fileSources=sources.filter(row=>['PDF','DOC','TEXT','MANUAL','FAQ','POLICY'].includes(row.source_type)&&row.status==='ACTIVE');

  return <div>
    <div className="headerRow">
      <div>
        <h1>Knowledge Base V2</h1>
        <p className="muted">Approved, versioned knowledge with source provenance, freshness, review and scoped retrieval.</p>
      </div>
      <span className="status">{active.length} active · {pending.length} pending</span>
    </div>

    <section className="panel">
      <h2>Retrieval authority</h2>
      <p className="muted">Agents retrieve only active, approved, retrieval-enabled Knowledge. Stale externally refreshed content is excluded by default. Prices, inventory, availability and payments remain canonical in their own modules even when Catalog descriptions are derived into Knowledge.</p>
    </section>

    <section className="panel">
      <h2>Approved knowledge</h2>
      {!active.length?<p className="muted">No approved Knowledge is currently visible in your scope.</p>:<div className="settingsList">
        {active.map(row=>{
          const source=row.source_id?sourceById.get(row.source_id):undefined;
          return <div className="settingsRow" key={row.id}><div>
            <strong>{row.knowledge_key}</strong>
            <span className="muted smallText">v{row.version} · {row.scope_type} · {row.sensitivity} · {source?.source_type??String(row.provenance?.sourceType??'MANUAL')}{stale(row.stale_after_at)?' · STALE':''}</span>
            {source?.source_locator?<span className="muted smallText">{source.source_locator}</span>:null}
          </div><div className="wideField"><pre className="knowledgeText">{textPayload(row.payload)}</pre></div></div>;
        })}
      </div>}
    </section>

    {manager?<>
      <section className="panel">
        <h2>Pending review</h2>
        {!pending.length?<p className="muted">No staged changes are waiting for approval.</p>:<div className="settingsList">
          {pending.map(row=>{
            const source=row.source_id?sourceById.get(row.source_id):undefined;
            return <div className="settingsRow" key={row.id}><div>
              <strong>{row.knowledge_key} · v{row.version}</strong>
              <span className="muted smallText">{source?.title??'Unknown source'} · conflict {row.conflict_state}</span>
            </div><div className="wideField">
              <pre className="knowledgeText">{textPayload(row.payload)}</pre>
              <div className="settingsGrid">
                <form action={approveKnowledgeVersionV2}>
                  <input type="hidden" name="version_id" value={row.id}/>
                  <button>Approve & activate</button>
                </form>
                <form action={rejectKnowledgeVersionV2}>
                  <input type="hidden" name="version_id" value={row.id}/>
                  <label>Reject reason<input name="reason" required minLength={2} maxLength={500}/></label>
                  <button>Reject</button>
                </form>
              </div>
            </div></div>;
          })}
        </div>}
      </section>

      <section className="panel">
        <h2>Source registry</h2>
        {!sources.length?<p className="muted">No registered Knowledge sources yet. Existing approved legacy/manual versions remain canonical and usable.</p>:<div className="settingsList">
          {sources.map(source=><div className="settingsRow" key={source.id}><div>
            <strong>{source.title}</strong>
            <span className="muted smallText">{source.source_key} · {source.source_type} · {source.scope_type} · {source.sensitivity} · {source.status} · v{source.version}</span>
            <span className="muted smallText">Refresh: {source.refresh_policy}{source.refresh_interval_minutes?' / '+source.refresh_interval_minutes+' min':''} · {source.last_refreshed_at?'last '+new Date(source.last_refreshed_at).toISOString():'never'}{stale(source.stale_after_at)?' · STALE':''}</span>
            {source.source_locator?<span className="muted smallText">{source.source_locator}</span>:null}
            {source.last_error_code?<span className="muted smallText">Last error: {source.last_error_code}</span>:null}
          </div></div>)}
        </div>}

        <h3>Register source</h3>
        <form action={configureKnowledgeSourceV2} className="settingsGrid">
          <label>Source key<input name="source_key" placeholder="support_faq" required pattern="[a-z][a-z0-9_.-]{1,119}"/></label>
          <label>Title<input name="title" required maxLength={240}/></label>
          <label>Type<select name="source_type" defaultValue="FAQ">
            {['WEBSITE','PDF','DOC','FAQ','POLICY','MANUAL','CATALOG','TEXT'].map(value=><option key={value}>{value}</option>)}
          </select></label>
          <label>Locator / URL<input name="source_locator" maxLength={2000} placeholder="https://… or file/catalog reference"/></label>
          <label>Scope<select name="scope_type" defaultValue="ORGANIZATION">
            <option>ORGANIZATION</option><option>BUSINESS</option><option>BRANCH</option>
          </select></label>
          <label>Business<select name="tenant_business_id" defaultValue="">
            <option value="">None</option>{businesses.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label>Branch<select name="branch_id" defaultValue="">
            <option value="">None</option>{branches.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label>Sensitivity<select name="sensitivity" defaultValue="INTERNAL">
            <option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option>
          </select></label>
          <label>Status<select name="status" defaultValue="ACTIVE"><option>ACTIVE</option><option>PAUSED</option><option>RETIRED</option></select></label>
          <label>Refresh<select name="refresh_policy" defaultValue="MANUAL"><option>MANUAL</option><option>INTERVAL</option></select></label>
          <label>Interval minutes<input name="refresh_interval_minutes" type="number" min={60} max={525600}/></label>
          <button>Register source</button>
        </form>
      </section>

      <section className="panel settingsCreate">
        <h2>Ingest & stage</h2>
        <p className="muted">Website/file/catalog ingestion always stages a reviewable version. It never overwrites approved Knowledge silently.</p>

        <h3>Website</h3>
        <form action={stageKnowledgeWebsiteV2} className="settingsGrid">
          <label>Website source<select name="source_id" required defaultValue="">
            <option value="" disabled>Select source</option>{websites.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>
          <label>Knowledge key<input name="knowledge_key" required pattern="[a-z][a-z0-9_.-]{1,119}"/></label>
          <button disabled={!websites.length}>Fetch & stage</button>
        </form>

        <h3>PDF / DOCX / text file</h3>
        <form action={stageKnowledgeFileV2} className="settingsGrid">
          <label>File source<select name="source_id" required defaultValue="">
            <option value="" disabled>Select source</option>{fileSources.map(row=><option key={row.id} value={row.id}>{row.title} · {row.source_type}</option>)}
          </select></label>
          <label>Knowledge key<input name="knowledge_key" required pattern="[a-z][a-z0-9_.-]{1,119}"/></label>
          <label>File<input name="file" type="file" required accept=".pdf,.docx,.txt,.md,.html,.htm,.csv,.json"/></label>
          <button disabled={!fileSources.length}>Extract & stage</button>
        </form>

        <h3>FAQ / policy / manual text</h3>
        <form action={stageKnowledgeTextV2} className="settingsGrid">
          <label>Source<select name="source_id" required defaultValue="">
            <option value="" disabled>Select source</option>{fileSources.map(row=><option key={row.id} value={row.id}>{row.title} · {row.source_type}</option>)}
          </select></label>
          <label>Knowledge key<input name="knowledge_key" required pattern="[a-z][a-z0-9_.-]{1,119}"/></label>
          <label className="wideField">Content<textarea name="content" rows={10} required minLength={10}/></label>
          <button disabled={!fileSources.length}>Stage for review</button>
        </form>

        <h3>Canonical Catalog description snapshot</h3>
        <form action={stageCanonicalCatalogKnowledgeV2} className="settingsGrid">
          <label>Catalog source<select name="source_id" required defaultValue="">
            <option value="" disabled>Select source</option>{catalogs.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>
          <label>Knowledge key<input name="knowledge_key" defaultValue="canonical_catalog_descriptions" required/></label>
          <button disabled={!catalogs.length}>Build & stage</button>
        </form>
      </section>

      <section className="panel settingsCreate">
        <h2>Manual approved publish</h2>
        <p className="muted">This is the explicit manager-authoring path. Unlike external ingestion, publishing here is itself the approval action.</p>
        <form action={createKnowledge} className="settingsGrid">
          <label>Knowledge key<input name="knowledge_key" placeholder="company_faq" required pattern="[a-z][a-z0-9_.-]{1,119}"/></label>
          <label className="wideField">Content<textarea name="content" rows={10} required placeholder="Approved information agents are allowed to use..."/></label>
          <button>Publish approved version</button>
        </form>
      </section>
    </>:null}
  </div>;
}

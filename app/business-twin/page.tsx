import {
  deleteBusinessTwinConfigurationV1,
  publishBusinessTwinV1,
  setBusinessTwinConfigurationV1,
} from './actions';
import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';

export const dynamic='force-dynamic';

const CONFIG_KEYS=[
  ['BUSINESS_HOURS','Business hours'],
  ['CUSTOMER_POLICIES','Customer policies'],
  ['REFUND_POLICY','Refund policy'],
  ['WARRANTY_POLICY','Warranty policy'],
  ['BOOKING_RULES','Booking rules'],
  ['PAYMENT_RULES','Payment rules'],
  ['DELIVERY_RULES','Delivery rules'],
  ['BRAND_TONE','Brand tone'],
  ['LANGUAGE_PREFERENCES','Language preferences'],
  ['ESCALATION_RULES','Escalation rules'],
  ['OPERATIONAL_CONSTRAINTS','Operational constraints'],
] as const;

type JsonObject=Record<string,unknown>;
type ConfigRow={
  id:string;
  scope_type:string;
  brand_id:string|null;
  tenant_business_id:string|null;
  branch_id:string|null;
  config_key:string;
  config_value:JsonObject;
  version:number;
  updated_at:string;
};
type NamedRow={id:string;name:string};
type BranchRow={id:string;name:string;code:string};

function object(value:unknown):JsonObject{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:{};
}
function array(value:unknown){return Array.isArray(value)?value:[];}
function count(summary:JsonObject,key:string){
  const n=Number(summary[key]??0);
  return Number.isFinite(n)?n:0;
}
function pretty(value:unknown){return JSON.stringify(value,null,2);}
function targetValue(row:ConfigRow){
  if(row.scope_type==='ORGANIZATION')return 'ORGANIZATION';
  if(row.scope_type==='BRAND')return 'BRAND:'+row.brand_id;
  if(row.scope_type==='BUSINESS')return 'BUSINESS:'+row.tenant_business_id;
  if(row.scope_type==='BRANCH')return 'BRANCH:'+row.branch_id;
  return 'ORGANIZATION';
}

function targetLabel(row:ConfigRow,brands:Map<string,string>,businesses:Map<string,string>,branches:Map<string,string>){
  if(row.scope_type==='ORGANIZATION')return 'Organization';
  if(row.scope_type==='BRAND')return 'Brand · '+(brands.get(row.brand_id??'')??row.brand_id);
  if(row.scope_type==='BUSINESS')return 'Business · '+(businesses.get(row.tenant_business_id??'')??row.tenant_business_id);
  if(row.scope_type==='BRANCH')return 'Branch · '+(branches.get(row.branch_id??'')??row.branch_id);
  return row.scope_type;
}

export default async function BusinessTwinPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const service=createSupabaseServiceClient();

  const [
    liveResult,versionResult,configResult,brandResult,businessResult,branchResult,
  ]=await Promise.all([
    service.rpc('compile_business_twin_v1',{p_organization_id:organizationId}),
    supabase.from('business_twin_versions').select('id,version,source_hash,created_at,published_by_user_id')
      .eq('organization_id',organizationId).order('version',{ascending:false}).limit(20),
    supabase.from('scope_configuration_overrides')
      .select('id,scope_type,brand_id,tenant_business_id,branch_id,config_key,config_value,version,updated_at')
      .eq('organization_id',organizationId).eq('namespace','business_twin')
      .order('scope_type').order('config_key'),
    supabase.from('brands').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('branches').select('id,name,code').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
  ]);

  const live=object(liveResult.data);
  const summary=object(live.sourceSummary);
  const versions=versionResult.data??[];
  const configs=(configResult.data??[]) as ConfigRow[];
  const brands=(brandResult.data??[]) as NamedRow[];
  const businesses=(businessResult.data??[]) as NamedRow[];
  const branches=(branchResult.data??[]) as BranchRow[];
  const canManage=['OWNER','ADMIN'].includes(String(role));

  const brandNames=new Map(brands.map(x=>[x.id,x.name]));
  const businessNames=new Map(businesses.map(x=>[x.id,x.name]));
  const branchNames=new Map(branches.map(x=>[x.id,x.name+' ('+x.code+')']));
  const latest=versions[0];

  return <div>
    <div className="headerRow">
      <div>
        <h1>Business Twin</h1>
        <p className="muted">Versioned composition of canonical business truth, not another source-of-truth database.</p>
      </div>
      {latest?<span className="status">Published v{latest.version}</span>:<span className="status">Not published</span>}
    </div>

    <section className="statsGrid fourStats">
      <article><span>Businesses</span><strong>{count(summary,'businessCount')}</strong></article>
      <article><span>Branches</span><strong>{count(summary,'branchCount')}</strong></article>
      <article><span>Services / Products</span><strong>{count(summary,'serviceCount')+count(summary,'productCount')}</strong></article>
      <article><span>Twin config facts</span><strong>{count(summary,'businessTwinConfigCount')}</strong></article>
    </section>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Identity and hierarchy come from Organization/Brand/Business/Branch. Services, products, prices and warranties stay in Catalog. Booking rules stay in Booking. Payment provider state stays in Payment Core integrations. Knowledge content stays in Knowledge. Business Twin only composes those authorities and adds bounded policy/tone/hours/escalation configuration through the existing scoped configuration store.</p>
      <p className="muted smallText">Active Knowledge references: {count(summary,'activeKnowledgeReferenceCount')} · Locale profiles: {count(summary,'localeCount')} · Staff: {count(summary,'staffCount')}</p>
      {liveResult.error?<p><strong>Live compilation unavailable:</strong> {liveResult.error.message}</p>:null}
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Published versions</h2><p className="muted">Publishing is deduplicated by canonical source hash. Unchanged truth does not manufacture a new version.</p></div>
      {canManage?<form action={publishBusinessTwinV1}><button>Publish current truth</button></form>:null}</div>
      <div className="settingsList">
        {versions.map(version=><div className="settingsRow" key={version.id}><div>
          <strong>Version {version.version}</strong>
          <span className="muted smallText">{new Date(String(version.created_at)).toLocaleString()} · {String(version.source_hash)}</span>
        </div></div>)}
        {!versions.length?<p className="muted">No immutable Business Twin version has been published yet.</p>:null}
      </div>
    </section>

    <section className="panel">
      <h2>Scoped policy and operating facts</h2>
      <p className="muted">Use this only for facts that do not already have a canonical module. JSON values are structured so later AI context compilation can remain deterministic.</p>
      <div className="settingsList">
        {configs.map(row=><div className="settingsRow" key={row.id}><div>
          <strong>{row.config_key}</strong>
          <span className="muted smallText">{targetLabel(row,brandNames,businessNames,branchNames)} · v{row.version} · {new Date(row.updated_at).toLocaleString()}</span>
          <pre className="smallText">{pretty(row.config_value)}</pre>
          {canManage?<form action={setBusinessTwinConfigurationV1} className="settingsGrid">
            <input type="hidden" name="target" value={targetValue(row)}/>
            <input type="hidden" name="config_key" value={row.config_key}/>
            <input type="hidden" name="expected_version" value={row.version}/>
            <label>Update JSON<textarea name="config_value" rows={6} defaultValue={pretty(row.config_value)} required/></label>
            <button>Update</button>
          </form>:null}
        </div>{canManage?<form action={deleteBusinessTwinConfigurationV1}>
          <input type="hidden" name="configuration_id" value={row.id}/>
          <input type="hidden" name="expected_version" value={row.version}/>
          <button>Delete</button>
        </form>:null}</div>)}
        {!configs.length?<p className="muted">No Business Twin-specific policy/tone/hour override exists. Canonical source modules are still compiled normally.</p>:null}
      </div>
    </section>

    {canManage?<section className="panel">
      <h2>Add scoped Business Twin fact</h2>
      <form action={setBusinessTwinConfigurationV1} className="settingsGrid">
        <label>Target<select name="target" defaultValue="ORGANIZATION">
          <option value="ORGANIZATION">Organization</option>
          {brands.map(row=><option key={row.id} value={'BRAND:'+row.id}>Brand · {row.name}</option>)}
          {businesses.map(row=><option key={row.id} value={'BUSINESS:'+row.id}>Business · {row.name}</option>)}
          {branches.map(row=><option key={row.id} value={'BRANCH:'+row.id}>Branch · {row.name} ({row.code})</option>)}
        </select></label>
        <label>Fact type<select name="config_key">{CONFIG_KEYS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>JSON object<textarea name="config_value" rows={8} defaultValue={'{"value":"replace with approved business truth"}'} required/></label>
        <input type="hidden" name="expected_version" value=""/>
        <button>Save governed fact</button>
      </form>
    </section>:null}

    <section className="panel">
      <h2>Live compiled source preview</h2>
      <p className="muted">This is the current composition before publication. Stored secrets and Knowledge payload bodies are deliberately excluded.</p>
      <details><summary>Inspect JSON</summary><pre className="smallText">{pretty(live)}</pre></details>
    </section>
  </div>;
}

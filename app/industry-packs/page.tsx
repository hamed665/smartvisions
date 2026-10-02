import {notFound} from 'next/navigation';

import {activateIndustryPackV1,deactivateIndustryPackV1} from './actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type JsonObject=Record<string,unknown>;
type PackRow={
  pack_key:string;
  name:string;
  category:string;
  description:string;
  status:string;
};
type VersionRow={
  pack_key:string;
  version:number;
  manifest_hash:string;
  manifest:JsonObject;
};
type BusinessRow={id:string;name:string;slug:string};
type ActivationRow={
  tenant_business_id:string;
  pack_key:string;
  pack_version:number;
  active:boolean;
  version:number;
  updated_at:string;
};

function obj(value:unknown):JsonObject{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:{};
}
function arr(value:unknown){return Array.isArray(value)?value:[];}
function list(value:unknown){return arr(value).map(item=>String(item));}
function blueprintCount(manifest:JsonObject,key:string){return arr(manifest[key]).length;}

export default async function IndustryPacksPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  if(!['OWNER','ADMIN'].includes(String(role)))notFound();

  const [packsResult,versionsResult,businessResult,activationResult]=await Promise.all([
    supabase.from('industry_packs').select('pack_key,name,category,description,status')
      .eq('status','ACTIVE').order('name'),
    supabase.from('industry_pack_versions').select('pack_key,version,manifest_hash,manifest')
      .order('pack_key').order('version',{ascending:false}),
    supabase.from('tenant_businesses').select('id,name,slug')
      .eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('industry_pack_activations')
      .select('tenant_business_id,pack_key,pack_version,active,version,updated_at')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false}),
  ]);

  const packs=(packsResult.data??[]) as PackRow[];
  const versions=(versionsResult.data??[]) as VersionRow[];
  const businesses=(businessResult.data??[]) as BusinessRow[];
  const activations=(activationResult.data??[]) as ActivationRow[];
  const latestVersions=new Map<string,VersionRow>();
  for(const row of versions){
    if(!latestVersions.has(row.pack_key))latestVersions.set(row.pack_key,row);
  }
  const activationByBusiness=new Map(activations.map(row=>[row.tenant_business_id,row]));
  const packNames=new Map(packs.map(row=>[row.pack_key,row.name]));
  const readinessEntries=await Promise.all([...latestVersions.entries()].map(async([packKey,version])=>{
    const {data,error}=await supabase.rpc('get_industry_pack_readiness_v1',{
      p_pack_key:packKey,
      p_pack_version:version.version,
    });
    return [packKey,error?{}:obj(data)] as const;
  }));
  const readinessByPack=new Map(readinessEntries);

  return <div>
    <div className="headerRow">
      <div>
        <h1>Industry Packs</h1>
        <p className="muted">Versioned vertical blueprints that configure the canonical core instead of forking it.</p>
      </div>
      <span className="status">{packs.length} system packs</span>
    </div>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">A Pack may describe onboarding, Lead/Deal custom-field blueprints, pipeline stages, automation recipes, metrics, templates and AI evaluation scenarios. Activation does not create operational CRM fields, Deals, bookings, Catalog items, messages, payments or automations. Those remain governed by their existing canonical modules and must be materialized deliberately through their own contracts.</p>
    </section>

    <section className="panel">
      <h2>Business assignments</h2>
      {!businesses.length?<p className="muted">No canonical Business exists yet, so there is nothing legitimate to activate a Pack against. The Pack catalog is ready; tenant activation stays empty rather than inventing a demo Business.</p>:<div className="settingsList">
        {businesses.map(business=>{
          const activation=activationByBusiness.get(business.id);
          return <div className="settingsRow" key={business.id}><div>
            <strong>{business.name}</strong>
            <span className="muted smallText">{business.slug} · {activation?.active?('Active: '+(packNames.get(activation.pack_key)??activation.pack_key)+' v'+activation.pack_version):'No active Industry Pack'}</span>
          </div><div>
            {activation?.active?<form action={deactivateIndustryPackV1}>
              <input type="hidden" name="tenant_business_id" value={business.id}/>
              <input type="hidden" name="expected_version" value={activation.version}/>
              <button>Deactivate</button>
            </form>:null}
            <form action={activateIndustryPackV1} className="settingsGrid">
              <input type="hidden" name="tenant_business_id" value={business.id}/>
              <input type="hidden" name="expected_version" value={activation?.version??''}/>
              <label>Pack<select name="pack_key" defaultValue={activation?.pack_key??packs[0]?.pack_key}>
                {packs.map(pack=><option key={pack.pack_key} value={pack.pack_key}>{pack.name}</option>)}
              </select></label>
              <button>{activation?'Change / Reactivate':'Activate Pack'}</button>
            </form>
          </div></div>;
        })}
      </div>}
    </section>

    <section className="panel">
      <h2>Pack catalog</h2>
      <div className="settingsList">
        {packs.map(pack=>{
          const version=latestVersions.get(pack.pack_key);
          const manifest=obj(version?.manifest);
          const onboarding=obj(manifest.onboarding);
          const readiness=readinessByPack.get(pack.pack_key)??{};
          const pendingCustomObjects=arr(readiness.pendingCustomObjects);
          const runtimeReady=readiness.runtimeReady===true;
          return <div className="settingsRow" key={pack.pack_key}><div>
            <strong>{pack.name}</strong>
            <span className="muted smallText">{pack.category} · {pack.pack_key} · v{version?.version??'—'}</span>
            <p>{pack.description}</p>
            <span className="muted smallText">Required facts: {list(onboarding.requiredFacts).join(', ')||'none'} · Capabilities: {list(onboarding.requiredCapabilities).join(', ')||'none'}</span>
            <span className="muted smallText">Blueprints: {blueprintCount(manifest,'customFieldBlueprints')} custom fields · {blueprintCount(manifest,'customObjectBlueprints')} custom objects · {blueprintCount(manifest,'pipelineBlueprints')} pipelines · {blueprintCount(manifest,'automationBlueprints')} automations · {blueprintCount(manifest,'metrics')} metrics · {blueprintCount(manifest,'aiEvaluationScenarios')} AI evaluations</span>
            <span className="muted smallText">Canonical readiness: {runtimeReady?'READY':'BLOCKED'} · Future/external custom-object dependencies: {pendingCustomObjects.length}</span>
            <details><summary>Inspect readiness</summary><pre className="smallText">{JSON.stringify(readiness,null,2)}</pre></details>
            <details><summary>Inspect versioned manifest</summary><pre className="smallText">{JSON.stringify(manifest,null,2)}</pre></details>
          </div></div>;
        })}
      </div>
    </section>
  </div>;
}

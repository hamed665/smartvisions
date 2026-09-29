import {
  createAutomationRule,
  publishAutomationRule,
  saveAutomationRuleDraft,
  setAutomationRuleEnabled,
} from '@/app/management-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

const ACTIONS=[
  'GENERATE_PREVIEW','SEND_FOLLOWUP','CREATE_OPERATOR_BRIEF','HANDOFF_HUMAN','PAUSE_AUTOMATION','MARK_HOT',
];

export default async function AutomationsPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const [rulesResult,catalogResult]=await Promise.all([
    supabase.from('automation_rules')
      .select('id,name,owner_user_id,trigger_key,action_key,conditions,actions,enabled,priority,config,publication_state,draft_revision,published_revision,latest_published_version,execution_state,last_published_at,created_at,updated_at')
      .eq('organization_id',organizationId)
      .order('priority',{ascending:false}),
    supabase.from('automation_trigger_catalog')
      .select('trigger_key,family,source_kind,event_name,schema_version,availability,required_work_package,description')
      .order('family',{ascending:true})
      .order('trigger_key',{ascending:true}),
  ]);
  if(rulesResult.error)throw new Error(rulesResult.error.message);
  if(catalogResult.error)throw new Error(catalogResult.error.message);

  const rows=rulesResult.data??[];
  const triggers=catalogResult.data??[];
  const triggerByKey=new Map(triggers.map(trigger=>[trigger.trigger_key,trigger]));
  const editable=role==='OWNER';
  const ready=rows.filter(rule=>rule.execution_state==='READY').length;

  return <div>
    <div className="headerRow">
      <div>
        <h1>Automation Workflows</h1>
        <p className="muted">Draft & published model over the canonical automation_rules authority. Published versions are immutable.</p>
      </div>
      <span className="status">{ready} execution-ready</span>
    </div>

    <section className="panel">
      <h2>Model boundary</h2>
      <p className="muted">
        Trigger, conditions, ordered actions, ownership, immutable publish history and enable/disable state live here.
        AUTO-RUNTIME is a separate Work Package: this screen does not execute a workflow, enqueue work, send a provider message or bypass approval policy.
      </p>
    </section>

    <section className="panel">
      <h2>Trigger catalog</h2>
      <p className="muted">
        {triggers.filter(trigger=>trigger.availability==='AVAILABLE').length} publishable trigger contracts of {triggers.length} cataloged.
        Dependency-pending triggers may be designed in a draft, but Publish fails closed until their canonical domain authority exists.
      </p>
    </section>

    <div className="settingsList">
      {rows.map(rule=>{
        const hasUnpublishedDraft=rule.publication_state!=='PUBLISHED'||rule.published_revision!==rule.draft_revision;
        const trigger=triggerByKey.get(rule.trigger_key);
        return <section className="panel" key={rule.id}>
          <div className="headerRow">
            <div>
              <h2>{rule.name}</h2>
              <p className="muted smallText">
                {rule.trigger_key} → {rule.action_key} · draft r{rule.draft_revision} · Published v{rule.latest_published_version||0}
              </p>
            </div>
            <span className="status">{rule.execution_state}</span>
          </div>

          <div className="healthList">
            <span>Trigger contract <strong>{trigger?.family??'UNKNOWN'} / {trigger?.availability??'UNKNOWN'}</strong></span>
            <span>Publication <strong>{rule.publication_state}</strong></span>
            <span>Execution eligibility <strong>{rule.execution_state}</strong></span>
            <span>Enabled <strong>{rule.enabled?'YES':'NO'}</strong></span>
            <span>Owner <strong>{rule.owner_user_id?String(rule.owner_user_id).slice(0,8):'UNASSIGNED'}</strong></span>
            <span>Published <strong>{rule.last_published_at?new Date(rule.last_published_at).toLocaleString():'Never'}</strong></span>
          </div>

          {editable?<form action={saveAutomationRuleDraft} className="settingsGrid">
            <input type="hidden" name="id" value={rule.id}/>
            <input type="hidden" name="draft_revision" value={rule.draft_revision}/>
            <input type="hidden" name="owner_user_id" value={rule.owner_user_id??''}/>
            <label>Name<input name="name" required maxLength={160} defaultValue={rule.name}/></label>
            <label>Trigger
              <select name="trigger_key" defaultValue={rule.trigger_key}>
                {triggers.map(trigger=><option key={trigger.trigger_key} value={trigger.trigger_key}>{trigger.trigger_key} · {trigger.family} · {trigger.availability}</option>)}
              </select>
            </label>
            <label>Priority<input type="number" min="0" max="100" name="priority" defaultValue={rule.priority}/></label>
            <label className="wideField">Conditions JSON
              <textarea name="conditions_json" rows={6} spellCheck={false} defaultValue={JSON.stringify(rule.conditions??[],null,2)}/>
            </label>
            <label className="wideField">Ordered actions JSON
              <textarea name="actions_json" rows={8} spellCheck={false} defaultValue={JSON.stringify(rule.actions??[],null,2)}/>
            </label>
            <label className="wideField">Workflow config JSON
              <textarea name="config_json" rows={4} spellCheck={false} defaultValue={JSON.stringify(rule.config??{},null,2)}/>
            </label>
            <button>Save new draft revision</button>
          </form>:null}

          {editable?<div className="approvalActions">
            <form action={publishAutomationRule}>
              <input type="hidden" name="id" value={rule.id}/>
              <input type="hidden" name="draft_revision" value={rule.draft_revision}/>
              <button className="approveButton" disabled={!hasUnpublishedDraft}>Publish draft</button>
            </form>
            <form action={setAutomationRuleEnabled}>
              <input type="hidden" name="id" value={rule.id}/>
              <input type="hidden" name="enabled" value={rule.enabled?'false':'true'}/>
              <button disabled={!rule.enabled&&rule.latest_published_version===0}>
                {rule.enabled?'Disable published workflow':'Enable published workflow'}
              </button>
            </form>
          </div>:null}
        </section>;
      })}
    </div>

    {rows.length===0?<section className="panel">
      <p className="muted">No automation workflow exists in this Organization. Production is not seeded merely to make the page look busy.</p>
    </section>:null}

    {editable?<section className="panel settingsCreate">
      <h2>Create workflow draft</h2>
      <p className="muted">Creation makes a disabled DRAFT only. Publish and enable are separate explicit actions.</p>
      <form action={createAutomationRule} className="settingsGrid">
        <input type="hidden" name="request_key" value={`automation-create:${crypto.randomUUID()}`}/>
        <label>Name<input name="name" required maxLength={160} placeholder="Hot lead operator handoff"/></label>
        <label>Trigger
          <select name="trigger_key">{triggers.map(trigger=><option key={trigger.trigger_key} value={trigger.trigger_key}>{trigger.trigger_key} · {trigger.family} · {trigger.availability}</option>)}</select>
        </label>
        <label>Initial action
          <select name="action_key">{ACTIONS.map(key=><option key={key}>{key}</option>)}</select>
        </label>
        <label>Priority<input type="number" name="priority" defaultValue="50" min="0" max="100"/></label>
        <label className="wideField">Conditions JSON
          <textarea name="conditions_json" rows={5} spellCheck={false} defaultValue="[]"/>
        </label>
        <button>Create disabled draft</button>
      </form>
    </section>:null}
  </div>;
}

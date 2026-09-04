import { updateAgent } from '@/app/control-center-actions';
import { createPromptVersion } from '@/app/versioned-intelligence-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
export const dynamic='force-dynamic';

export default async function AgentsPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const [{data:agentData},{data:promptData}]=await Promise.all([
    supabase.from('agent_settings').select('id,agent_name,enabled,model,confidence_threshold,config').eq('organization_id',organizationId).order('agent_name'),
    supabase.from('prompt_versions').select('id,agent_name,version,prompt_text,active,created_at').eq('organization_id',organizationId).eq('active',true).order('agent_name')
  ]);
  const agents=agentData??[],prompts=promptData??[];const editable=role==='OWNER';
  return <div>
    <div className="headerRow"><div><h1>AI Agents</h1><p className="muted">Model routing, autonomy threshold and versioned instructions for every specialist.</p></div><span className="status">{agents.filter(a=>a.enabled).length} enabled</span></div>
    <div className="settingsList">{agents.map(agent=>{const prompt=prompts.find(p=>p.agent_name===agent.agent_name);const config=(agent.config??{}) as Record<string,unknown>;const previewDirector=agent.agent_name==='preview_director';return <section className="agentControl" key={agent.id}>
      <form action={updateAgent} className="settingsRow agentRow">
        <input type="hidden" name="id" value={agent.id}/><div><strong>{agent.agent_name}</strong><span className="muted smallText">{prompt?`Prompt v${prompt.version}`:'No active prompt version'}</span></div>
        <label>Model<input name="model" defaultValue={agent.model??''} placeholder="Router Default" disabled={!editable}/><span className="muted smallText">Leave blank to use Cost Guard model routing.</span></label>
        <label>Confidence<input type="number" min="0" max="1" step="0.01" name="confidence_threshold" defaultValue={agent.confidence_threshold} disabled={!editable}/></label>
        {previewDirector?<><label>Generate score<input type="number" min="0" max="100" step="1" name="generation_score_threshold" defaultValue={Number(config.generation_score_threshold??Math.round(Number(agent.confidence_threshold??0.6)*100))} disabled={!editable}/></label><label>Heavy media score<input type="number" min="0" max="100" step="1" name="heavy_generation_score_threshold" defaultValue={Number(config.heavy_generation_score_threshold??80)} disabled={!editable}/></label></>:null}
        <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={agent.enabled} disabled={!editable}/> Enabled</label><button disabled={!editable}>Save</button>
      </form>
      <p className="muted smallText">Output-token and reasoning budgets are enforced by the runtime task router, not decorative per-agent controls.</p>
      {previewDirector?<p className="muted smallText">Proposal generation and expensive media gates are stored in the existing Preview Director config and apply without redeploy.</p>:null}
      {editable?<details className="promptEditor"><summary>Edit agent instructions</summary>{prompt?<pre className="knowledgeText">{prompt.prompt_text}</pre>:null}<form action={createPromptVersion} className="settingsGrid"><input type="hidden" name="agent_name" value={agent.agent_name}/><label className="wideField">New prompt version<textarea name="prompt_text" rows={8} required defaultValue={prompt?.prompt_text??''}/></label><button>Publish new version</button></form></details>:null}
    </section>})}</div>
  </div>
}

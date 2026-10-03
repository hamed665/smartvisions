import { updateAgent } from '@/app/control-center-actions';
import {
  configurePromptRollout,
  createPromptVersion,
  setActivePromptVersion,
} from '@/app/versioned-intelligence-actions';
import { evaluatePromptCandidate, parsePromptControlConfig } from '@/lib/agents/prompt-control';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export default async function AgentsPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const [{data:agentData},{data:promptData}]=await Promise.all([
    supabase.from('agent_settings').select('id,agent_name,enabled,model,confidence_threshold,config').eq('organization_id',organizationId).order('agent_name'),
    supabase.from('prompt_versions').select('id,agent_name,version,prompt_text,active,created_at').eq('organization_id',organizationId).order('version',{ascending:false}).limit(100),
  ]);
  const agents=agentData??[],prompts=promptData??[];const editable=role==='OWNER';

  return <div>
    <div className="headerRow">
      <div>
        <h1>AI Agents</h1>
        <p className="muted">Canonical model routing plus staged, versioned prompt rollout. Hard runtime safety always stays above configurable prompt guidance.</p>
      </div>
      <span className="status">{agents.filter(a=>a.enabled).length} enabled</span>
    </div>

    <div className="settingsList">{agents.map(agent=>{
      const versions=prompts.filter(p=>p.agent_name===agent.agent_name);
      const active=versions.find(p=>p.active===true);
      const config=(agent.config??{}) as Record<string,unknown>;
      const control=parsePromptControlConfig(config);
      const candidate=control.candidateVersion
        ? versions.find(p=>Number(p.version)===control.candidateVersion && p.active!==true)
        : versions.find(p=>p.active!==true);
      const evaluation=candidate?evaluatePromptCandidate(String(candidate.prompt_text??'')):null;
      const previous=active?versions.find(p=>!p.active && Number(p.version)<Number(active.version)):undefined;
      const previewDirector=agent.agent_name==='preview_director';

      return <section className="agentControl" key={agent.id}>
        <form action={updateAgent} className="settingsRow agentRow">
          <input type="hidden" name="id" value={agent.id}/>
          <div>
            <strong>{agent.agent_name}</strong>
            <span className="muted smallText">
              {active?`Active prompt v${active.version}`:'Built-in runtime prompt'} · rollout {control.mode}
              {control.mode==='CANARY'?` ${control.canaryPct}%`:''}
            </span>
          </div>
          <label>Model<input name="model" defaultValue={agent.model??''} placeholder="Router Default" disabled={!editable}/><span className="muted smallText">Leave blank to use Cost Guard model routing.</span></label>
          <label>Confidence<input type="number" min="0" max="1" step="0.01" name="confidence_threshold" defaultValue={agent.confidence_threshold} disabled={!editable}/></label>
          {previewDirector?<><label>Generate score<input type="number" min="0" max="100" step="1" name="generation_score_threshold" defaultValue={Number(config.generation_score_threshold??Math.round(Number(agent.confidence_threshold??0.6)*100))} disabled={!editable}/></label><label>Heavy media score<input type="number" min="0" max="100" step="1" name="heavy_generation_score_threshold" defaultValue={Number(config.heavy_generation_score_threshold??80)} disabled={!editable}/></label></>:null}
          <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={agent.enabled} disabled={!editable}/> Enabled</label>
          <button disabled={!editable}>Save</button>
        </form>

        <p className="muted smallText">Output-token and reasoning budgets stay in the canonical task router and Cost Guard. Per-agent model override is optional.</p>

        {editable?<details className="promptEditor">
          <summary>Prompt version & rollout control</summary>
          <div className="settingsGrid">
            <div className="wideField">
              <strong>Live baseline</strong>
              <pre className="knowledgeText">{active?.prompt_text??'No active owner prompt. The hardened built-in runtime instruction remains the baseline.'}</pre>
            </div>

            <form action={createPromptVersion} className="wideField">
              <input type="hidden" name="agent_name" value={agent.agent_name}/>
              <label>Stage candidate
                <textarea name="prompt_text" rows={8} required maxLength={7000} defaultValue={candidate?.prompt_text??active?.prompt_text??''}/>
              </label>
              <button>Stage new version</button>
            </form>

            {candidate?<div className="wideField">
              <strong>Candidate v{candidate.version} · {evaluation?.verdict}</strong>
              <span className="muted smallText">{evaluation?.checks.map(check=>check.detail).join(' · ')}</span>
              <pre className="knowledgeText">{candidate.prompt_text}</pre>

              <div className="settingsGrid">
                <form action={configurePromptRollout}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="candidate_version" value={candidate.version}/>
                  <input type="hidden" name="mode" value="SHADOW"/>
                  <button disabled={evaluation?.verdict==='BLOCK'}>Stage as shadow</button>
                </form>

                <form action={configurePromptRollout}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="candidate_version" value={candidate.version}/>
                  <input type="hidden" name="mode" value="CANARY"/>
                  <label>Canary %
                    <input name="canary_pct" type="number" min="1" max="50" defaultValue={control.mode==='CANARY'?control.canaryPct:10}/>
                  </label>
                  <button disabled={evaluation?.verdict==='BLOCK'}>Start canary</button>
                </form>

                <form action={setActivePromptVersion}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="version" value={candidate.version}/>
                  <button disabled={evaluation?.verdict==='BLOCK'}>Promote candidate</button>
                </form>

                <form action={configurePromptRollout}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="mode" value="OFF"/>
                  <button>Stop rollout</button>
                </form>
              </div>
            </div>:null}

            <div className="wideField">
              <strong>Rollback</strong>
              <span className="muted smallText">Promotion or rollback atomically changes the canonical active prompt and clears any candidate rollout.</span>
              <div className="settingsGrid">
                {previous?<form action={setActivePromptVersion}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="version" value={previous.version}/>
                  <button>Rollback to v{previous.version}</button>
                </form>:null}
                {active?<form action={setActivePromptVersion}>
                  <input type="hidden" name="agent_name" value={agent.agent_name}/>
                  <input type="hidden" name="version" value=""/>
                  <button>Reset to built-in baseline</button>
                </form>:null}
              </div>
            </div>
          </div>
        </details>:null}
      </section>
    })}</div>
  </div>;
}

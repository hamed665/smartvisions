import { updateAgent } from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export default async function AgentsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase.from('agent_settings').select('id,agent_name,enabled,model,temperature,max_tokens,confidence_threshold').eq('organization_id', organizationId).order('agent_name');
  const agents = data ?? [];
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>AI Agents</h1><p className="muted">Live orchestration settings. Changes affect model choice and autonomous confidence thresholds.</p></div><span className="status">{agents.filter((a) => a.enabled).length} enabled</span></div>
    <div className="settingsList">
      {agents.map((agent) => <form action={updateAgent} className="settingsRow agentRow" key={agent.id}>
        <input type="hidden" name="id" value={agent.id} />
        <div><strong>{agent.agent_name}</strong><span className="muted smallText">Agent configuration</span></div>
        <label>Model<input name="model" defaultValue={agent.model} disabled={!editable} /></label>
        <label>Temperature<input type="number" min="0" max="2" step="0.05" name="temperature" defaultValue={agent.temperature} disabled={!editable} /></label>
        <label>Max tokens<input type="number" min="64" step="1" name="max_tokens" defaultValue={agent.max_tokens} disabled={!editable} /></label>
        <label>Confidence<input type="number" min="0" max="1" step="0.01" name="confidence_threshold" defaultValue={agent.confidence_threshold} disabled={!editable} /></label>
        <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={agent.enabled} disabled={!editable} /> Enabled</label>
        <button disabled={!editable}>Save</button>
      </form>)}
    </div>
  </div>;
}

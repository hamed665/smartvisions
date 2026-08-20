import { updateApprovalRule } from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export default async function SystemPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data: rules = [] } = await supabase.from('approval_rules').select('id,action_key,requires_approval,config').eq('organization_id', organizationId).order('action_key');
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>System</h1><p className="muted">Live approval boundaries and safety controls stored in production.</p></div><span className="status">Owner controls</span></div>
    <section className="panel"><h2>Approval rules</h2><p className="muted">Only actions marked here require your approval. Normal low-risk replies can remain autonomous.</p></section>
    <div className="settingsList">
      {rules.map((rule) => <form action={updateApprovalRule} className="settingsRow" key={rule.id}>
        <input type="hidden" name="id" value={rule.id} />
        <div><strong>{rule.action_key}</strong><span className="muted smallText">Production approval policy</span></div>
        <label className="toggleLabel"><input type="checkbox" name="requires_approval" defaultChecked={rule.requires_approval} disabled={!editable} /> Requires approval</label>
        <button disabled={!editable}>Save</button>
      </form>)}
    </div>
    <section className="panel settingsCreate"><h2>Environment safety</h2><p className="muted">Global kill switch and Shadow Mode are deployment environment controls. They stay read-only here until a secure runtime settings layer replaces environment variables.</p><div className="grid"><div className="card"><span className="muted">Global kill switch</span><div className="value">{process.env.GLOBAL_KILL_SWITCH === 'true' ? 'ON' : 'OFF'}</div></div><div className="card"><span className="muted">Shadow mode</span><div className="value">{process.env.SHADOW_MODE === 'true' ? 'ON' : 'OFF'}</div></div></div></section>
  </div>;
}

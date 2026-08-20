import { runOpenAiHealthCheck } from '@/app/cost-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export default async function OpenAiHealthCheckPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization(true);
  const { data: recentUsage } = await supabase
    .from('usage_events')
    .select('provider,operation,cost_usd,input_tokens,output_tokens,metadata,created_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'OPENAI')
    .order('created_at', { ascending: false })
    .limit(5);

  const configured = Boolean(process.env.OPENAI_API_KEY) && Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  return <div>
    <div className="headerRow">
      <div>
        <h1>OpenAI Health Check</h1>
        <p className="muted">Owner-only, low-cost production test. Cost Guard is enforced before the request and token usage is recorded after it.</p>
      </div>
      <span className={`status ${configured ? '' : 'dangerStatus'}`}>{configured ? 'READY' : 'MISSING SECRET'}</span>
    </div>

    <section className="panel">
      <h2>Controlled test</h2>
      <p className="muted">Runs only the low-cost intent-discovery agent on a fixed sample message. It does not contact a lead, send a message, create a campaign or trigger outreach.</p>
      <form action={runOpenAiHealthCheck}>
        <button disabled={role !== 'OWNER' || !configured}>Run low-cost OpenAI test</button>
      </form>
    </section>

    <section className="panel">
      <h2>Recent OpenAI usage</h2>
      <div className="settingsList">
        {(recentUsage ?? []).length === 0 ? <p className="muted">No OpenAI usage has been recorded yet.</p> : (recentUsage ?? []).map((row, index) => <div className="settingsRow" key={`${row.created_at}-${index}`}>
          <strong>{row.operation}</strong>
          <span>${Number(row.cost_usd ?? 0).toFixed(6)}</span>
          <span className="muted">{Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0)} tokens · {new Date(row.created_at).toLocaleString()}</span>
        </div>)}
      </div>
    </section>
  </div>;
}

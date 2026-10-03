import { notFound } from 'next/navigation';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { listOwnerCopilotAvailableActions } from '@/lib/telegram/panel-parity';
import { OwnerCopilotPanel } from './owner-copilot-panel';

export const dynamic='force-dynamic';

export default async function OwnerCopilotPage(){
  const current=await getCurrentOrganization();
  const role=String(current.role).toUpperCase();
  if(!current.userId||!['OWNER','ADMIN'].includes(role)) notFound();

  const service=createSupabaseServiceClient();
  const [actionsResult,controlsResult]=await Promise.all([
    listOwnerCopilotAvailableActions(service).catch(()=>[]),
    service.from('system_controls')
      .select('global_kill_switch,shadow_mode,agents_paused')
      .eq('organization_id',current.organizationId).maybeSingle(),
  ]);
  const controls=controlsResult.data;
  const mutationBlocked=Boolean(
    controls?.global_kill_switch||controls?.shadow_mode||controls?.agents_paused,
  );

  return <div>
    <div className="headerRow">
      <div>
        <h1>Owner Copilot</h1>
        <p className="muted">
          Ask across live CRM, tasks, bookings, quotes, orders, invoices, payments,
          campaigns, automations and team workload. Writes always stop at Preview
          until an OWNER/ADMIN explicitly confirms them.
        </p>
      </div>
      <span className={mutationBlocked?'status dangerStatus':'status'}>
        {mutationBlocked?'MUTATION GATED':'CONFIRM REQUIRED'}
      </span>
    </div>

    <section className="panel">
      <div className="healthList">
        <span>Role <strong>{role}</strong></span>
        <span>Registered Owner actions <strong>{actionsResult.length}</strong></span>
        <span>Shadow Mode <strong>{controls?.shadow_mode?'ON':'OFF'}</strong></span>
        <span>Global Kill Switch <strong>{controls?.global_kill_switch?'ON':'OFF'}</strong></span>
        <span>Agents <strong>{controls?.agents_paused?'PAUSED':'ENABLED'}</strong></span>
      </div>
      <p className="muted smallText">
        Shadow Mode, Kill Switch or Agents pause blocks confirmed mutations. Read-only questions remain available.
        Provider sends and provider payment/refund execution are outside this direct Copilot surface.
      </p>
    </section>

    <OwnerCopilotPanel mutationBlocked={mutationBlocked}/>
  </div>;
}

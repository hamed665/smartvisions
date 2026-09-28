import {
  getCrmPipelineForecast,
  listCrmDeals,
  listCrmPipelines,
} from '@/lib/crm/deals';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { SalesPipelineActions } from './sales-pipeline-actions';

export const dynamic = 'force-dynamic';

export default async function SalesPipelinePage() {
  const { supabase, organizationId, role, userId } = await getCurrentOrganization();

  const [pipelineData, dealsPage, forecast, businesses, members, teams, assignments] = await Promise.all([
    listCrmPipelines({ supabase, organizationId }),
    listCrmDeals({ supabase, organizationId, limit: 100 }),
    getCrmPipelineForecast({ supabase, organizationId }),
    supabase.from('businesses')
      .select('id,name')
      .eq('organization_id', organizationId)
      .order('name')
      .limit(200),
    supabase.from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .in('role', ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'])
      .order('role'),
    supabase.from('teams')
      .select('id,name,status')
      .eq('organization_id', organizationId)
      .eq('status','ACTIVE')
      .order('name'),
    supabase.from('member_scope_assignments')
      .select('user_id,team_id,role')
      .eq('organization_id', organizationId)
      .eq('scope_type','TEAM'),
  ]);

  for (const [name, result] of [
    ['Businesses', businesses],
    ['Members', members],
    ['Teams', teams],
    ['Team assignments', assignments],
  ] as const) {
    if (result.error) throw new Error(`CRM Pipeline ${name} lookup failed: ${result.error.message}`);
  }

  const canManagePipeline = ['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));
  const canManageDeals = ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Sales Pipeline</h1>
        <p className="muted">
          Canonical CRM Deal truth with configurable stage policy, deterministic weighted forecast,
          explicit owner/Team classification and immutable Won/Lost evidence.
        </p>
      </div>
      <span className="status">
        {pipelineData.pipelines.length} pipelines · {dealsPage.items.length} deals
      </span>
    </div>

    <SalesPipelineActions
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={String(role)}
      canManagePipeline={canManagePipeline}
      canManageDeals={canManageDeals}
      pipelines={pipelineData.pipelines}
      stages={pipelineData.stages}
      deals={dealsPage.items}
      forecast={forecast}
      businesses={(businesses.data ?? []).map(row => ({ id:String(row.id), name:String(row.name) }))}
      members={(members.data ?? []).map(row => ({ userId:String(row.user_id), role:String(row.role) }))}
      teams={(teams.data ?? []).map(row => ({ id:String(row.id), name:String(row.name) }))}
      teamAssignments={(assignments.data ?? []).map(row => ({
        userId:String(row.user_id),
        teamId:String(row.team_id),
        role:String(row.role),
      }))}
    />

    <section className="panel">
      <strong>Forecast boundary</strong>
      <p className="muted">
        Weighted amount is generated from canonical Deal amount × probability. Forecast rows remain
        grouped by currency and are never summed across currencies. Moving a Deal to another stage
        resets manual forecast values to that destination stage policy; AI has no silent authority here.
      </p>
    </section>
  </div>;
}

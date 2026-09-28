import {
  getCrmPipelineForecast,
  listCrmDeals,
  listCrmPipelines,
} from '@/lib/crm/deals';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { SalesPipelineOperator } from './sales-pipeline-operator';

export const dynamic = 'force-dynamic';

const MANAGER_ROLES = new Set(['OWNER','ADMIN','SALES_MANAGER']);
const DEAL_ROLES = new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);

export default async function SalesPipelinePage() {
  const { supabase, organizationId, role, userId } = await getCurrentOrganization();
  const roleText = String(role);
  const businessWideDealOperator = DEAL_ROLES.has(roleText);
  const canManagePipeline = MANAGER_ROLES.has(roleText);

  const [pipelineData, dealsPage, forecast, teamResult] = await Promise.all([
    listCrmPipelines({ supabase, organizationId }),
    listCrmDeals({ supabase, organizationId, limit: 100 }),
    getCrmPipelineForecast({ supabase, organizationId }),
    supabase
      .from('teams')
      .select('id,name,status')
      .eq('organization_id', organizationId)
      .eq('status','ACTIVE')
      .order('name')
      .limit(200),
  ]);

  if (teamResult.error) {
    throw new Error('CRM Pipeline Team lookup failed: ' + teamResult.error.message);
  }

  const activeTeams = (teamResult.data ?? []).map(row => ({
    id:String(row.id),
    name:String(row.name),
  }));

  let operatorTeams = activeTeams;
  let scopedCanManage = false;

  if (roleText === 'VIEWER') {
    const checks = await Promise.all(activeTeams.map(async team => {
      const { data, error } = await supabase.rpc('crm_scope_assignment_covers_team', {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_team_id: team.id,
        p_allowed_roles: ['ADMIN','SALES_MANAGER','SALES_AGENT'],
      });
      if (error) throw new Error('CRM Pipeline scope lookup failed: ' + error.message);
      return data === true ? team : null;
    }));
    operatorTeams = checks.filter((team): team is {id:string;name:string} => Boolean(team));
    scopedCanManage = operatorTeams.length > 0;
  }

  const canManageDeals = businessWideDealOperator || scopedCanManage;
  const canCreateDeals = businessWideDealOperator;

  let owners = [{ userId, role: roleText, businessWide: businessWideDealOperator }];
  let businesses: Array<{id:string;name:string}> = [];

  if (canCreateDeals) {
    const service = createSupabaseServiceClient();
    const [membersResult, businessesResult] = await Promise.all([
      service
        .from('organization_members')
        .select('user_id,role')
        .eq('organization_id', organizationId)
        .in('role',['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'])
        .limit(500),
      service
        .from('businesses')
        .select('id,name')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(250),
    ]);

    if (membersResult.error) {
      throw new Error('CRM Pipeline owner lookup failed: ' + membersResult.error.message);
    }
    if (businessesResult.error) {
      throw new Error('CRM Pipeline Account lookup failed: ' + businessesResult.error.message);
    }

    owners = (membersResult.data ?? []).map(row => ({
      userId:String(row.user_id),
      role:String(row.role),
      businessWide:true,
    }));
    businesses = (businessesResult.data ?? []).map(row => ({
      id:String(row.id),
      name:String(row.name),
    }));
  }

  return <div>
    <div className="headerRow">
      <div>
        <h1>Sales Pipeline</h1>
        <p className="muted">
          Governed Deal ownership, configurable stage policy and deterministic weighted forecast.
          Won/Lost transitions require evidence and scoped operators only see Deals covered by canonical IAM.
        </p>
      </div>
      <span className="status">
        {pipelineData.pipelines.length} pipelines · {dealsPage.items.length} visible deals
      </span>
    </div>

    <SalesPipelineOperator
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={roleText}
      canManagePipeline={canManagePipeline}
      canManageDeals={canManageDeals}
      canCreateDeals={canCreateDeals}
      pipelines={pipelineData.pipelines}
      stages={pipelineData.stages}
      deals={dealsPage.items}
      forecast={forecast}
      businesses={businesses}
      owners={owners}
      teams={operatorTeams}
    />
  </div>;
}

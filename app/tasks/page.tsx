import { listCrmTasks } from '@/lib/crm/tasks';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { TaskActions } from './task-actions';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const { supabase, organizationId, role, userId } = await getCurrentOrganization();

  const [taskPage, businesses, deals, members] = await Promise.all([
    listCrmTasks({ supabase, organizationId, includeClosed: false, limit: 100 }),
    supabase
      .from('businesses')
      .select('id,name')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true }),
    supabase
      .from('crm_deals')
      .select('id,title,business_id,state')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .in('role', ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'])
      .order('role', { ascending: true }),
  ]);

  if (businesses.error) throw new Error(`CRM Task Business lookup failed: ${businesses.error.message}`);
  if (deals.error) throw new Error(`CRM Task Deal lookup failed: ${deals.error.message}`);
  if (members.error) throw new Error(`CRM Task member lookup failed: ${members.error.message}`);

  const canCreate = ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Tasks</h1>
        <p className="muted">Actionable human work stays in one canonical Task store. Activity history comes from immutable audit evidence.</p>
      </div>
      <span className="status">{taskPage.items.length} open tasks</span>
    </div>

    <TaskActions
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={String(role)}
      canCreate={canCreate}
      businesses={(businesses.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }))}
      deals={(deals.data ?? []).map((row) => ({
        id: String(row.id),
        title: String(row.title),
        businessId: String(row.business_id),
        state: String(row.state),
      }))}
      members={(members.data ?? []).map((row) => ({ userId: String(row.user_id), role: String(row.role) }))}
      tasks={taskPage.items}
    />

    <section className="panel">
      <strong>Scope note</strong>
      <p className="muted">Deal linkage and reminders are live in this slice. Booking, Order and Support Case links remain unavailable until those canonical authorities exist. Recurrence is not fabricated without a real recurring-work requirement.</p>
    </section>
  </div>;
}

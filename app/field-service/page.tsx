import { getCurrentOrganization } from '@/lib/supabase/org';
import { FieldServiceActions } from './field-service-actions';

export const dynamic='force-dynamic';

export default async function FieldServicePage(){
  const {supabase,organizationId,role,userId}=await getCurrentOrganization();

  const orders=await supabase.from('field_service_work_orders')
    .select('*').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100);
  if(orders.error) throw new Error(`Field Service page lookup failed: ${orders.error.message}`);

  const orderTaskIds=(orders.data??[]).map(row=>String(row.task_id));
  const tasks=orderTaskIds.length
    ?await supabase.from('crm_tasks')
      .select('id,title,status,priority,assignee_user_id,due_at,person_id,business_id,version')
      .eq('organization_id',organizationId).eq('task_type','FIELD_SERVICE')
      .in('id',orderTaskIds).order('updated_at',{ascending:false})
    :{data:[],error:null};

  const [businesses,people,bookings,members,cases]=await Promise.all([
    supabase.from('businesses').select('id,name,formatted_address')
      .eq('organization_id',organizationId).order('name',{ascending:true}).limit(200),
    supabase.from('crm_people').select('id,display_name,status')
      .eq('organization_id',organizationId).eq('status','ACTIVE').order('display_name',{ascending:true}).limit(200),
    supabase.from('bookings')
      .select('id,booking_reference,person_id,service_id,branch_id,requested_branch_id,starts_at,ends_at,status')
      .eq('organization_id',organizationId)
      .in('status',['REQUESTED','HELD','CONFIRMED','RESCHEDULED','COMPLETED'])
      .order('updated_at',{ascending:false}).limit(100),
    supabase.from('organization_members').select('user_id,role')
      .eq('organization_id',organizationId)
      .in('role',['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']).order('role',{ascending:true}),
    supabase.from('crm_support_cases').select('id,subject,status,person_id,business_id')
      .eq('organization_id',organizationId)
      .not('status','in','(CLOSED,RESOLVED)').order('updated_at',{ascending:false}).limit(100),
  ]);

  const errors=[tasks,businesses,people,bookings,members,cases].map(x=>x.error).filter(Boolean);
  if(errors.length) throw new Error(`Field Service page lookup failed: ${errors[0]?.message}`);

  const taskIds=(tasks.data??[]).map(row=>String(row.id));
  const [checklist,materials,evidence,signoffs]=taskIds.length?await Promise.all([
    supabase.from('field_service_checklist_items').select('*')
      .eq('organization_id',organizationId).in('task_id',taskIds).order('position',{ascending:true}),
    supabase.from('field_service_material_usage').select('*')
      .eq('organization_id',organizationId).in('task_id',taskIds).order('created_at',{ascending:false}),
    supabase.from('field_service_evidence').select('*')
      .eq('organization_id',organizationId).in('task_id',taskIds).order('created_at',{ascending:false}),
    supabase.from('field_service_signoffs').select('*')
      .eq('organization_id',organizationId).in('task_id',taskIds).order('signed_at',{ascending:false}),
  ]):[
    {data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null},
  ];

  const detailError=[checklist,materials,evidence,signoffs].map(x=>x.error).filter(Boolean)[0];
  if(detailError) throw new Error(`Field Service detail lookup failed: ${detailError.message}`);

  const orderByTask=new Map((orders.data??[]).map(row=>[String(row.task_id),row]));
  const views=(tasks.data??[]).flatMap(task=>{
    const order=orderByTask.get(String(task.id));
    if(!order) return [];
    const taskId=String(task.id);
    return [{
      task,order,
      checklist:(checklist.data??[]).filter(row=>String(row.task_id)===taskId),
      materials:(materials.data??[]).filter(row=>String(row.task_id)===taskId),
      evidence:(evidence.data??[]).filter(row=>String(row.task_id)===taskId),
      signoff:(signoffs.data??[]).find(row=>String(row.task_id)===taskId)??null,
    }];
  });

  return <div>
    <div className="headerRow">
      <div>
        <h1>Field Service</h1>
        <p className="muted">Work orders extend canonical CRM Tasks. Booking owns schedule, Task owns technician/status, and private evidence remains authorization-bound.</p>
      </div>
      <span className="status">{views.length} work orders</span>
    </div>
    <FieldServiceActions
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={String(role)}
      businesses={(businesses.data??[]) as Array<Record<string,unknown>>}
      people={(people.data??[]) as Array<Record<string,unknown>>}
      bookings={(bookings.data??[]) as Array<Record<string,unknown>>}
      members={(members.data??[]) as Array<Record<string,unknown>>}
      supportCases={(cases.data??[]) as Array<Record<string,unknown>>}
      workOrders={views as Array<Record<string,unknown>>}
    />
  </div>;
}

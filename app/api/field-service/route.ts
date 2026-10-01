import { NextResponse } from 'next/server';
import { createCrmTask, listCrmTasks } from '@/lib/crm/tasks';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATIONS=new Set(['BOOKING_BRANCH','BUSINESS_ADDRESS','CUSTOMER_CONFIRMED','MANUAL_CONFIRMED','REMOTE']);
const PRIORITIES=new Set(['LOW','NORMAL','HIGH','URGENT']);

function uuid(value:unknown): value is string { return typeof value==='string'&&UUID.test(value); }
function optionalUuid(value:unknown): value is string|null|undefined { return value==null||uuid(value); }
function object(value:unknown): value is Record<string,unknown> { return !!value&&typeof value==='object'&&!Array.isArray(value); }
function text(value:unknown,max:number){ return typeof value==='string'&&value.trim().length<=max?value.trim():''; }
function iso(value:unknown){
  if(value===null||value===undefined||value==='') return null;
  if(typeof value!=='string') return undefined;
  const time=Date.parse(value);
  return Number.isFinite(time)?new Date(time).toISOString():undefined;
}

export async function GET(){
  try{
    const {supabase,organizationId}=await getCurrentOrganization();
    const {data:orders,error}=await supabase.from('field_service_work_orders')
      .select('*').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100);
    if(error) throw error;
    const ids=(orders??[]).map(row=>String(row.task_id));
    const taskPage=await listCrmTasks({supabase,organizationId,includeClosed:true,limit:100});
    const tasks=taskPage.items.filter(task=>ids.includes(task.id));
    return NextResponse.json({orders:orders??[],tasks},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Field Service query failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const {supabase,organizationId,role,userId}=await getCurrentOrganization();
    if(!['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role))){
      return NextResponse.json({error:'Field Service creation is not allowed'},{status:403});
    }
    const parsed=await request.json();
    if(!object(parsed)) return NextResponse.json({error:'Invalid Field Service payload'},{status:400});

    const title=text(parsed.title,240);
    const requestKey=text(parsed.requestKey,200);
    const priority=typeof parsed.priority==='string'?parsed.priority:'NORMAL';
    const businessId=parsed.businessId??null;
    const bookingId=parsed.bookingId??null;
    const supportCaseId=parsed.supportCaseId??null;
    let branchId=parsed.branchId??null;
    let personId=parsed.personId??null;
    const scheduledAt=iso(parsed.scheduledAt);
    let dueAt: string|null=scheduledAt??null;
    const locationSource=typeof parsed.locationSource==='string'?parsed.locationSource:'CUSTOMER_CONFIRMED';
    let locationSnapshot=object(parsed.locationSnapshot)?parsed.locationSnapshot:{};
    const locationReference=text(parsed.locationReference,512)||null;
    const requiresCustomerSignoff=parsed.requiresCustomerSignoff!==false;
    let assigneeUserId=parsed.assigneeUserId??userId;

    if(!title||requestKey.length<1||!PRIORITIES.has(priority)||!LOCATIONS.has(locationSource)
      ||!optionalUuid(businessId)||!optionalUuid(bookingId)||!optionalUuid(supportCaseId)
      ||!optionalUuid(branchId)||!optionalUuid(personId)||!optionalUuid(assigneeUserId)
      ||scheduledAt===undefined){
      return NextResponse.json({error:'Invalid Field Service work-order payload'},{status:400});
    }

    if(role==='SALES_AGENT') assigneeUserId=userId;

    if(assigneeUserId){
      const {data:member,error}=await supabase.from('organization_members').select('user_id,role')
        .eq('organization_id',organizationId).eq('user_id',assigneeUserId)
        .in('role',['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']).maybeSingle();
      if(error||!member) return NextResponse.json({error:'Field Service technician is not assignable'},{status:400});
    }

    if(bookingId){
      const {data:booking,error}=await supabase.from('bookings')
        .select('id,person_id,branch_id,requested_branch_id,starts_at,status')
        .eq('organization_id',organizationId).eq('id',bookingId).maybeSingle();
      if(error||!booking) return NextResponse.json({error:'Booking was not found'},{status:400});
      if(['CANCELED','NO_SHOW'].includes(String(booking.status))){
        return NextResponse.json({error:'Canceled/no-show Booking cannot schedule Field Service work'},{status:409});
      }
      personId=String(booking.person_id);
      branchId=branchId??booking.branch_id??booking.requested_branch_id??null;
      dueAt=booking.starts_at?String(booking.starts_at):null;
    }

    if(locationSource==='BUSINESS_ADDRESS'){
      if(!businessId) return NextResponse.json({error:'Business address location requires Business'},{status:400});
      const {data:business,error}=await supabase.from('businesses').select('id,formatted_address,city,country_code')
        .eq('organization_id',organizationId).eq('id',businessId).maybeSingle();
      if(error||!business) return NextResponse.json({error:'Business was not found'},{status:400});
      locationSnapshot={
        formattedAddress: business.formatted_address??undefined,
        city: business.city??undefined,
        countryCode: business.country_code??undefined,
        source:'CANONICAL_BUSINESS',
      };
    }

    if((locationSource==='CUSTOMER_CONFIRMED'||locationSource==='MANUAL_CONFIRMED')
      && typeof locationSnapshot.formattedAddress!=='string'){
      return NextResponse.json({error:'Confirmed location requires formattedAddress'},{status:400});
    }
    if(locationSource==='BOOKING_BRANCH'&&(!bookingId||!branchId)){
      return NextResponse.json({error:'BOOKING_BRANCH requires Booking and Branch'},{status:400});
    }

    const task=await createCrmTask({
      supabase,
      organizationId,
      actorUserId:userId,
      businessId:businessId as string|null,
      personId:null,
      taskType:'FIELD_SERVICE',
      title,
      priority:priority as 'LOW'|'NORMAL'|'HIGH'|'URGENT',
      assigneeUserId:assigneeUserId as string|null,
      dueAt,
      requestKey,
      metadata:{fieldService:true,bookingId:bookingId??null},
    });

    if(personId){
      const service=createSupabaseServiceClient();
      const {error:personLinkError}=await service.rpc('link_crm_customer360_person_context',{
        p_organization_id:organizationId,
        p_actor_user_id:userId,
        p_entity_type:'TASK',
        p_entity_id:task.id,
        p_person_id:personId as string,
        p_verification_method:'IMPORT_VERIFIED',
        p_source_ref:`field-service:${task.id}:${bookingId?'booking':'operator'}`,
        p_evidence:{
          source:bookingId?'FIELD_SERVICE_BOOKING':'FIELD_SERVICE_OPERATOR_SELECTION',
          bookingId:bookingId??null,
          businessId:businessId??null,
        },
      });
      if(personLinkError){
        throw new Error(`Field Service Customer 360 linkage failed: ${personLinkError.message}`);
      }
    }

    const {data:workOrder,error:workError}=await supabase.from('field_service_work_orders').upsert({
      task_id:task.id,organization_id:organizationId,booking_id:bookingId,
      support_case_id:supportCaseId,branch_id:branchId,location_source:locationSource,
      location_reference:locationReference,location_snapshot:locationSnapshot,
      requires_customer_signoff:requiresCustomerSignoff,
    },{onConflict:'task_id',ignoreDuplicates:true}).select('*').single();
    if(workError) throw new Error(`Field Service work-order persistence failed: ${workError.message}`);

    const checklist=Array.isArray(parsed.checklist)?parsed.checklist.slice(0,50):[];
    if(checklist.length){
      const rows=checklist.map((item,index)=>{
        const row=object(item)?item:{};
        const label=text(row.label,500);
        if(!label) throw new Error('Field Service checklist label is invalid');
        return {organization_id:organizationId,task_id:task.id,position:index+1,label,required:row.required!==false};
      });
      const {error}=await supabase.from('field_service_checklist_items').upsert(rows,{onConflict:'organization_id,task_id,position',ignoreDuplicates:true});
      if(error) throw new Error(`Field Service checklist persistence failed: ${error.message}`);
    }

    return NextResponse.json({task,workOrder},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:'Field Service creation failed';
    const status=/permission|row-level|not allowed/i.test(message)?403:409;
    return NextResponse.json({error:message},{status});
  }
}

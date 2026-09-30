import { NextResponse } from 'next/server';
import { loadFieldServiceTask, canManageFieldServiceTask } from '@/lib/field-service/work-orders';
import { updateCrmTask } from '@/lib/crm/tasks';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

function object(value:unknown): value is Record<string,unknown> { return !!value&&typeof value==='object'&&!Array.isArray(value); }
function str(value:unknown,max:number){ return typeof value==='string'&&value.trim().length<=max?value.trim():''; }

export async function PATCH(request:Request,{params}:{params:Promise<{taskId:string}>}){
  try{
    const {taskId}=await params;
    const {supabase,organizationId,role,userId}=await getCurrentOrganization();
    const loaded=await loadFieldServiceTask({supabase,organizationId,taskId});
    if(!canManageFieldServiceTask({role:String(role),userId,assigneeUserId:loaded.task.assignee_user_id})){
      return NextResponse.json({error:'Field Service action is not allowed'},{status:403});
    }
    const body=await request.json();
    if(!object(body)||typeof body.action!=='string') return NextResponse.json({error:'Invalid Field Service action'},{status:400});

    if(body.action==='SET_WORK_ORDER'){
      const patch:Record<string,unknown>={};
      if(Object.prototype.hasOwnProperty.call(body,'completionSummary')){
        const summary=body.completionSummary==null?null:str(body.completionSummary,4000);
        if(body.completionSummary!=null&&!summary) return NextResponse.json({error:'Invalid completion summary'},{status:400});
        patch.completion_summary=summary;
      }
      if(Object.prototype.hasOwnProperty.call(body,'requiresCustomerSignoff')) patch.requires_customer_signoff=body.requiresCustomerSignoff!==false;
      const {data,error}=await supabase.from('field_service_work_orders').update(patch)
        .eq('organization_id',organizationId).eq('task_id',taskId).eq('version',loaded.workOrder.version)
        .select('*').maybeSingle();
      if(error) throw error;
      if(!data) return NextResponse.json({error:'Field Service work order version conflict'},{status:409});
      return NextResponse.json({workOrder:data});
    }

    if(body.action==='ADD_CHECKLIST'){
      const label=str(body.label,500);
      if(!label) return NextResponse.json({error:'Checklist label is required'},{status:400});
      const {data:last}=await supabase.from('field_service_checklist_items').select('position')
        .eq('organization_id',organizationId).eq('task_id',taskId)
        .order('position',{ascending:false}).limit(1).maybeSingle();
      const position=Number(last?.position??0)+1;
      const {data,error}=await supabase.from('field_service_checklist_items').insert({
        organization_id:organizationId,task_id:taskId,position,label,required:body.required!==false,
      }).select('*').single();
      if(error) throw error;
      return NextResponse.json({item:data},{status:201});
    }

    if(body.action==='SET_CHECKLIST'){
      const itemId=str(body.itemId,80);
      if(!itemId) return NextResponse.json({error:'Checklist item is required'},{status:400});
      const completed=body.completed===true;
      const note=body.completionNote==null?null:str(body.completionNote,2000);
      const {data,error}=await supabase.from('field_service_checklist_items').update({
        completed_at:completed?new Date().toISOString():null,
        completed_by_user_id:completed?userId:null,
        completion_note:note,
      }).eq('organization_id',organizationId).eq('task_id',taskId).eq('id',itemId).select('*').maybeSingle();
      if(error) throw error;
      if(!data) return NextResponse.json({error:'Checklist item not found'},{status:404});
      return NextResponse.json({item:data});
    }

    if(body.action==='ADD_MATERIAL'){
      const materialName=str(body.materialName,240);
      const unit=str(body.unit,40);
      const quantity=Number(body.quantity);
      const note=body.note==null?null:str(body.note,2000);
      const sourceReference=body.sourceReference==null?null:str(body.sourceReference,512);
      if(!materialName||!unit||!Number.isFinite(quantity)||quantity<=0){
        return NextResponse.json({error:'Invalid material usage'},{status:400});
      }
      const {data,error}=await supabase.from('field_service_material_usage').insert({
        organization_id:organizationId,task_id:taskId,material_name:materialName,
        quantity,unit,note,source_reference:sourceReference,inventory_effect:'NONE',
        created_by_user_id:userId,
      }).select('*').single();
      if(error) throw error;
      return NextResponse.json({material:data},{status:201});
    }

    if(body.action==='SIGNOFF'){
      const signerName=str(body.signerName,240);
      const method=body.signoffMethod==='SIGNATURE_EVIDENCE'?'SIGNATURE_EVIDENCE':'TYPED_NAME';
      const evidenceId=typeof body.evidenceId==='string'&&body.evidenceId?body.evidenceId:null;
      if(!signerName||(method==='SIGNATURE_EVIDENCE'&&!evidenceId)){
        return NextResponse.json({error:'Invalid customer sign-off'},{status:400});
      }
      const acceptanceText='Customer confirms the described Field Service work was completed.';
      const {data,error}=await supabase.from('field_service_signoffs').insert({
        organization_id:organizationId,task_id:taskId,signer_name:signerName,
        signoff_method:method,evidence_id:evidenceId,acceptance_text:acceptanceText,
        recorded_by_user_id:userId,
      }).select('*').single();
      if(error) throw error;
      return NextResponse.json({signoff:data},{status:201});
    }

    if(body.action==='TASK_STATUS'){
      const status=typeof body.status==='string'?body.status:'';
      if(!['OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELED'].includes(status)){
        return NextResponse.json({error:'Invalid Field Service status'},{status:400});
      }
      const task=await updateCrmTask({
        supabase,organizationId,taskId,expectedVersion:loaded.task.version,
        patch:{
          status:status as 'OPEN'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CANCELED',
          blockedReason:body.blockedReason==null?undefined:str(body.blockedReason,2000)||null,
          completionNote:body.completionNote==null?undefined:str(body.completionNote,4000)||null,
        },
      });
      return NextResponse.json({task});
    }

    return NextResponse.json({error:'Unsupported Field Service action'},{status:400});
  }catch(error){
    const message=error instanceof Error?error.message:'Field Service action failed';
    const status=/not found/i.test(message)?404:/permission|not allowed|row-level/i.test(message)?403:/version conflict/i.test(message)?409:400;
    return NextResponse.json({error:message},{status});
  }
}

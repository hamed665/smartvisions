import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  FIELD_SERVICE_ALLOWED_MIME_TYPES,FIELD_SERVICE_BUCKET,FIELD_SERVICE_EVIDENCE_TYPES,
  FIELD_SERVICE_MAX_FILE_BYTES,assertFieldServiceObjectPath,canManageFieldServiceTask,
  loadFieldServiceTask,safeEvidenceFilename,
} from '@/lib/field-service/work-orders';

export const dynamic='force-dynamic';

export async function POST(request:Request,{params}:{params:Promise<{taskId:string}>}){
  try{
    const {taskId}=await params;
    const {supabase,organizationId,role,userId}=await getCurrentOrganization();
    const loaded=await loadFieldServiceTask({supabase,organizationId,taskId});
    if(!canManageFieldServiceTask({role:String(role),userId,assigneeUserId:loaded.task.assignee_user_id})){
      return NextResponse.json({error:'Field Service evidence finalization is not allowed'},{status:403});
    }
    const body=await request.json() as Record<string,unknown>;
    const evidenceId=typeof body.evidenceId==='string'?body.evidenceId:'';
    const path=typeof body.path==='string'?body.path:'';
    const filename=typeof body.filename==='string'?body.filename.trim():'';
    const contentType=typeof body.contentType==='string'?body.contentType.trim():'';
    const sizeBytes=Number(body.sizeBytes);
    const evidenceType=typeof body.evidenceType==='string'?body.evidenceType:'';
    const caption=typeof body.caption==='string'&&body.caption.trim()?body.caption.trim().slice(0,1000):null;
    if(!evidenceId||!filename||filename.length>255
      ||!FIELD_SERVICE_ALLOWED_MIME_TYPES.includes(contentType as typeof FIELD_SERVICE_ALLOWED_MIME_TYPES[number])
      ||!FIELD_SERVICE_EVIDENCE_TYPES.includes(evidenceType as typeof FIELD_SERVICE_EVIDENCE_TYPES[number])
      ||!Number.isInteger(sizeBytes)||sizeBytes<1||sizeBytes>FIELD_SERVICE_MAX_FILE_BYTES
      ||((evidenceType==='PHOTO'||evidenceType==='SIGNATURE')&&!contentType.startsWith('image/'))){
      return NextResponse.json({error:'Invalid Field Service evidence metadata'},{status:400});
    }
    assertFieldServiceObjectPath({path,organizationId,taskId,evidenceId});
    const service=createSupabaseServiceClient();
    const prefix=`${organizationId}/${taskId}/${evidenceId}`;
    const {data:objects,error:listError}=await service.storage.from(FIELD_SERVICE_BUCKET)
      .list(prefix,{limit:10,search:safeEvidenceFilename(filename)});
    if(listError) throw new Error(`Field Service evidence verification failed: ${listError.message}`);
    const object=objects?.find(item=>item.name===safeEvidenceFilename(filename));
    if(!object) return NextResponse.json({error:'Uploaded Field Service evidence was not found'},{status:409});
    const metadata=(object.metadata??{}) as Record<string,unknown>;
    const storedSize=Number(metadata.size??sizeBytes);
    if(Number.isFinite(storedSize)&&storedSize!==sizeBytes){
      return NextResponse.json({error:'Field Service evidence size mismatch'},{status:409});
    }
    const storedMime=typeof metadata.mimetype==='string'
      ?metadata.mimetype
      :typeof metadata.contentType==='string'?metadata.contentType:'';
    if(storedMime&&storedMime!==contentType){
      return NextResponse.json({error:'Field Service evidence content type mismatch'},{status:409});
    }
    const {data,error}=await service.from('field_service_evidence').insert({
      id:evidenceId,organization_id:organizationId,task_id:taskId,evidence_type:evidenceType,
      storage_bucket:FIELD_SERVICE_BUCKET,object_path:path,filename,content_type:contentType,
      size_bytes:sizeBytes,caption,uploaded_by_user_id:userId,
    }).select('*').single();
    if(error) throw new Error(`Field Service evidence metadata failed: ${error.message}`);
    return NextResponse.json({evidence:data},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:'Field Service evidence finalization failed';
    return NextResponse.json({error:message},{status:/not allowed|permission|row-level/i.test(message)?403:409});
  }
}

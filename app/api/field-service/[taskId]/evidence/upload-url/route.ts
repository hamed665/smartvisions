import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  FIELD_SERVICE_ALLOWED_MIME_TYPES,FIELD_SERVICE_BUCKET,FIELD_SERVICE_MAX_FILE_BYTES,
  FIELD_SERVICE_EVIDENCE_TYPES,canManageFieldServiceTask,fieldServiceObjectPath,loadFieldServiceTask,
} from '@/lib/field-service/work-orders';

export const dynamic='force-dynamic';

export async function POST(request:Request,{params}:{params:Promise<{taskId:string}>}){
  try{
    const {taskId}=await params;
    const {supabase,organizationId,role,userId}=await getCurrentOrganization();
    const loaded=await loadFieldServiceTask({supabase,organizationId,taskId});
    if(!canManageFieldServiceTask({role:String(role),userId,assigneeUserId:loaded.task.assignee_user_id})){
      return NextResponse.json({error:'Field Service evidence upload is not allowed'},{status:403});
    }
    const body=await request.json() as Record<string,unknown>;
    const filename=typeof body.filename==='string'?body.filename.trim():'';
    const contentType=typeof body.contentType==='string'?body.contentType.trim():'';
    const sizeBytes=Number(body.sizeBytes);
    const evidenceType=typeof body.evidenceType==='string'?body.evidenceType:'';
    if(!filename||filename.length>255
      ||!FIELD_SERVICE_ALLOWED_MIME_TYPES.includes(contentType as typeof FIELD_SERVICE_ALLOWED_MIME_TYPES[number])
      ||!Number.isInteger(sizeBytes)||sizeBytes<1||sizeBytes>FIELD_SERVICE_MAX_FILE_BYTES
      ||!FIELD_SERVICE_EVIDENCE_TYPES.includes(evidenceType as typeof FIELD_SERVICE_EVIDENCE_TYPES[number])
      ||((evidenceType==='PHOTO'||evidenceType==='SIGNATURE')&&!contentType.startsWith('image/'))){
      return NextResponse.json({error:'Invalid Field Service evidence file'},{status:400});
    }
    const evidenceId=crypto.randomUUID();
    const path=fieldServiceObjectPath({organizationId,taskId,evidenceId,filename});
    const service=createSupabaseServiceClient();
    const {data,error}=await service.storage.from(FIELD_SERVICE_BUCKET).createSignedUploadUrl(path);
    if(error||!data) throw new Error(`Field Service signed upload failed: ${error?.message??'unknown error'}`);
    return NextResponse.json({evidenceId,path,token:data.token,signedUrl:data.signedUrl});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Field Service upload preparation failed'},{status:503});
  }
}

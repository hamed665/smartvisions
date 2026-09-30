import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { FIELD_SERVICE_BUCKET,loadFieldServiceTask } from '@/lib/field-service/work-orders';

export const dynamic='force-dynamic';

export async function GET(_request:Request,{params}:{params:Promise<{taskId:string;evidenceId:string}>}){
  try{
    const {taskId,evidenceId}=await params;
    const {supabase,organizationId}=await getCurrentOrganization();
    await loadFieldServiceTask({supabase,organizationId,taskId});
    const {data:evidence,error}=await supabase.from('field_service_evidence')
      .select('id,object_path,filename').eq('organization_id',organizationId)
      .eq('task_id',taskId).eq('id',evidenceId).maybeSingle();
    if(error||!evidence) return NextResponse.json({error:'Field Service evidence not found'},{status:404});
    const service=createSupabaseServiceClient();
    const {data,error:signError}=await service.storage.from(FIELD_SERVICE_BUCKET)
      .createSignedUrl(String(evidence.object_path),60,{download:String(evidence.filename)});
    if(signError||!data) throw new Error('Field Service evidence signing failed');
    return NextResponse.redirect(data.signedUrl,{status:302});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Field Service evidence unavailable'},{status:404});
  }
}

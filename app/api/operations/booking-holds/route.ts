import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export async function POST(request:Request){
  const authError=requireInternalApiKey(request);
  if(authError) return authError;

  const body=await request.json().catch(()=>({})) as {limit?:number};
  const raw=Number(body.limit);
  const limit=Number.isFinite(raw)?Math.max(1,Math.min(1000,Math.round(raw))):200;
  const supabase=createSupabaseServiceClient();
  const {data,error}=await supabase.rpc('expire_booking_holds',{p_limit:limit});
  if(error) return NextResponse.json({error:error.message},{status:503});
  return NextResponse.json({expired:Number(data??0)});
}

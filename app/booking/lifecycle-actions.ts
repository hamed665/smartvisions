'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function required(formData:FormData,key:string){
  const value=String(formData.get(key)??'').trim();
  if(!value) throw new Error(key+' is required');
  return value;
}

function optional(formData:FormData,key:string){
  const value=String(formData.get(key)??'').trim();
  return value||null;
}

function requestKey(formData:FormData,prefix:string){
  const explicit=String(formData.get('request_key')??'').trim();
  return explicit||prefix+crypto.randomUUID();
}

function refresh(){
  revalidatePath('/booking/lifecycle');
  revalidatePath('/booking/availability');
}

export async function createBookingRequest(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('request_booking',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_person_id:required(formData,'person_id'),
    p_lead_id:optional(formData,'lead_id'),
    p_service_id:required(formData,'service_id'),
    p_requested_branch_id:null,
    p_requested_starts_at:null,
    p_notes:optional(formData,'notes'),
    p_metadata:{source:'OWNER_BOOKING_LIFECYCLE'},
    p_request_key:requestKey(formData,'booking-request:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

export async function holdBookingRequest(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('hold_booking_request',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_booking_id:required(formData,'booking_id'),
    p_hold_id:required(formData,'hold_id'),
    p_request_key:requestKey(formData,'booking-held:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

export async function confirmBooking(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('confirm_booking',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_booking_id:required(formData,'booking_id'),
    p_request_key:requestKey(formData,'booking-confirm:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

export async function rescheduleBooking(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('reschedule_booking',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_booking_id:required(formData,'booking_id'),
    p_new_hold_id:required(formData,'hold_id'),
    p_reason:required(formData,'reason'),
    p_request_key:requestKey(formData,'booking-reschedule:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

export async function cancelBooking(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('cancel_booking',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_booking_id:required(formData,'booking_id'),
    p_reason:required(formData,'reason'),
    p_request_key:requestKey(formData,'booking-cancel:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

export async function finalizeBooking(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const target=required(formData,'target_status').toUpperCase();
  if(target!=='COMPLETED'&&target!=='NO_SHOW') throw new Error('target_status is invalid');
  const {error}=await service.rpc('finalize_booking',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_booking_id:required(formData,'booking_id'),
    p_target_status:target,
    p_reason:optional(formData,'reason'),
    p_request_key:requestKey(formData,'booking-finalize:'),
  });
  if(error) throw new Error(error.message);
  refresh();
}

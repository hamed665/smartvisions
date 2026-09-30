'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function required(formData: FormData, key: string) {
  const value=String(formData.get(key)??'').trim();
  if(!value) throw new Error(key+' is required');
  return value;
}
function optional(formData: FormData,key:string){
  const value=String(formData.get(key)??'').trim();
  return value||null;
}
function integer(formData:FormData,key:string,min:number,max:number){
  const value=Number(formData.get(key));
  if(!Number.isInteger(value)||value<min||value>max) throw new Error(key+' is invalid');
  return value;
}

export async function configureBookingAvailabilityCalendar(formData:FormData){
  const ctx=await getCurrentOrganization(true);
  const kind=required(formData,'calendar_kind').toUpperCase();
  const windows:Array<{weekday:number;start:string;end:string}>=[];
  for(let day=0;day<7;day+=1){
    if(formData.get('weekday_'+day+'_enabled')!=='on') continue;
    windows.push({
      weekday:day,
      start:required(formData,'weekday_'+day+'_start'),
      end:required(formData,'weekday_'+day+'_end'),
    });
  }

  const exceptionKind=kind==='BUSINESS'?'HOLIDAY':kind==='STAFF'?'TIME_OFF':'MAINTENANCE';
  const closedDates=String(formData.get('closed_dates')??'')
    .split(/[\n,]+/)
    .map(value=>value.trim())
    .filter(Boolean);
  const exceptions=closedDates.map(date=>({
    kind:exceptionKind,
    availability:'CLOSED',
    date,
    reason:kind==='BUSINESS'?'Holiday / closed day':'Unavailable day',
  }));

  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('configure_booking_availability_calendar',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_service_id:required(formData,'service_id'),
    p_calendar_kind:kind,
    p_branch_id:optional(formData,'branch_id'),
    p_staff_user_id:optional(formData,'staff_user_id'),
    p_resource_id:optional(formData,'resource_id'),
    p_timezone:required(formData,'timezone'),
    p_status:required(formData,'status').toUpperCase(),
    p_windows:windows,
    p_exceptions:exceptions,
    p_request_key:'booking-calendar:'+crypto.randomUUID(),
  });
  if(error) throw new Error(error.message);
  revalidatePath('/booking/availability');
}

export async function createBookingAvailabilityHold(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('create_booking_hold',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_service_id:required(formData,'service_id'),
    p_branch_id:optional(formData,'branch_id'),
    p_starts_at:required(formData,'starts_at'),
    p_ttl_minutes:integer(formData,'ttl_minutes',1,120),
    p_request_key:'booking-hold:'+crypto.randomUUID(),
    p_metadata:{source:'OWNER_AVAILABILITY_PREVIEW'},
  });
  if(error) throw new Error(error.message);
  revalidatePath('/booking/availability');
}

export async function releaseBookingAvailabilityHold(formData:FormData){
  const ctx=await getCurrentOrganization();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('release_booking_hold',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_hold_id:required(formData,'hold_id'),
    p_reason:required(formData,'reason'),
    p_request_key:'booking-hold-release:'+crypto.randomUUID(),
  });
  if(error) throw new Error(error.message);
  revalidatePath('/booking/availability');
}

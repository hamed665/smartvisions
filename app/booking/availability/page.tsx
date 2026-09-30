import { DateTime } from 'luxon';
import {
  configureBookingAvailabilityCalendar,
  createBookingAvailabilityHold,
  releaseBookingAvailabilityHold,
} from '@/app/booking/availability-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic='force-dynamic';

type Search = {
  service?: string;
  branch?: string;
  from?: string;
  to?: string;
  timezone?: string;
};

const DAYS=[
  ['0','Sunday'],['1','Monday'],['2','Tuesday'],['3','Wednesday'],
  ['4','Thursday'],['5','Friday'],['6','Saturday'],
] as const;

function scalar(value:string|string[]|undefined){
  return Array.isArray(value)?value[0]:value;
}

export default async function BookingAvailabilityPage({
  searchParams,
}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
  const query=await searchParams;
  const ctx=await getCurrentOrganization();
  const directory=createSupabaseServiceClient();

  const [
    {data:services},
    {data:profiles},
    {data:branches},
    {data:members},
    {data:resources},
    {data:calendars},
    {data:windows},
    {data:exceptions},
    {data:holds},
    {data:markets},
  ]=await Promise.all([
    ctx.supabase.from('services')
      .select('id,name,enabled')
      .eq('organization_id',ctx.organizationId)
      .order('name'),
    ctx.supabase.from('service_booking_profiles')
      .select('service_id,booking_enabled,location_mode,staff_mode')
      .eq('organization_id',ctx.organizationId),
    ctx.supabase.from('branches')
      .select('id,name,code,timezone,status')
      .eq('organization_id',ctx.organizationId)
      .eq('status','ACTIVE')
      .order('name'),
    directory.from('organization_members')
      .select('user_id,role')
      .eq('organization_id',ctx.organizationId)
      .order('role'),
    ctx.supabase.from('booking_resources')
      .select('id,code,name,branch_id,status')
      .eq('organization_id',ctx.organizationId)
      .eq('status','ACTIVE')
      .order('code'),
    ctx.supabase.from('booking_availability_calendars')
      .select('id,service_id,calendar_kind,branch_id,staff_user_id,resource_id,timezone,status,updated_at')
      .eq('organization_id',ctx.organizationId)
      .order('service_id'),
    ctx.supabase.from('booking_availability_windows')
      .select('calendar_id,weekday,start_local,end_local')
      .eq('organization_id',ctx.organizationId)
      .order('weekday'),
    ctx.supabase.from('booking_availability_exceptions')
      .select('calendar_id,exception_kind,availability,starts_at,ends_at,reason')
      .eq('organization_id',ctx.organizationId)
      .order('starts_at'),
    ctx.supabase.from('booking_holds')
      .select('id,service_id,branch_id,staff_user_id,starts_at,ends_at,expires_at,status,request_key')
      .eq('organization_id',ctx.organizationId)
      .eq('status','ACTIVE')
      .order('starts_at'),
    ctx.supabase.from('market_settings')
      .select('timezone')
      .eq('organization_id',ctx.organizationId)
      .eq('enabled',true),
  ]);

  const profileByService=new Map((profiles??[]).map(row=>[row.service_id,row]));
  const bookable=(services??[]).filter(service=>
    service.enabled && profileByService.get(service.id)?.booking_enabled===true
  );
  const editable=ctx.role==='OWNER';

  const timezoneOptions=Array.from(new Set([
    ...(branches??[]).map(row=>row.timezone).filter((value):value is string=>Boolean(value)),
    ...(markets??[]).map(row=>row.timezone).filter((value):value is string=>Boolean(value)&&value!=='lead_specific'),
    ...(calendars??[]).map(row=>row.timezone).filter(Boolean),
    'UTC',
  ])).sort();

  const windowByCalendar=new Map<string,typeof windows>();
  for(const row of windows??[]){
    const list=windowByCalendar.get(String(row.calendar_id))??[];
    list.push(row);
    windowByCalendar.set(String(row.calendar_id),list);
  }
  const exceptionByCalendar=new Map<string,typeof exceptions>();
  for(const row of exceptions??[]){
    const list=exceptionByCalendar.get(String(row.calendar_id))??[];
    list.push(row);
    exceptionByCalendar.set(String(row.calendar_id),list);
  }

  const previewService=scalar(query.service);
  const previewBranch=scalar(query.branch)||null;
  const previewTimezone=scalar(query.timezone);
  const localFrom=scalar(query.from);
  const localTo=scalar(query.to);
  let preview:Array<Record<string,unknown>>=[];
  let previewError:string|null=null;

  if(previewService&&previewTimezone&&localFrom&&localTo){
    const from=DateTime.fromISO(localFrom,{zone:previewTimezone});
    const to=DateTime.fromISO(localTo,{zone:previewTimezone});
    if(!from.isValid||!to.isValid){
      previewError='Preview date/time is invalid for the selected timezone.';
    }else{
      const {data,error}=await directory.rpc('get_booking_availability',{
        p_organization_id:ctx.organizationId,
        p_service_id:previewService,
        p_branch_id:previewBranch,
        p_from:from.toUTC().toISO(),
        p_to:to.toUTC().toISO(),
        p_limit:100,
      });
      if(error) previewError=error.message;
      else preview=(data??[]) as Array<Record<string,unknown>>;
    }
  }

  return <div>
    <div className="headerRow">
      <div>
        <h1>Booking Availability</h1>
        <p className="muted">
          Timezone-aware business hours, staff calendars, holidays, conflicts, capacity and temporary holds.
        </p>
      </div>
      <span className="status">{bookable.length} bookable services</span>
    </div>

    <section className="panel">
      <h2>Configure availability calendar</h2>
      <p className="muted smallText">
        BUSINESS hours are required for slots. STAFF calendars are required for eligible staff.
        RESOURCE calendars are optional restrictions for maintenance or special hours.
      </p>
      {bookable.length ? <form action={configureBookingAvailabilityCalendar} className="settingsCreate">
        <div className="settingsGrid">
          <label>Service
            <select name="service_id" required disabled={!editable}>
              {bookable.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label>Calendar type
            <select name="calendar_kind" required defaultValue="BUSINESS" disabled={!editable}>
              <option value="BUSINESS">Business hours</option>
              <option value="STAFF">Staff calendar</option>
              <option value="RESOURCE">Resource calendar</option>
            </select>
          </label>
          <label>Branch (optional)
            <select name="branch_id" defaultValue="" disabled={!editable}>
              <option value="">Remote / fallback</option>
              {(branches??[]).map(branch=>
                <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>
              )}
            </select>
          </label>
          <label>Staff (STAFF only)
            <select name="staff_user_id" defaultValue="" disabled={!editable}>
              <option value="">Not a staff calendar</option>
              {(members??[]).map(member=>
                <option key={member.user_id} value={member.user_id}>
                  {member.role} · {String(member.user_id).slice(0,8)}
                </option>
              )}
            </select>
          </label>
          <label>Resource (RESOURCE only)
            <select name="resource_id" defaultValue="" disabled={!editable}>
              <option value="">Not a resource calendar</option>
              {(resources??[]).map(resource=>
                <option key={resource.id} value={resource.id}>{resource.code} · {resource.name}</option>
              )}
            </select>
          </label>
          <label>Timezone
            <select name="timezone" required disabled={!editable}>
              {timezoneOptions.map(zone=><option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue="ACTIVE" disabled={!editable}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>

        <h3>Weekly hours</h3>
        <div className="settingsGrid">
          {DAYS.map(([day,label])=><div key={day}>
            <label className="toggleLabel">
              <input type="checkbox" name={'weekday_'+day+'_enabled'} defaultChecked disabled={!editable}/>
              {label}
            </label>
            <label>Start
              <input type="time" name={'weekday_'+day+'_start'} defaultValue="09:00" disabled={!editable}/>
            </label>
            <label>End
              <input type="time" name={'weekday_'+day+'_end'} defaultValue="17:00" disabled={!editable}/>
            </label>
          </div>)}
        </div>

        <label>Closed dates / holidays
          <textarea
            name="closed_dates"
            placeholder={'2026-11-18\n2026-12-02'}
            disabled={!editable}
          />
        </label>
        <button disabled={!editable}>Save calendar</button>
      </form> : <p className="muted">
        No service is bookable yet. Enable Booking for a canonical service on the Services page first.
      </p>}
    </section>

    <section className="panel">
      <h2>Configured calendars</h2>
      {(calendars??[]).length ? <div className="settingsList">
        {(calendars??[]).map(calendar=>{
          const calendarWindows=windowByCalendar.get(String(calendar.id))??[];
          const calendarExceptions=exceptionByCalendar.get(String(calendar.id))??[];
          return <div className="settingsRow" key={calendar.id}>
            <div>
              <strong>{calendar.service_id} · {calendar.calendar_kind}</strong>
              <span className="muted smallText">
                {calendar.timezone} · {calendar.status}
                {calendar.branch_id?' · branch '+String(calendar.branch_id).slice(0,8):''}
                {calendar.staff_user_id?' · staff '+String(calendar.staff_user_id).slice(0,8):''}
                {calendar.resource_id?' · resource '+String(calendar.resource_id).slice(0,8):''}
              </span>
            </div>
            <div>
              <span className="status">{calendarWindows.length} weekly windows</span>
              <span className="status">{calendarExceptions.length} exceptions</span>
            </div>
          </div>;
        })}
      </div> : <p className="muted">No availability calendars configured.</p>}
    </section>

    <section className="panel">
      <h2>Deterministic availability preview</h2>
      <form method="get" className="settingsCreate">
        <div className="settingsGrid">
          <label>Service
            <select name="service" required defaultValue={previewService??''}>
              <option value="" disabled>Select service</option>
              {bookable.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label>Branch
            <select name="branch" defaultValue={previewBranch??''}>
              <option value="">Remote / all eligible branches</option>
              {(branches??[]).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label>Input timezone
            <select name="timezone" required defaultValue={previewTimezone??timezoneOptions[0]}>
              {timezoneOptions.map(zone=><option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label>From
            <input type="datetime-local" name="from" required defaultValue={localFrom??''}/>
          </label>
          <label>To
            <input type="datetime-local" name="to" required defaultValue={localTo??''}/>
          </label>
        </div>
        <button>Preview slots</button>
      </form>
      {previewError?<p className="muted">{previewError}</p>:null}
      {preview.length?<div className="settingsList">
        {preview.map((slot,index)=>{
          const startsAt=String(slot.slot_start_at??'');
          const branchId=slot.resolved_branch_id?String(slot.resolved_branch_id):'';
          return <div className="settingsRow" key={startsAt+'-'+branchId+'-'+index}>
            <div>
              <strong>{startsAt}</strong>
              <span className="muted smallText">
                Ends {String(slot.slot_end_at??'')} · {String(slot.resolved_timezone??'')}
                {' · capacity '+String(slot.remaining_capacity??0)}
              </span>
            </div>
            {editable&&previewService?<form action={createBookingAvailabilityHold}>
              <input type="hidden" name="service_id" value={previewService}/>
              <input type="hidden" name="branch_id" value={branchId}/>
              <input type="hidden" name="starts_at" value={startsAt}/>
              <input type="hidden" name="ttl_minutes" value="10"/>
              <button>Create 10m hold</button>
            </form>:null}
          </div>;
        })}
      </div>:previewService&&!previewError?<p className="muted">No available slots in this range.</p>:null}
    </section>

    <section className="panel">
      <h2>Active holds</h2>
      {(holds??[]).length?<div className="settingsList">
        {(holds??[]).map(hold=><div className="settingsRow" key={hold.id}>
          <div>
            <strong>{hold.service_id} · {hold.starts_at}</strong>
            <span className="muted smallText">
              staff {String(hold.staff_user_id).slice(0,8)} · expires {hold.expires_at}
            </span>
          </div>
          {editable?<form action={releaseBookingAvailabilityHold}>
            <input type="hidden" name="hold_id" value={hold.id}/>
            <input type="hidden" name="reason" value="OWNER_RELEASE"/>
            <button>Release</button>
          </form>:null}
        </div>)}
      </div>:<p className="muted">No active Booking holds.</p>}
    </section>
  </div>;
}

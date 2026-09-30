import {
  cancelBooking,
  confirmBooking,
  createBookingRequest,
  finalizeBooking,
  holdBookingRequest,
  rescheduleBooking,
} from '@/app/booking/lifecycle-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

const TERMINAL=new Set(['CANCELED','COMPLETED','NO_SHOW']);

export default async function BookingLifecyclePage(){
  const ctx=await getCurrentOrganization();
  const [
    {data:bookings},
    {data:events},
    {data:people},
    {data:services},
    {data:profiles},
    {data:holds},
  ]=await Promise.all([
    ctx.supabase.from('bookings')
      .select('id,booking_reference,person_id,lead_id,service_id,branch_id,staff_user_id,starts_at,ends_at,status,current_hold_id,cancel_reason,confirmed_at,rescheduled_at,canceled_at,completed_at,no_show_at,created_at,updated_at')
      .eq('organization_id',ctx.organizationId)
      .order('created_at',{ascending:false})
      .limit(100),
    ctx.supabase.from('booking_lifecycle_events')
      .select('id,booking_id,transition,from_status,to_status,reason,actor_user_id,occurred_at')
      .eq('organization_id',ctx.organizationId)
      .order('occurred_at',{ascending:false})
      .limit(200),
    ctx.supabase.from('crm_people')
      .select('id,display_name,status')
      .eq('organization_id',ctx.organizationId)
      .eq('status','ACTIVE')
      .order('display_name')
      .limit(500),
    ctx.supabase.from('services')
      .select('id,name,enabled')
      .eq('organization_id',ctx.organizationId)
      .order('name'),
    ctx.supabase.from('service_booking_profiles')
      .select('service_id,booking_enabled')
      .eq('organization_id',ctx.organizationId),
    ctx.supabase.from('booking_holds')
      .select('id,service_id,branch_id,staff_user_id,starts_at,ends_at,expires_at,status')
      .eq('organization_id',ctx.organizationId)
      .eq('status','ACTIVE')
      .order('starts_at'),
  ]);

  const profileByService=new Map((profiles??[]).map(row=>[row.service_id,row]));
  const bookable=(services??[]).filter(service=>
    service.enabled && profileByService.get(service.id)?.booking_enabled===true
  );
  const serviceName=new Map((services??[]).map(service=>[String(service.id),String(service.name)]));
  const personName=new Map((people??[]).map(person=>[
    String(person.id),
    String(person.display_name??String(person.id).slice(0,8)),
  ]));
  const eventByBooking=new Map<string,Array<Record<string,unknown>>>();
  for(const event of events??[]){
    const key=String(event.booking_id);
    const list=eventByBooking.get(key)??[];
    list.push(event as Record<string,unknown>);
    eventByBooking.set(key,list);
  }

  const editable=['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(ctx.role);

  return <div>
    <div className="headerRow">
      <div>
        <h1>Bookings</h1>
        <p className="muted">
          Canonical requested, held, confirmed, rescheduled, canceled, completed and no-show lifecycle.
        </p>
      </div>
      <span className="status">{(bookings??[]).length} recent bookings</span>
    </div>

    <section className="panel">
      <h2>New booking request</h2>
      <p className="muted smallText">
        A request does not reserve capacity. Create a temporary hold from Booking Availability, then attach it here.
      </p>
      {bookable.length && (people??[]).length ? <form action={createBookingRequest} className="settingsCreate">
        <div className="settingsGrid">
          <label>Customer
            <select name="person_id" required disabled={!editable}>
              {(people??[]).map(person=>
                <option key={person.id} value={person.id}>
                  {person.display_name??String(person.id).slice(0,8)}
                </option>
              )}
            </select>
          </label>
          <label>Service
            <select name="service_id" required disabled={!editable}>
              {bookable.map(service=>
                <option key={service.id} value={service.id}>{service.name}</option>
              )}
            </select>
          </label>
        </div>
        <label>Internal notes
          <textarea name="notes" maxLength={2000} disabled={!editable}/>
        </label>
        <button disabled={!editable}>Create request</button>
      </form> : <p className="muted">
        A Booking request needs at least one active canonical CRM Person and one bookable service.
      </p>}
    </section>

    <section className="panel">
      <h2>Lifecycle queue</h2>
      {(bookings??[]).length ? <div className="settingsList">
        {(bookings??[]).map(booking=>{
          const bookingEvents=eventByBooking.get(String(booking.id))??[];
          const matchingHolds=(holds??[]).filter(hold=>hold.service_id===booking.service_id);
          const canFinalize=['CONFIRMED','RESCHEDULED'].includes(String(booking.status));

          return <div className="settingsRow" key={booking.id}>
            <div>
              <strong>{booking.booking_reference} · {serviceName.get(String(booking.service_id))??booking.service_id}</strong>
              <span className="muted smallText">
                {personName.get(String(booking.person_id))??String(booking.person_id).slice(0,8)}
                {' · '+booking.status}
                {booking.starts_at?' · '+booking.starts_at:''}
                {booking.staff_user_id?' · staff '+String(booking.staff_user_id).slice(0,8):''}
              </span>
              {booking.cancel_reason?<span className="muted smallText">{booking.cancel_reason}</span>:null}
              <span className="muted smallText">{bookingEvents.length} audited transitions</span>
            </div>

            {editable&&!TERMINAL.has(String(booking.status))?<div className="settingsCreate">
              {booking.status==='REQUESTED'?<form action={holdBookingRequest}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <label>Attach active hold
                  <select name="hold_id" required defaultValue="">
                    <option value="" disabled>Select hold</option>
                    {matchingHolds.map(hold=>
                      <option key={hold.id} value={hold.id}>
                        {hold.starts_at} · staff {String(hold.staff_user_id).slice(0,8)}
                      </option>
                    )}
                  </select>
                </label>
                <button disabled={!matchingHolds.length}>Move to HELD</button>
              </form>:null}

              {booking.status==='HELD'?<form action={confirmBooking}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <button>Confirm booking</button>
              </form>:null}

              {['CONFIRMED','RESCHEDULED'].includes(String(booking.status))?<form action={rescheduleBooking}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <input type="hidden" name="reason" value="OPERATOR_RESCHEDULE"/>
                <label>New active hold
                  <select name="hold_id" required defaultValue="">
                    <option value="" disabled>Select hold</option>
                    {matchingHolds.map(hold=>
                      <option key={hold.id} value={hold.id}>
                        {hold.starts_at} · staff {String(hold.staff_user_id).slice(0,8)}
                      </option>
                    )}
                  </select>
                </label>
                <button disabled={!matchingHolds.length}>Reschedule</button>
              </form>:null}

              <form action={cancelBooking}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <input type="hidden" name="reason" value="OPERATOR_CANCELED"/>
                <button>Cancel</button>
              </form>

              {canFinalize?<form action={finalizeBooking}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <input type="hidden" name="target_status" value="COMPLETED"/>
                <input type="hidden" name="reason" value="SERVICE_COMPLETED"/>
                <button>Complete</button>
              </form>:null}

              {canFinalize?<form action={finalizeBooking}>
                <input type="hidden" name="booking_id" value={booking.id}/>
                <input type="hidden" name="target_status" value="NO_SHOW"/>
                <input type="hidden" name="reason" value="CUSTOMER_NO_SHOW"/>
                <button>Mark no-show</button>
              </form>:null}
            </div>:null}
          </div>;
        })}
      </div> : <p className="muted">No Booking lifecycle records yet.</p>}
    </section>

    <section className="panel">
      <h2>Recent transition evidence</h2>
      {(events??[]).length?<div className="settingsList">
        {(events??[]).slice(0,50).map(event=>
          <div className="settingsRow" key={event.id}>
            <div>
              <strong>{event.transition}</strong>
              <span className="muted smallText">
                {String(event.booking_id).slice(0,8)}
                {' · '+String(event.from_status??'∅')+' → '+event.to_status}
                {' · '+event.occurred_at}
              </span>
            </div>
          </div>
        )}
      </div>:<p className="muted">No transition evidence yet.</p>}
    </section>
  </div>;
}

import {
  createBookingResource,
  createService,
  updateBookingResource,
  updateService,
  updateServiceBookingCatalog,
} from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER'] as const;
const RESOURCE_TYPES = ['ROOM','EQUIPMENT','VEHICLE','SPACE','CAPACITY_POOL','OTHER'] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function ServicesPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const directory = createSupabaseServiceClient();
  const [
    { data: serviceData },
    { data: profileData },
    { data: branchData },
    { data: resourceData },
    { data: branchLinks },
    { data: staffLinks },
    { data: resourceLinks },
    { data: staffData },
  ] = await Promise.all([
    supabase.from('services').select('id,name,enabled').eq('organization_id', organizationId).order('name'),
    supabase.from('service_booking_profiles')
      .select('service_id,booking_enabled,duration_minutes,buffer_before_minutes,buffer_after_minutes,capacity_per_slot,location_mode,staff_mode,eligible_staff_roles,booking_rules')
      .eq('organization_id', organizationId),
    supabase.from('branches')
      .select('id,name,code,status,timezone')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .order('name'),
    supabase.from('booking_resources')
      .select('id,branch_id,code,name,resource_type,capacity,status')
      .eq('organization_id', organizationId)
      .order('code'),
    supabase.from('service_booking_branches')
      .select('service_id,branch_id')
      .eq('organization_id', organizationId),
    supabase.from('service_booking_staff')
      .select('service_id,user_id')
      .eq('organization_id', organizationId),
    supabase.from('service_booking_resource_requirements')
      .select('service_id,resource_id,quantity_required')
      .eq('organization_id', organizationId),
    directory.from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .order('role'),
  ]);

  const services = serviceData ?? [];
  const profiles = new Map((profileData ?? []).map(row => [row.service_id, row]));
  const branches = branchData ?? [];
  const resources = resourceData ?? [];
  const staff = staffData ?? [];
  const editable = role === 'OWNER';

  const branchesByService = new Map<string, Set<string>>();
  for (const row of branchLinks ?? []) {
    const set = branchesByService.get(row.service_id) ?? new Set<string>();
    set.add(String(row.branch_id));
    branchesByService.set(row.service_id, set);
  }

  const staffByService = new Map<string, Set<string>>();
  for (const row of staffLinks ?? []) {
    const set = staffByService.get(row.service_id) ?? new Set<string>();
    set.add(String(row.user_id));
    staffByService.set(row.service_id, set);
  }

  const resourcesByService = new Map<string, Map<string, number>>();
  for (const row of resourceLinks ?? []) {
    const map = resourcesByService.get(row.service_id) ?? new Map<string, number>();
    map.set(String(row.resource_id), Number(row.quantity_required));
    resourcesByService.set(row.service_id, map);
  }

  return <div>
    <div className="headerRow">
      <div>
        <h1>Services</h1>
        <p className="muted">Canonical service catalog used by sales, quotations and Booking Operations.</p>
      </div>
      <span className="status">{services.length} services</span>
    </div>

    <div className="settingsList">
      {services.map((service) => {
        const profile = profiles.get(service.id);
        const rules = record(profile?.booking_rules);
        const selectedBranches = branchesByService.get(service.id) ?? new Set<string>();
        const selectedStaff = staffByService.get(service.id) ?? new Set<string>();
        const selectedResources = resourcesByService.get(service.id) ?? new Map<string, number>();
        const eligibleRoles = new Set(
          Array.isArray(profile?.eligible_staff_roles)
            ? profile.eligible_staff_roles.filter((value): value is string => typeof value === 'string')
            : ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'],
        );

        return <section className="panel" key={service.id}>
          <form action={updateService} className="settingsRow">
            <input type="hidden" name="id" value={service.id} />
            <div>
              <strong>{service.id}</strong>
              <span className="muted smallText">Canonical service key</span>
            </div>
            <label>Name<input name="name" defaultValue={service.name} disabled={!editable} /></label>
            <label className="toggleLabel">
              <input type="checkbox" name="enabled" defaultChecked={service.enabled} disabled={!editable} /> Enabled
            </label>
            <button disabled={!editable}>Save service</button>
          </form>

          <form action={updateServiceBookingCatalog} className="settingsCreate">
            <input type="hidden" name="service_id" value={service.id} />
            <div className="headerRow">
              <div>
                <h2>Booking catalog</h2>
                <p className="muted smallText">Duration, eligibility, location, capacity, buffers, resources and booking rules.</p>
              </div>
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  name="booking_enabled"
                  defaultChecked={profile?.booking_enabled === true}
                  disabled={!editable}
                /> Bookable
              </label>
            </div>

            <div className="settingsGrid">
              <label>Duration (minutes)
                <input type="number" name="duration_minutes" min="5" max="1440" defaultValue={profile?.duration_minutes ?? 60} disabled={!editable} />
              </label>
              <label>Buffer before
                <input type="number" name="buffer_before_minutes" min="0" max="1440" defaultValue={profile?.buffer_before_minutes ?? 0} disabled={!editable} />
              </label>
              <label>Buffer after
                <input type="number" name="buffer_after_minutes" min="0" max="1440" defaultValue={profile?.buffer_after_minutes ?? 0} disabled={!editable} />
              </label>
              <label>Capacity / slot
                <input type="number" name="capacity_per_slot" min="1" max="1000" defaultValue={profile?.capacity_per_slot ?? 1} disabled={!editable} />
              </label>
              <label>Location mode
                <select name="location_mode" defaultValue={profile?.location_mode ?? 'REMOTE'} disabled={!editable}>
                  <option value="REMOTE">Remote / no branch</option>
                  <option value="ANY_ACTIVE_BRANCH">Any active branch</option>
                  <option value="EXPLICIT_BRANCHES">Selected branches</option>
                </select>
              </label>
              <label>Staff eligibility
                <select name="staff_mode" defaultValue={profile?.staff_mode ?? 'ANY_ELIGIBLE_ROLE'} disabled={!editable}>
                  <option value="ANY_ELIGIBLE_ROLE">Any eligible role</option>
                  <option value="EXPLICIT_STAFF">Selected staff only</option>
                </select>
              </label>
            </div>

            <h3>Booking rules</h3>
            <div className="settingsGrid">
              <label>Minimum notice (minutes)
                <input type="number" name="minimum_notice_minutes" min="0" max="10080" defaultValue={numberValue(rules.minimumNoticeMinutes, 60)} disabled={!editable} />
              </label>
              <label>Maximum advance (days)
                <input type="number" name="maximum_advance_days" min="1" max="730" defaultValue={numberValue(rules.maximumAdvanceDays, 90)} disabled={!editable} />
              </label>
              <label>Cancellation notice (minutes)
                <input type="number" name="cancellation_notice_minutes" min="0" max="10080" defaultValue={numberValue(rules.cancellationNoticeMinutes, 120)} disabled={!editable} />
              </label>
              <label>Slot increment (minutes)
                <input type="number" name="slot_increment_minutes" min="5" max="720" defaultValue={numberValue(rules.slotIncrementMinutes, 30)} disabled={!editable} />
              </label>
              <label className="toggleLabel">
                <input type="checkbox" name="allow_customer_cancel" defaultChecked={rules.allowCustomerCancel !== false} disabled={!editable} /> Customer can cancel
              </label>
              <label className="toggleLabel">
                <input type="checkbox" name="allow_customer_reschedule" defaultChecked={rules.allowCustomerReschedule !== false} disabled={!editable} /> Customer can reschedule
              </label>
              <label className="toggleLabel">
                <input type="checkbox" name="requires_confirmation" defaultChecked={rules.requiresConfirmation === true} disabled={!editable} /> Requires confirmation
              </label>
            </div>

            <h3>Branch / location eligibility</h3>
            {branches.length ? <div className="settingsGrid">
              {branches.map(branch => <label className="toggleLabel" key={branch.id}>
                <input
                  type="checkbox"
                  name="branch_id"
                  value={branch.id}
                  defaultChecked={selectedBranches.has(String(branch.id))}
                  disabled={!editable}
                />
                {branch.name} · {branch.code}
              </label>)}
            </div> : <p className="muted smallText">No canonical branches exist yet. Use Remote mode until a tenant branch is provisioned.</p>}

            <h3>Eligible staff roles</h3>
            <div className="settingsGrid">
              {STAFF_ROLES.map(staffRole => <label className="toggleLabel" key={staffRole}>
                <input
                  type="checkbox"
                  name="eligible_staff_role"
                  value={staffRole}
                  defaultChecked={eligibleRoles.has(staffRole)}
                  disabled={!editable}
                /> {staffRole}
              </label>)}
            </div>

            <h3>Explicit staff</h3>
            {staff.length ? <div className="settingsGrid">
              {staff.map(member => <label className="toggleLabel" key={member.user_id}>
                <input
                  type="checkbox"
                  name="staff_user_id"
                  value={member.user_id}
                  defaultChecked={selectedStaff.has(String(member.user_id))}
                  disabled={!editable}
                />
                {member.role} · {String(member.user_id).slice(0, 8)}
              </label>)}
            </div> : <p className="muted smallText">No Organization members are available for explicit staff eligibility.</p>}

            <h3>Required resources</h3>
            {resources.filter(resource => resource.status === 'ACTIVE').length ? <div className="settingsGrid">
              {resources.filter(resource => resource.status === 'ACTIVE').map(resource => {
                const quantity = selectedResources.get(String(resource.id));
                return <div key={resource.id}>
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      name="resource_id"
                      value={resource.id}
                      defaultChecked={quantity != null}
                      disabled={!editable}
                    />
                    {resource.name} · {resource.code}
                  </label>
                  <label>Quantity
                    <input
                      type="number"
                      name={'resource_quantity_' + resource.id}
                      min="1"
                      max="100"
                      defaultValue={quantity ?? 1}
                      disabled={!editable}
                    />
                  </label>
                </div>;
              })}
            </div> : <p className="muted smallText">No active booking resources exist yet.</p>}

            <button disabled={!editable}>Save booking catalog</button>
          </form>
        </section>;
      })}
    </div>

    {editable ? <section className="panel settingsCreate">
      <h2>Add service</h2>
      <form action={createService} className="inlineForm">
        <label>Key<input name="id" placeholder="consultation" required /></label>
        <label>Name<input name="name" placeholder="Consultation" required /></label>
        <button>Add service</button>
      </form>
    </section> : null}

    <section className="panel settingsCreate">
      <div className="headerRow">
        <div>
          <h2>Booking resources</h2>
          <p className="muted smallText">Canonical rooms, equipment, vehicles, spaces and capacity pools used by bookable services.</p>
        </div>
        <span className="status">{resources.length} resources</span>
      </div>

      <div className="settingsList">
        {resources.map(resource => <form action={updateBookingResource} className="settingsRow" key={resource.id}>
          <input type="hidden" name="id" value={resource.id} />
          <label>Code<input name="code" defaultValue={resource.code} disabled={!editable} /></label>
          <label>Name<input name="name" defaultValue={resource.name} disabled={!editable} /></label>
          <label>Type
            <select name="resource_type" defaultValue={resource.resource_type} disabled={!editable}>
              {RESOURCE_TYPES.map(type => <option value={type} key={type}>{type}</option>)}
            </select>
          </label>
          <label>Branch
            <select name="branch_id" defaultValue={resource.branch_id ?? ''} disabled={!editable}>
              <option value="">Organization-wide</option>
              {branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label>Capacity<input type="number" min="1" max="1000" name="capacity" defaultValue={resource.capacity} disabled={!editable} /></label>
          <label>Status
            <select name="status" defaultValue={resource.status} disabled={!editable}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <button disabled={!editable}>Save resource</button>
        </form>)}
      </div>

      {editable ? <form action={createBookingResource} className="settingsGrid">
        <label>Code<input name="code" placeholder="ROOM_A" required /></label>
        <label>Name<input name="name" placeholder="Consultation Room A" required /></label>
        <label>Type
          <select name="resource_type" defaultValue="ROOM">
            {RESOURCE_TYPES.map(type => <option value={type} key={type}>{type}</option>)}
          </select>
        </label>
        <label>Branch
          <select name="branch_id" defaultValue="">
            <option value="">Organization-wide</option>
            {branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label>Capacity<input type="number" name="capacity" min="1" max="1000" defaultValue="1" required /></label>
        <button>Add booking resource</button>
      </form> : null}
    </section>
  </div>;
}

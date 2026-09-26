import {
  bootstrapCanonicalOperatingHierarchy,
  bootstrapCanonicalTenant,
  prepareCommunicationPlaneProjection,
  provisionCommunicationPlaneAccount,
  provisionCommunicationPlaneApiInbox,
  provisionCommunicationPlaneOwnerAccess,
  provisionCommunicationPlaneTeam,
} from '@/app/business-os-actions';
import { updateOrganizationSettings } from '@/app/management-actions';
import { loadChatwootReadiness } from '@/lib/chatwoot/readiness';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export default async function SettingsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const [
    { data: settings },
    { data: brands },
    { data: businesses },
    { data: omanMarket },
    { data: communicationBindings },
    { data: accountMappings },
    { data: branches },
    { data: departments },
    { data: teams },
  ] = await Promise.all([
      supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('brands')
        .select('id,name,slug,status')
        .eq('organization_id', organizationId)
        .order('created_at'),
      supabase
        .from('tenant_businesses')
        .select('id,brand_id,name,slug,legal_name,country_code,timezone,status')
        .eq('organization_id', organizationId)
        .order('created_at'),
      supabase
        .from('market_settings')
        .select('country_code,timezone,enabled')
        .eq('organization_id', organizationId)
        .eq('country_code', 'OM')
        .eq('enabled', true)
        .maybeSingle(),
      supabase
        .from('communication_channel_bindings')
        .select('id,tenant_business_id,integration_connection_id,channel,status')
        .eq('organization_id', organizationId)
        .neq('status', 'ARCHIVED')
        .order('created_at'),
      supabase
        .from('chatwoot_account_mappings')
        .select('id,tenant_business_id,chatwoot_account_id,status,version')
        .eq('organization_id', organizationId)
        .neq('status', 'ARCHIVED')
        .order('created_at'),
      supabase
        .from('branches')
        .select('id,tenant_business_id,name,code,country_code,timezone,status')
        .eq('organization_id', organizationId)
        .order('created_at'),
      supabase
        .from('departments')
        .select('id,branch_id,name,code,status')
        .eq('organization_id', organizationId)
        .order('created_at'),
      supabase
        .from('teams')
        .select('id,department_id,name,code,status')
        .eq('organization_id', organizationId)
        .order('created_at'),
    ]);

  const editable = role === 'OWNER';
  const brandName = settings?.brand_name ?? 'Smart Visions';
  const canonicalBrands = brands ?? [];
  const canonicalBusinesses = businesses ?? [];
  const activeBindings = communicationBindings ?? [];
  const liveAccountMappings = accountMappings ?? [];
  const canonicalBranches = branches ?? [];
  const canonicalDepartments = departments ?? [];
  const canonicalTeams = teams ?? [];
  const bootstrapNeeded =
    canonicalBrands.length === 0 || canonicalBusinesses.length === 0;
  const chatwootReadiness = editable
    ? await loadChatwootReadiness({ supabase, organizationId })
    : null;

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Organization identity, operator preferences and default communication behavior.
          </p>
        </div>
        <span className="status">{role}</span>
      </div>

      <section className="panel">
        <h2>Organization settings</h2>
        <form action={updateOrganizationSettings} className="settingsGrid">
          <label>
            Brand name
            <input
              name="brand_name"
              defaultValue={brandName}
              disabled={!editable}
            />
          </label>
          <label>
            Operator language
            <select
              name="operator_language"
              defaultValue={settings?.operator_language ?? 'fa'}
              disabled={!editable}
            >
              <option value="fa">Persian</option>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
          <label>
            Default customer language
            <select
              name="default_customer_language"
              defaultValue={settings?.default_customer_language ?? 'en'}
              disabled={!editable}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="fa">Persian</option>
            </select>
          </label>
          <label>
            Notification email
            <input
              type="email"
              name="notification_email"
              defaultValue={settings?.notification_email ?? ''}
              disabled={!editable}
            />
          </label>
          <button disabled={!editable}>Save settings</button>
        </form>
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <h2>Canonical Business OS scope</h2>
            <p className="muted">
              Real tenant-owned Brand and Business records. These are not Hunter/prospect businesses
              and are required before Chatwoot tenant projection can activate.
            </p>
          </div>
          <span className={`status ${bootstrapNeeded ? 'dangerStatus' : ''}`}>
            {bootstrapNeeded ? 'Bootstrap required' : 'Canonical scope ready'}
          </span>
        </div>

        {bootstrapNeeded ? (
          <>
            <p className="muted smallText">
              Defaults come from the existing organization identity and enabled Oman market.
              Review them before creating Production canonical scope. Legal name is intentionally
              optional rather than guessed.
            </p>
            <form action={bootstrapCanonicalTenant} className="settingsGrid">
              <label>
                Brand name
                <input
                  name="brand_name"
                  defaultValue={brandName}
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Brand slug
                <input
                  name="brand_slug"
                  defaultValue={slugify(brandName) || 'smart-visions'}
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Business name
                <input
                  name="business_name"
                  defaultValue={brandName}
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Business slug
                <input
                  name="business_slug"
                  defaultValue="oman"
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Legal name
                <input
                  name="legal_name"
                  placeholder="Optional — use exact registered name only"
                  disabled={!editable}
                />
              </label>
              <label>
                Country code
                <input
                  name="country_code"
                  defaultValue={omanMarket?.country_code ?? 'OM'}
                  maxLength={2}
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Timezone
                <input
                  name="timezone"
                  defaultValue={omanMarket?.timezone ?? 'Asia/Muscat'}
                  required
                  disabled={!editable}
                />
              </label>
              <button disabled={!editable}>Create canonical Brand &amp; Business</button>
            </form>
          </>
        ) : (
          <div className="settingsList">
            {canonicalBrands.map((brand) => (
              <div className="settingsRow" key={brand.id}>
                <strong>Brand · {brand.name}</strong>
                <span>{brand.slug} · {brand.status}</span>
              </div>
            ))}
            {canonicalBusinesses.map((business) => (
              <div className="settingsRow" key={business.id}>
                <strong>Business · {business.name}</strong>
                <span>
                  {business.slug} · {business.country_code ?? '—'} · {business.timezone ?? '—'} ·{' '}
                  {business.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <h2>Canonical operating hierarchy</h2>
            <p className="muted">
              Branch, Department and Team records remain Smart Core source-of-truth.
              Chatwoot Inbox and Team projections are created only from this hierarchy.
            </p>
          </div>
          <span className="status">
            {canonicalTeams.length > 0 ? 'Hierarchy ready' : 'Hierarchy required'}
          </span>
        </div>

        {canonicalBusinesses.length === 0 ? (
          <p className="muted smallText">
            Create the canonical Business before defining Branch, Department and Team scope.
          </p>
        ) : (
          <>
            {canonicalBusinesses.map((business) => {
              const businessBranches = canonicalBranches.filter(
                (branch) => branch.tenant_business_id === business.id,
              );
              const branchIds = new Set(businessBranches.map((branch) => branch.id));
              const businessDepartments = canonicalDepartments.filter((department) =>
                branchIds.has(department.branch_id),
              );
              const departmentIds = new Set(
                businessDepartments.map((department) => department.id),
              );
              const businessTeams = canonicalTeams.filter((team) =>
                departmentIds.has(team.department_id),
              );

              return (
                <div key={business.id}>
                  <div className="settingsList">
                    <div className="settingsRow">
                      <strong>{business.name}</strong>
                      <span>
                        {businessBranches.length} branch · {businessDepartments.length} department ·{' '}
                        {businessTeams.length} team
                      </span>
                    </div>
                    {businessBranches.map((branch) => (
                      <div className="settingsRow" key={branch.id}>
                        <strong>Branch · {branch.name}</strong>
                        <span>
                          {branch.code} · {branch.country_code ?? business.country_code ?? '—'} ·{' '}
                          {branch.timezone ?? business.timezone ?? '—'} · {branch.status}
                        </span>
                      </div>
                    ))}
                    {businessDepartments.map((department) => (
                      <div className="settingsRow" key={department.id}>
                        <strong>Department · {department.name}</strong>
                        <span>{department.code} · {department.status}</span>
                      </div>
                    ))}
                    {businessTeams.map((team) => (
                      <div className="settingsRow" key={team.id}>
                        <strong>Team · {team.name}</strong>
                        <span>{team.code} · {team.status}</span>
                      </div>
                    ))}
                  </div>

                  <form action={bootstrapCanonicalOperatingHierarchy} className="settingsGrid">
                    <input type="hidden" name="tenant_business_id" value={business.id} />
                    <label>
                      Branch name
                      <input
                        name="branch_name"
                        placeholder="Enter the real Branch name"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Branch code
                      <input
                        name="branch_code"
                        placeholder="e.g. main"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Branch country
                      <input
                        name="branch_country_code"
                        defaultValue={business.country_code ?? ''}
                        maxLength={2}
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Branch timezone
                      <input
                        name="branch_timezone"
                        defaultValue={business.timezone ?? ''}
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Department name
                      <input
                        name="department_name"
                        placeholder="Enter the real Department name"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Department code
                      <input
                        name="department_code"
                        placeholder="e.g. customer-operations"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Team name
                      <input
                        name="team_name"
                        placeholder="Enter the real Team name"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <label>
                      Team code
                      <input
                        name="team_code"
                        placeholder="e.g. customer-care"
                        required
                        disabled={!editable || business.status !== 'ACTIVE'}
                      />
                    </label>
                    <button disabled={!editable || business.status !== 'ACTIVE'}>
                      Create / verify hierarchy
                    </button>
                  </form>
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <h2>Communication Plane projection</h2>
            <p className="muted">
              Prepare the audited Smart Core mapping state for Chatwoot. This step creates only
              tenant-scoped database bindings and does not call Chatwoot or send a provider message.
            </p>
          </div>
          <span className="status">
            {liveAccountMappings.length > 0 ? 'Projection prepared' : 'Not prepared'}
          </span>
        </div>

        {canonicalBusinesses.length === 0 ? (
          <p className="muted smallText">
            Create the canonical Brand and Business first. Projection preparation stays unavailable
            until real tenant scope exists.
          </p>
        ) : (
          <div className="settingsList">
            {canonicalBusinesses.map((business) => {
              const bindings = activeBindings.filter(
                (binding) => binding.tenant_business_id === business.id,
              );
              const accountMapping = liveAccountMappings.find(
                (mapping) => mapping.tenant_business_id === business.id,
              );
              const businessBranches = canonicalBranches.filter(
                (branch) =>
                  branch.tenant_business_id === business.id &&
                  branch.status === 'ACTIVE',
              );
              const branchIds = new Set(businessBranches.map((branch) => branch.id));
              const businessDepartments = canonicalDepartments.filter(
                (department) =>
                  branchIds.has(department.branch_id) &&
                  department.status === 'ACTIVE',
              );
              const departmentIds = new Set(
                businessDepartments.map((department) => department.id),
              );
              const businessTeams = canonicalTeams.filter(
                (team) =>
                  departmentIds.has(team.department_id) &&
                  team.status === 'ACTIVE',
              );
              const ownerAccessPrepared =
                (chatwootReadiness?.projectionCounts.memberships ?? 0) > 0;

              return (
                <div className="settingsRow" key={business.id}>
                  <div>
                    <strong>{business.name}</strong>
                    <span className="muted smallText">
                      {bindings.length > 0
                        ? bindings.map((binding) => binding.channel).join(' + ')
                        : 'No communication bindings'}
                      {' · '}
                      {accountMapping
                        ? `Account mapping ${accountMapping.status}`
                        : 'No Chatwoot Account mapping'}
                    </span>
                  </div>
                  <div>
                    <form action={prepareCommunicationPlaneProjection}>
                      <input
                        type="hidden"
                        name="tenant_business_id"
                        value={business.id}
                      />
                      <button
                        disabled={!editable || business.status !== 'ACTIVE'}
                      >
                        Prepare / verify projection
                      </button>
                    </form>
                    {accountMapping &&
                    accountMapping.status !== 'ACTIVE' ? (
                      <form action={provisionCommunicationPlaneAccount}>
                        <input
                          type="hidden"
                          name="chatwoot_account_mapping_id"
                          value={accountMapping.id}
                        />
                        <button
                          disabled={
                            !editable ||
                            !chatwootReadiness?.liveProvisioningReady
                          }
                        >
                          Provision Chatwoot Account
                        </button>
                      </form>
                    ) : null}
                    {accountMapping?.status === 'ACTIVE' ? (
                      <>
                        <span className="muted smallText">
                          External Account {accountMapping.chatwoot_account_id ?? 'verified'}
                        </span>
                        <form action={provisionCommunicationPlaneOwnerAccess}>
                          <input
                            type="hidden"
                            name="tenant_business_id"
                            value={business.id}
                          />
                          <button
                            disabled={
                              !editable ||
                              !chatwootReadiness?.liveProvisioningReady
                            }
                          >
                            Provision / verify my Chatwoot access
                          </button>
                        </form>

                        {businessBranches.flatMap((branch) =>
                          bindings
                            .filter(
                              (binding) =>
                                binding.status === 'ACTIVE' &&
                                (binding.branch_id === null ||
                                  binding.branch_id === branch.id),
                            )
                            .map((binding) => (
                              <form
                                action={provisionCommunicationPlaneApiInbox}
                                key={`inbox-${branch.id}-${binding.id}`}
                              >
                                <input
                                  type="hidden"
                                  name="tenant_business_id"
                                  value={business.id}
                                />
                                <input type="hidden" name="branch_id" value={branch.id} />
                                <input
                                  type="hidden"
                                  name="communication_channel_binding_id"
                                  value={binding.id}
                                />
                                <input
                                  type="hidden"
                                  name="chatwoot_account_mapping_id"
                                  value={accountMapping.id}
                                />
                                <button
                                  disabled={
                                    !editable ||
                                    !chatwootReadiness?.liveProvisioningReady ||
                                    !ownerAccessPrepared
                                  }
                                >
                                  Provision / verify {binding.channel} API Inbox · {branch.name}
                                </button>
                              </form>
                            )),
                        )}

                        {businessTeams.map((team) => (
                          <form
                            action={provisionCommunicationPlaneTeam}
                            key={`team-${team.id}`}
                          >
                            <input
                              type="hidden"
                              name="tenant_business_id"
                              value={business.id}
                            />
                            <input type="hidden" name="smart_team_id" value={team.id} />
                            <input
                              type="hidden"
                              name="chatwoot_account_mapping_id"
                              value={accountMapping.id}
                            />
                            <button
                              disabled={
                                !editable ||
                                !chatwootReadiness?.liveProvisioningReady ||
                                !ownerAccessPrepared
                              }
                            >
                              Provision / verify Chatwoot Team · {team.name}
                            </button>
                          </form>
                        ))}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="muted smallText">
          External Chatwoot provisioning remains separately gated by Production health,
          Platform-token presence and the explicit provisioning activation flag. API Inbox and
          Chatwoot Team creation also require an ACTIVE OWNER administrator projection before any
          mapping claim is written.
          {editable && chatwootReadiness
            ? ` Current blockers: ${chatwootReadiness.blockers.length > 0
                ? chatwootReadiness.blockers.join(' · ')
                : chatwootReadiness.provisioningEnabled
                  ? 'none'
                  : 'PROVISIONING_DISABLED'}.`
            : ''}
        </p>
      </section>
    </div>
  );
}

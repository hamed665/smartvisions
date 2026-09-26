import {
  bootstrapCanonicalTenant,
  prepareCommunicationPlaneProjection,
  provisionCommunicationPlaneAccount,
  provisionCommunicationPlaneOwnerAccess,
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
    ]);

  const editable = role === 'OWNER';
  const brandName = settings?.brand_name ?? 'Smart Visions';
  const canonicalBrands = brands ?? [];
  const canonicalBusinesses = businesses ?? [];
  const activeBindings = communicationBindings ?? [];
  const liveAccountMappings = accountMappings ?? [];
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
                            Provision / verify owner access
                          </button>
                        </form>
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
          Platform-token presence and the explicit provisioning activation flag.
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

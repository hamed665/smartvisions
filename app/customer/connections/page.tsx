import { MetaWhatsAppEmbeddedSignup } from '@/app/integrations/meta-whatsapp-embedded-signup';
import { MetaWhatsAppLifecycle } from '@/app/integrations/meta-whatsapp-lifecycle';
import {
  type CustomerConnectionStatus,
  loadCustomerConnections,
} from '@/lib/access/customer-connections';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { StudioHeading } from '../studio-ui';
import { customerStudioScope } from '@/lib/access/customer-studio';
import { RegisteredWhatsAppImport } from './registered-whatsapp-import';

export const dynamic = 'force-dynamic';

function statusClass(status: CustomerConnectionStatus) {
  return status === 'Connected' ? 'status' : 'status dangerStatus';
}

export default async function CustomerConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const params = await searchParams;
  const { business } = await customerStudioScope(params.businessId);
  const context = await loadCustomerConnections({ requestedBusinessId: business.id });

  const whatsapp = context.whatsapp;
  const canManageWhatsApp = business.organizationRole === 'OWNER';
  let registeredNumber: string | null = null;
  if (canManageWhatsApp) {
    const ctx = await getCurrentOrganization(true);
    if (ctx.organizationId === business.organizationId) {
      const integration = await ctx.supabase.from('integration_connections').select('config')
        .eq('organization_id', ctx.organizationId).eq('provider', 'META').eq('channel', 'WHATSAPP').maybeSingle();
      const prepared = integration.data?.config?.metaWhatsAppVaultImport;
      if (prepared?.tenantBusinessId === business.id && typeof prepared.displayPhoneNumber === 'string') {
        registeredNumber = prepared.displayPhoneNumber;
      }
    }
  }
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
    || process.env.META_APP_ID?.trim()
    || null;
  const configurationId = process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
    || null;
  const coexistenceEnabled =
    process.env.META_WHATSAPP_COEXISTENCE_ENABLED?.trim().toLowerCase() === 'true';

  return (
    <div>
      <StudioHeading section="CHANNEL SETUP" title="Connect WhatsApp" description="Authorize your business number with Meta and check connection health." />
      <section className="panel settingsCreate" id="whatsapp">
        <div className="headerRow">
          <div>
            <h2>WhatsApp Business</h2>
            <p className="muted">
              Meta-hosted authorization only. Smart Visions never asks for your Facebook password, and this workflow never instructs you to delete the WhatsApp Business app from your phone.
            </p>
          </div>
          <span className={statusClass(whatsapp.status)}>{whatsapp.status}</span>
        </div>

        <div className="healthList">
          <span>Business <strong>{business.name}</strong></span>
          <span>Number <strong>{whatsapp.destinationLabel ?? 'Not selected'}</strong></span>
          <span>Last verified <strong>{whatsapp.lastVerifiedAt ? new Date(whatsapp.lastVerifiedAt).toLocaleString() : 'No recent evidence'}</strong></span>
          <span>Provider check <strong>{whatsapp.lastCheckedAt ? new Date(whatsapp.lastCheckedAt).toLocaleString() : 'Not checked'}</strong></span>
          <span>Incident <strong>{whatsapp.incidentCode ?? 'None recorded'}</strong></span>
        </div>

        <p className="muted">{whatsapp.reason}</p>

        {context.whatsappBindings.length > 1 ? (
          <div className="settingsList">
            {context.whatsappBindings.map((row) => (
              <div className="settingsRow" key={row.bindingId ?? row.destinationLabel ?? row.status}>
                <div>
                  <strong>{row.destinationLabel ?? 'WhatsApp binding'}</strong>
                  <span className="muted smallText">{row.status}</span>
                </div>
                <div>
                  <span className="muted smallText">Last verified: {row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString() : 'No recent evidence'}</span>
                  {row.incidentCode ? <span className="muted smallText">Incident: {row.incidentCode}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {canManageWhatsApp ? (
        <>
          {registeredNumber ? <RegisteredWhatsAppImport businessId={business.id} displayPhoneNumber={registeredNumber} /> : null}
          <MetaWhatsAppEmbeddedSignup
            appId={appId}
            configurationId={configurationId}
            coexistenceEnabled={coexistenceEnabled}
            graphVersion={metaGraphVersion()}
            bindings={context.whatsappBindingOptions.map((row) => ({
              id: row.id,
              version: row.version,
              tenantBusinessId: row.tenantBusinessId,
              businessName: row.businessName,
              branchName: row.branchName,
              destinationLabel: row.destinationLabel,
            }))}
            bootstrapBusinessId={business.id}
            bootstrapBusinessName={business.name}
          />
          <MetaWhatsAppLifecycle bindings={context.whatsappBindingOptions} />
        </>
      ) : (
        <section className="panel settingsCreate">
          <h2>WhatsApp connection management</h2>
          <p className="muted">
            This Business is visible to your account, but Meta credential changes and disconnect actions require the Organization OWNER. No broader panel or provider authority is granted implicitly.
          </p>
        </section>
      )}
    </div>
  );
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrapRoute = readFileSync(
  new URL('../app/api/customer/connections/whatsapp/bootstrap/route.ts', import.meta.url),
  'utf8',
);
const customerPage = readFileSync(
  new URL('../app/customer/connections/page.tsx', import.meta.url),
  'utf8',
);
const embeddedSignup = readFileSync(
  new URL('../app/integrations/meta-whatsapp-embedded-signup.tsx', import.meta.url),
  'utf8',
);
const connectionsRuntime = readFileSync(
  new URL('../lib/access/customer-connections.ts', import.meta.url),
  'utf8',
);
const startRoute = readFileSync(
  new URL('../app/api/integrations/meta/whatsapp/embedded-signup/start/route.ts', import.meta.url),
  'utf8',
);
const completeRoute = readFileSync(
  new URL('../app/api/integrations/meta/whatsapp/embedded-signup/complete/route.ts', import.meta.url),
  'utf8',
);
const provisionRoute = readFileSync(
  new URL('../app/api/integrations/meta/whatsapp/embedded-signup/provision/route.ts', import.meta.url),
  'utf8',
);
const lifecycleRoute = readFileSync(
  new URL('../app/api/integrations/meta/whatsapp/lifecycle/route.ts', import.meta.url),
  'utf8',
);
const truthfulBootstrapMigration = readFileSync(
  new URL(
    '../supabase/migrations/20261005040000_customer_whatsapp_truthful_bootstrap.sql',
    import.meta.url,
  ),
  'utf8',
);
const coexistenceActivationMigration = readFileSync(
  new URL(
    '../supabase/migrations/20261005045500_customer_whatsapp_coexistence_activation.sql',
    import.meta.url,
  ),
  'utf8',
);
const productionDeploy = readFileSync(
  new URL('../.github/workflows/cloudflare-production-deploy.yml', import.meta.url),
  'utf8',
);

describe('customer WhatsApp self-service authority', () => {
  it('bootstraps only through canonical Business, integration and binding authorities', () => {
    expect(bootstrapRoute).toContain('createClient');
    expect(bootstrapRoute).toContain('loadCustomerBusinessAccessContext');
    expect(bootstrapRoute).toContain("business.organizationRole !== 'OWNER'");
    expect(bootstrapRoute).not.toContain('getCurrentOrganization');
    expect(bootstrapRoute).not.toContain('getServerOperatorContext');
    expect(bootstrapRoute).toContain("from('integration_connections')");
    expect(bootstrapRoute).toContain("rpc('create_communication_channel_binding'");
    expect(bootstrapRoute).toContain("provider: 'META'");
    expect(bootstrapRoute).toContain("channel: 'WHATSAPP'");
    expect(bootstrapRoute).not.toMatch(/create table|customer_whatsapp_connections|customer_tenants/i);
    expect(bootstrapRoute).not.toContain('createSupabaseServiceClient');
  });

  it('requires real Smart Visions Meta provider configuration before canonical bootstrap', () => {
    expect(bootstrapRoute).toContain('META_APP_SECRET');
    expect(bootstrapRoute).toContain('NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID');
    expect(bootstrapRoute).toContain('Smart Visions Meta provider configuration is not ready');
    expect(productionDeploy).toContain('META_APP_ID: ${{ secrets.META_APP_ID }}');
    expect(productionDeploy).toContain('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID');
    expect(productionDeploy).toContain('META_WHATSAPP_EMBEDDED_SIGNUP_VERSION');
    expect(customerPage).toContain("process.env.META_WHATSAPP_EMBEDDED_SIGNUP_VERSION");
    expect(customerPage).toContain("? 'v4' as const");
    expect(embeddedSignup).toContain("props.embeddedSignupVersion === 'v4'");
    expect(productionDeploy).toContain('BLOCKED_EXTERNAL');
  });

  it('is replay and race safe instead of manufacturing a second binding', () => {
    expect(bootstrapRoute).toContain('replayed: true');
    expect(bootstrapRoute).toContain("eq('status', 'ACTIVE')");
    expect(bootstrapRoute).toContain('This Organization WhatsApp integration is already bound to another Business');
    expect(bootstrapRoute.match(/communication_channel_bindings/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps pre-authorization integration evidence READY, never fake CONNECTED', () => {
    expect(bootstrapRoute).toContain("status: 'READY'");
    expect(bootstrapRoute).toContain("integration.status !== 'CONNECTED'");
    expect(bootstrapRoute).not.toMatch(/status:\s*'CONNECTED'\s*,/);
    expect(truthfulBootstrapMigration).toContain("v_ic.status='CONNECTED'");
    expect(truthfulBootstrapMigration).toContain("v_channel='WHATSAPP'");
    expect(truthfulBootstrapMigration).toContain("v_ic.status='READY'");
    expect(truthfulBootstrapMigration).toContain("coalesce(v_ic.provider,'')");
    expect(truthfulBootstrapMigration).toContain('enforce_communication_channel_binding_contract');
    expect(truthfulBootstrapMigration).toContain("v_connection_status = 'READY'");
  });
});

describe('customer WhatsApp self-service UI', () => {
  it('uses Meta-hosted authorization and never collects a Facebook password or copied token', () => {
    expect(embeddedSignup).toContain('window.FB.login');
    expect(embeddedSignup).toContain('Smart Visions never asks for your Meta password or a copied token');
    expect(embeddedSignup).not.toMatch(/facebookPassword|accessTokenInput|paste.*token/i);
  });

  it('keeps Coexistence fail-closed until the provider capability is enabled', () => {
    const coexistenceGuard = embeddedSignup.indexOf("connectionMode === 'BUSINESS_APP_COEXISTENCE'");
    const bootstrapCall = embeddedSignup.indexOf('await ensureSelectedBinding()');
    expect(coexistenceGuard).toBeGreaterThan(-1);
    expect(bootstrapCall).toBeGreaterThan(coexistenceGuard);
    expect(embeddedSignup).toContain('!props.coexistenceEnabled');
    expect(startRoute).toContain('META_WHATSAPP_COEXISTENCE_ENABLED');
    expect(startRoute).toContain('blockedExternal: true');
    expect(completeRoute).toContain('META_WHATSAPP_COEXISTENCE_ENABLED');
    expect(completeRoute).toContain('blockedExternal: true');
    expect(productionDeploy).toContain('META_WHATSAPP_COEXISTENCE_ENABLED');
    expect(productionDeploy).toContain('remains BLOCKED_EXTERNAL');
  });

  it('uses the config-driven Embedded Signup v4 launch contract while keeping Coexistence fail-closed', () => {
    expect(embeddedSignup).toContain('const extras = {};');
    expect(embeddedSignup).not.toContain("featureType: 'whatsapp_business_app_onboarding'");
    expect(embeddedSignup).not.toContain("sessionInfoVersion: '3'");
    expect(embeddedSignup).not.toContain("sessionInfoVersion: '4'");
    expect(embeddedSignup).toContain("props.embeddedSignupVersion === 'v4'");
    expect(embeddedSignup).toContain('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING');
    expect(embeddedSignup).toContain('will not ask you to delete, uninstall, or destructively migrate the app');
    expect(completeRoute).toContain('discoverMetaWhatsAppPhoneNumber');
    expect(coexistenceActivationMigration).not.toContain('coexistence completion is not enabled yet');
    expect(coexistenceActivationMigration).toContain('apply_meta_whatsapp_binding_credential_internal');
    expect(coexistenceActivationMigration).toContain('to service_role');
  });

  it('opens Meta signup directly from the customer click before asynchronous bootstrap work', () => {
    const loginCall = embeddedSignup.indexOf('window.FB.login');
    const bootstrapAwait = embeddedSignup.indexOf('await ensureSelectedBinding()');
    expect(loginCall).toBeGreaterThan(-1);
    expect(bootstrapAwait).toBeGreaterThan(loginCall);
  });

  it('can bootstrap a missing Business binding and continue the existing Embedded Signup flow', () => {
    expect(embeddedSignup).toContain('/api/customer/connections/whatsapp/bootstrap');
    expect(embeddedSignup).toContain('/api/integrations/meta/whatsapp/embedded-signup/start');
    expect(embeddedSignup).toContain('/api/integrations/meta/whatsapp/embedded-signup/complete');
    expect(embeddedSignup).toContain('/api/integrations/meta/whatsapp/embedded-signup/provision');
    expect(embeddedSignup).toContain('/api/integrations/meta/whatsapp/embedded-signup/chatwoot');
  });

  it('keeps customer mutation OWNER-bounded while non-OWNER access remains read-only', () => {
    expect(customerPage).toContain("business.organizationRole === 'OWNER'");
    expect(customerPage).toContain('Meta credential changes and disconnect actions require the Organization OWNER');
    expect(customerPage).toContain('MetaWhatsAppEmbeddedSignup');
    expect(customerPage).toContain('MetaWhatsAppLifecycle');
  });
});

describe('truthful connection health', () => {
  it('does not expose Vault credential refs in customer action options', () => {
    const optionBlock = connectionsRuntime.slice(
      connectionsRuntime.indexOf('const whatsappBindingOptions'),
      connectionsRuntime.indexOf('if (!whatsappBindings.length)'),
    );
    expect(optionBlock).toContain('configured:');
    expect(optionBlock).not.toContain('provider_secret_ref:');
  });

  it('refreshes integration health only after provider provisioning evidence succeeds', () => {
    expect(provisionRoute).toContain("from('integration_connections')");
    expect(provisionRoute).toContain("status: 'CONNECTED'");
    expect(provisionRoute).toContain('last_checked_at: now');
    expect(provisionRoute).toContain("last_error: 'META_PROVISIONING_NOT_CONFIRMED'");
  });

  it('keeps verification evidence synchronized with the canonical integration state', () => {
    expect(lifecycleRoute).toContain("status: 'CONNECTED'");
    expect(lifecycleRoute).toContain("status: 'DEGRADED'");
    expect(lifecycleRoute).toContain('META_CREDENTIAL_INVALID_OR_REVOKED');
    expect(lifecycleRoute).toContain('META_PROVIDER_SUBSCRIPTION_MISSING');
  });
});

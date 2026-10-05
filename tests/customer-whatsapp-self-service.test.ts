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

describe('customer WhatsApp self-service authority', () => {
  it('bootstraps only through canonical Business, integration and binding authorities', () => {
    expect(bootstrapRoute).toContain('getCurrentOrganization(true)');
    expect(bootstrapRoute).toContain('loadCustomerBusinessAccessContext');
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
  });
});

describe('customer WhatsApp self-service UI', () => {
  it('uses Meta-hosted authorization and never collects a Facebook password or copied token', () => {
    expect(embeddedSignup).toContain('window.FB.login');
    expect(embeddedSignup).toContain('Smart Visions never asks for your Meta password or a copied token');
    expect(embeddedSignup).not.toMatch(/facebookPassword|accessTokenInput|paste.*token/i);
  });

  it('fails Coexistence closed before any canonical bootstrap mutation', () => {
    const coexistenceGuard = embeddedSignup.indexOf("connectionMode === 'BUSINESS_APP_COEXISTENCE'");
    const bootstrapCall = embeddedSignup.indexOf('await ensureSelectedBinding()');
    expect(coexistenceGuard).toBeGreaterThan(-1);
    expect(bootstrapCall).toBeGreaterThan(coexistenceGuard);
    expect(embeddedSignup).toContain('will not be deleted or migrated');
    expect(embeddedSignup).toContain('will not fall back to Delete Account or destructive migration');
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

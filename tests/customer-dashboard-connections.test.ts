import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { deriveCustomerWhatsAppConnection } from '@/lib/access/customer-connections';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20261005030000_customer_connections_scope.sql');
const connectionRuntime = read('lib/access/customer-connections.ts');
const appShell = read('app/app-shell.tsx');
const login = read('app/login/page.tsx');
const invite = read('app/invite/accept/page.tsx');
const connectionsPage = read('app/customer/connections/page.tsx');

const binding = {
  id: '20000000-0000-4000-8000-000000000001',
  organization_id: '10000000-0000-4000-8000-000000000001',
  tenant_business_id: '30000000-0000-4000-8000-000000000001',
  integration_connection_id: '40000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  version: 4,
  provider: 'META',
  provider_account_id: 'waba-1',
  provider_destination_id: 'phone-1',
  provider_destination_label: '+968 9000 0000',
  provider_secret_ref: '50000000-0000-4000-8000-000000000001',
  last_verified_at: '2026-10-05T00:00:00.000Z',
  last_error_code: null,
};

const integration = {
  id: binding.integration_connection_id,
  provider: 'META',
  channel: 'WHATSAPP',
  enabled: true,
  status: 'CONNECTED',
  last_checked_at: '2026-10-05T00:05:00.000Z',
  last_error: null,
};

describe('customer WhatsApp status truth', () => {
  const now = new Date('2026-10-05T01:00:00.000Z');

  it('does not claim Connected without a canonical binding', () => {
    const state = deriveCustomerWhatsAppConnection({ now });
    expect(state.status).toBe('Not connected');
    expect(state.canConnect).toBe(true);
  });

  it('requires real Meta identity, Vault ref, connected integration and recent evidence', () => {
    const state = deriveCustomerWhatsAppConnection({ binding, integration, now });
    expect(state.status).toBe('Connected');
    expect(state.canDisconnect).toBe(true);
    expect(state.canReconnect).toBe(false);
  });

  it('marks stale provider evidence as degraded instead of Connected', () => {
    const state = deriveCustomerWhatsAppConnection({
      binding: { ...binding, last_verified_at: '2026-10-03T00:00:00.000Z' },
      integration,
      now,
    });
    expect(state.status).toBe('Degraded-needs verification');
  });

  it('turns a safe manual disconnect into an explicit reconnect action', () => {
    const state = deriveCustomerWhatsAppConnection({
      binding: { ...binding, last_error_code: 'MANUAL_DISCONNECTED' },
      integration,
      now,
    });
    expect(state.status).toBe('Action required');
    expect(state.canReconnect).toBe(true);
    expect(state.canDisconnect).toBe(false);
  });

  it('fails closed when provider state is not connected', () => {
    const state = deriveCustomerWhatsAppConnection({
      binding,
      integration: { ...integration, status: 'DEGRADED' },
      now,
    });
    expect(state.status).toBe('Action required');
  });
});

describe('customer Connections authority contract', () => {
  it('scopes bindings and integration rows through canonical Business authority', () => {
    expect(migration).toContain('communication_channel_bindings_customer_scoped_read');
    expect(migration).toContain('integration_connections_customer_scoped_read');
    expect(migration).toContain('public.customer_business_effective_role');
    expect(migration).not.toMatch(/create policy communication_channel_bindings_admin_read/i);
    expect(migration).toContain('drop policy if exists org_member_integration_connections_read');
    expect(migration).toContain('drop policy if exists unified_inbox_business_wide_boundary');
  });

  it('removes authenticated privileges that are unnecessary for the Data API', () => {
    expect(migration).toContain('revoke truncate, references, trigger');
  });

  it('uses only the authenticated customer client for the customer read model', () => {
    expect(connectionRuntime).toContain("from '@/lib/supabase/server'");
    expect(connectionRuntime).not.toContain('createSupabaseServiceClient');
    expect(connectionRuntime).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(connectionRuntime).toContain(".eq('tenant_business_id', business.id)");
  });
});

describe('customer workspace UX boundary', () => {
  it('has a dedicated customer navigation without operator controls', () => {
    const start = appShell.indexOf('const customerGroups');
    const end = appShell.indexOf('const operatorMobilePrimary');
    const customerNav = appShell.slice(start, end);
    expect(customerNav).toContain("['Home', '/customer']");
    expect(customerNav).toContain("['Connections', '/customer/connections']");
    expect(customerNav).not.toMatch(/Founder|Billing|Audit|System|Command Center|Approvals/);
    expect(appShell).toContain("['AI', '/customer/ai', '✦']");
  });

  it('uses a customer-safe sign-in message and routes real Business users to the customer namespace', () => {
    expect(login).not.toContain('Private operator access');
    expect(login).not.toContain('<h1>Control Center</h1>');
    expect(login).toContain('/api/access/business-context');
    expect(login).toContain('/customer?businessId=');
  });

  it('continues a Business-scoped accepted invitation into the customer workspace', () => {
    expect(invite).toContain('tenantBusinessId');
    expect(invite).toContain('Continue to Business workspace');
    expect(invite).toContain('/customer?businessId=');
  });

  it('keeps customer WhatsApp actions read-only until the guarded E2E PR', () => {
    expect(connectionsPage).toContain('Meta-hosted authorization only');
    expect(connectionsPage).toContain('never asks for your Facebook password');
    expect(connectionsPage).toContain('never instructs you to delete the WhatsApp Business app');
    expect(connectionsPage).not.toMatch(/fetch\(|supabase\.rpc|service_role/i);
  });
});

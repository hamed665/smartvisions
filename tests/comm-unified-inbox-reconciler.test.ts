import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('COMM-UNIFIED-INBOX reconciler contract', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0094_comm_unified_inbox_reconciler.sql'),
    'utf8',
  );
  const route = readFileSync(
    resolve(process.cwd(), 'app/api/operations/chatwoot-inbox-reconcile/route.ts'),
    'utf8',
  );

  it('keeps system reconciliation SECURITY INVOKER and service-role-only', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('grant execute on function public.reconcile_unified_inbox_projection_event');
    expect(migration).toContain('to service_role;');
    expect(migration).toContain('from public, anon, authenticated;');
    expect(migration).not.toContain('security definer');
  });

  it('does not open authenticated projection mutation or create another queue', () => {
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*unified_inbox_conversation_projections[^;]*authenticated/is);
    expect(migration).toContain('grant insert, update on table public.unified_inbox_conversation_projections');
    expect(migration).toContain("set_config('smartvisions.unified_inbox_projection_command', '1', true)");
    expect(migration).not.toContain('CHATWOOT_PLATFORM_TOKEN');
    expect(migration).not.toContain('CHATWOOT_PROVISIONING_ENABLED');
  });

  it('runs only behind the existing internal API boundary', () => {
    expect(route).toContain('requireInternalApiKey(request)');
    expect(route).toContain('processPendingChatwootInboxEvents');
  });
});

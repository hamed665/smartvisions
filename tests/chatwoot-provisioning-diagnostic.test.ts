import { describe, expect, it } from 'vitest';
import { provisioningDiagnostic } from '@/lib/chatwoot/provisioning-diagnostic-contract';

describe('OWNER provisioning diagnostics', () => {
  it('identifies a missing prior Account match without revealing provider details', () => {
    expect(provisioningDiagnostic('RECONCILIATION_REQUIRED', 'ACCOUNT_EXTERNAL_MATCH_MISSING', 409))
      .toBe('Diagnostic: RECONCILIATION_REQUIRED / ACCOUNT_EXTERNAL_MATCH_MISSING; HTTP 409.');
  });
  it('does not echo unknown messages, credentials or SQL details', () => {
    expect(provisioningDiagnostic('secret-from-upstream', 'private-sql-detail', 200))
      .toBe('Diagnostic: UNKNOWN; HTTP unavailable.');
  });
});

const CODES = new Set(['INVALID_INPUT', 'DUPLICATE_MATCH', 'IDENTITY_CONFLICT', 'UPSTREAM_MISMATCH', 'RECONCILIATION_REQUIRED', 'ACTIVATION_BLOCKED']);
const REASONS = new Set(['META_PROVISIONING_EVIDENCE_MISSING', 'ACCOUNT_MAPPING_READ_FAILED', 'WHATSAPP_BINDING_NOT_READY', 'TENANT_BUSINESS_NOT_ACTIVE', 'ACCOUNT_TENANT_SCOPE_MISMATCH', 'ACCOUNT_PROJECTION_NOT_ACTIVE', 'INBOX_BINDING_MISMATCH', 'PROJECTION_AUDIT_NOT_COMMITTED', 'ACCOUNT_MAPPING_INVALID', 'OWNER_AUTH_REQUIRED', 'OWNER_BUSINESS_INVALID', 'ACCOUNT_INPUT_INVALID', 'ACCOUNT_EXTERNAL_ID_MISSING', 'ACCOUNT_IDENTITY_DRIFT', 'ACCOUNT_MAPPING_INELIGIBLE', 'ACCOUNT_CLAIM_UNAVAILABLE', 'ACCOUNT_CHANGED_AFTER_CLAIM', 'ACCOUNT_EXTERNAL_MATCH_MISSING', 'ACCOUNT_COMMIT_MISMATCH']);

// Static codes only; no exception message, SQL details or provider body.
export function provisioningDiagnostic(code: unknown, reason: unknown, status: number) {
  const safeCode = typeof code === 'string' && CODES.has(code) ? code : 'UNKNOWN';
  const safeReason = typeof reason === 'string' && REASONS.has(reason) ? ` / ${reason}` : '';
  const safeStatus = [400, 409, 503].includes(status) ? status : 'unavailable';
  return `Diagnostic: ${safeCode}${safeReason}; HTTP ${safeStatus}.`;
}

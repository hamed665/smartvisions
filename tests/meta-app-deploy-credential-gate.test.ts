import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../.github/workflows/cloudflare-production-deploy.yml', import.meta.url),
  'utf8',
);
const verifier = readFileSync(
  new URL('../scripts/verify-meta-app-credential-pair.mjs', import.meta.url),
  'utf8',
);

describe('Meta Production credential deploy gate', () => {
  it('verifies the GitHub secret against the configured Meta App without URL credential leakage', () => {
    expect(workflow).toContain('META_APP_SECRET: ${{ secrets.META_APP_SECRET }}');
    expect(workflow).toContain('node scripts/verify-meta-app-credential-pair.mjs');
    expect(workflow).toContain('META_WHATSAPP_EMBEDDED_SIGNUP_VERSION: ${{ vars.META_WHATSAPP_EMBEDDED_SIGNUP_VERSION }}');
    expect(workflow).toContain('META_WHATSAPP_EMBEDDED_SIGNUP_VERSION must be v4');
    expect(verifier).toContain('Authorization:');
    expect(verifier).toContain('Bearer');
    expect(verifier).toContain("url.searchParams.set('fields', 'id')");
    expect(verifier).not.toMatch(/searchParams\.set\(['"](?:access_token|client_secret)/);
    expect(verifier).toContain("String(body.id || '') !== appId");
  });

  it('deploys the verified secret atomically without weakening independent capability gates', () => {
    expect(workflow.match(/--secrets-file/g)?.length).toBe(2);
    expect(workflow).toContain('JSON.stringify({META_APP_SECRET:secret})');
    expect(workflow).toContain(
      "META_WHATSAPP_COEXISTENCE_ENABLED:process.env.META_WHATSAPP_COEXISTENCE_ENABLED==='true'?'true':'false'",
    );
    expect(workflow).toContain("CHATWOOT_PROVISIONING_ENABLED:'false'");
    expect(workflow).toContain("META_WHATSAPP_EMBEDDED_SIGNUP_VERSION:process.env.META_WHATSAPP_EMBEDDED_SIGNUP_VERSION");
    expect(workflow).toContain("META_WHATSAPP_EMBEDDED_SIGNUP_VERSION!=='v4'");
    expect(workflow).not.toContain('meta-credential-preflight');
    expect(workflow).not.toContain('META_CREDENTIAL_PREFLIGHT_ENABLED');
  });
});
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Chatwoot source foundation invariants', () => {
  it('pins an exact stable Community source and keeps provider authority in Smart Core', () => {
    const lock = JSON.parse(read('ops/chatwoot/source.lock.json'));

    expect(lock.workPackage).toBe('COMM-CHATWOOT-SOURCE');
    expect(lock.upstream).toMatchObject({
      repository: 'chatwoot/chatwoot',
      tag: 'v4.18.0',
      commit: '9f920b549c14491a4e587687a3eed5d21c6ccc7d',
    });
    expect(lock.upstream.commit).toMatch(/^[0-9a-f]{40}$/);

    expect(lock.license).toMatchObject({
      communityPolicy: 'MIT_EXCEPT_ENTERPRISE',
      enterpriseProductionUse: 'LICENSE_REQUIRED',
      enterpriseFilesInProductionImage: false,
      runtimeDisableEnterprise: true,
    });

    expect(lock.image.allowLatestTag).toBe(false);
    expect(lock.image.requireImmutableDeploymentDigest).toBe(true);

    expect(lock.integration).toMatchObject({
      providerAuthority: 'SMART_CORE',
      initialChatwootChannel: 'Channel::Api',
      nativeEmailProviderOwnership: false,
      nativeWhatsAppProviderOwnership: false,
    });
  });

  it('keeps Production environment secret-free and Community-only', () => {
    const env = read('ops/chatwoot/.env.production.example');

    expect(env).toContain('DISABLE_ENTERPRISE=true');
    expect(env).toContain('ENABLE_ACCOUNT_SIGNUP=false');
    expect(env).toContain('SECRET_KEY_BASE=__SECRET_STORE__');
    expect(env).toContain('ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY=__SECRET_STORE__');
    expect(env).toContain('ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY=__SECRET_STORE__');
    expect(env).toContain('ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT=__SECRET_STORE__');

    expect(env).not.toMatch(/(?:META_ACCESS_TOKEN|WHATSAPP_ACCESS_TOKEN|RESEND_API_KEY)=/);
    expect(env).not.toMatch(/SECRET_KEY_BASE=(?!__SECRET_STORE__)[^\n]+/);
  });

  it('forces Community mode in both web and worker containers', () => {
    const compose = read('ops/chatwoot/docker-compose.production.yml');

    expect((compose.match(/DISABLE_ENTERPRISE: "true"/g) ?? [])).toHaveLength(2);
    expect(compose).toContain('CHATWOOT_IMAGE:?Set CHATWOOT_IMAGE to an immutable GHCR image digest');
    expect(compose).not.toContain(':latest');
  });

  it('removes enterprise source before image build and verifies it is absent', () => {
    const workflow = read('.github/workflows/chatwoot-source-image.yml');

    expect(workflow).toContain('CHATWOOT_UPSTREAM_COMMIT: 9f920b549c14491a4e587687a3eed5d21c6ccc7d');
    expect(workflow).toContain('rm -rf chatwoot/enterprise');
    expect(workflow).toContain('test ! -e chatwoot/enterprise');
    expect(workflow).toContain('test ! -e /app/enterprise');
    expect(workflow).toContain('providerAuthority');
    expect(workflow).toContain('apply-branding-overlay.mjs chatwoot');
    expect(workflow).toContain('SMARTVISIONS_COMMIT');
    expect(workflow).not.toContain('chatwoot/chatwoot:latest');
  });

  it('keeps the installation baseline free of provider and Enterprise activation', () => {
    const config = read('ops/chatwoot/configure-smartvisions.rb');

    expect(config).toContain("'INSTALLATION_NAME' => 'Smart Visions Inbox'");
    expect(config).toContain("'LOGO' => '/brand-assets/smartvisions-logo.svg'");
    expect(config).toContain("'LOGO_DARK' => '/brand-assets/smartvisions-logo-dark.svg'");
    expect(config).toContain("'LOGO_THUMBNAIL' => '/brand-assets/smartvisions-logo-thumbnail.svg'");
    expect(config).toContain("'BRAND_URL' => 'https://smartvisionsai.com'");
    expect(config).toContain("'ENABLE_ACCOUNT_SIGNUP' => false");
    expect(config).not.toMatch(/WHATSAPP|META|RESEND|ENTERPRISE|INSTALLATION_PRICING_PLAN/);
  });
  it('keeps the branding overlay explicit and Community-safe', () => {
    const overlay = read('scripts/chatwoot/apply-branding-overlay.mjs');
    const brandingReadme = read('ops/chatwoot/branding/README.md');

    expect(read('ops/chatwoot/branding/logo.svg')).toContain('SMART VISIONS');
    expect(read('ops/chatwoot/branding/logo_dark.svg')).toContain('SMART VISIONS');
    expect(read('ops/chatwoot/branding/logo_thumbnail.svg')).toContain('Smart Visions');
    expect(read('ops/chatwoot/branding/smartvisions-auth.css')).toContain('.sv-auth-shell');
    expect(overlay).toContain('app/javascript/v3/views/login/Index.vue');
    expect(overlay).toContain('app/javascript/v3/views/auth/reset/password/Index.vue');
    expect(overlay).toContain('app/javascript/v3/views/auth/password/Edit.vue');
    expect(overlay).toContain(
      'app/javascript/dashboard/routes/dashboard/onboarding/account-details/OnboardingFormRow.vue'
    );
    expect(overlay).toContain(
      'app/javascript/dashboard/routes/dashboard/onboarding/account-details/OnboardingFormSelect.vue'
    );
    expect(overlay).toContain(
      'grid grid-cols-1 gap-2 px-3 py-3 border-t border-n-weak sm:grid-cols-2 sm:items-center'
    );
    expect(overlay).toContain(
      'relative flex w-full min-w-0 items-center justify-start sm:justify-end'
    );
    expect(overlay).not.toContain("path.join(dir,'enterprise");
    expect(brandingReadme).toContain('Chatwoot remains');
  });
});

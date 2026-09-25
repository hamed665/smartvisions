import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  '.github/workflows/cloudflare-production-deploy.yml',
  'utf8',
);

describe('Chatwoot Cloudflare runtime boundary', () => {
  it('keeps the release candidate disconnected from Production Chatwoot', () => {
    expect(workflow).toContain("CHATWOOT_PROVISIONING_ENABLED:'false'");
    expect(workflow).toContain('delete c.vars.CHATWOOT_BASE_URL');
    expect(workflow).toContain('delete c.vars.CHATWOOT_WEBHOOK_PUBLIC_ORIGIN');
    expect(workflow).toContain(
      'Chatwoot provisioning disabled/unbound',
    );
  });

  it('publishes only non-secret Production Chatwoot routing vars while provisioning stays disabled', () => {
    expect(workflow).toContain(
      'CHATWOOT_BASE_URL: https://inbox.smartvisionsai.com',
    );
    expect(workflow).toContain(
      'CHATWOOT_WEBHOOK_PUBLIC_ORIGIN: https://app.smartvisionsai.com',
    );
    expect(workflow).toContain(
      'CHATWOOT_BASE_URL:process.env.CHATWOOT_BASE_URL',
    );
    expect(workflow).toContain(
      'CHATWOOT_WEBHOOK_PUBLIC_ORIGIN:process.env.CHATWOOT_WEBHOOK_PUBLIC_ORIGIN',
    );
    expect(workflow).toContain(
      "if(c.vars?.CHATWOOT_PROVISIONING_ENABLED!=='false')throw new Error('Production Chatwoot provisioning must remain disabled');",
    );
  });

  it('does not move the Platform token into the permanent deploy workflow yet', () => {
    expect(workflow).not.toContain('CHATWOOT_PLATFORM_TOKEN:');
    expect(workflow).not.toContain('secret put CHATWOOT_PLATFORM_TOKEN');
  });
});

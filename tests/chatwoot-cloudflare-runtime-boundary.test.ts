import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  '.github/workflows/cloudflare-production-deploy.yml',
  'utf8',
);

describe('Chatwoot Cloudflare runtime boundary', () => {
  it('keeps the release candidate disconnected from Production Chatwoot and without the Platform token', () => {
    expect(workflow).toContain("CHATWOOT_PROVISIONING_ENABLED:'false'");
    expect(workflow).toContain('delete c.vars.CHATWOOT_BASE_URL');
    expect(workflow).toContain('delete c.vars.CHATWOOT_WEBHOOK_PUBLIC_ORIGIN');
    expect(workflow).toContain('delete c.vars.CHATWOOT_PLATFORM_TOKEN');
    expect(workflow).toContain(
      "if(worker==='smartvisions-growth-os-release-candidate'&&names.has('CHATWOOT_PLATFORM_TOKEN'))throw new Error('Release candidate must never bind CHATWOOT_PLATFORM_TOKEN');",
    );
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
    expect(workflow).toContain(
      "if(Object.prototype.hasOwnProperty.call(c.vars||{},'CHATWOOT_PLATFORM_TOKEN'))throw new Error('Chatwoot Platform token must never be stored in plaintext Worker vars');",
    );
  });

  it('transports the Platform token only as a Production Worker secret when explicitly configured', () => {
    expect(
      workflow.match(/secrets\.CHATWOOT_PLATFORM_TOKEN/g)?.length ?? 0,
    ).toBe(1);
    expect(workflow).toContain(
      'Stage Chatwoot Platform token on Production only when configured',
    );
    expect(workflow).toContain(
      "printf '%s' \"$CHATWOOT_PLATFORM_TOKEN\" | npx wrangler secret put CHATWOOT_PLATFORM_TOKEN --config dist/server/wrangler.json >/dev/null",
    );
    expect(workflow).toContain(
      "if(!names.has('CHATWOOT_PLATFORM_TOKEN'))throw new Error('Production Chatwoot Platform token binding name was not created');",
    );
    expect(workflow).toContain(
      'Chatwoot Platform token staged only on the Production Worker; provisioning remains disabled.',
    );
  });
});

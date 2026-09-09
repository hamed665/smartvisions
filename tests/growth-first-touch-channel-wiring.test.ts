import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shadowApproval = readFileSync(resolve(process.cwd(), 'lib/outreach/shadow-approval.ts'), 'utf8');

describe('growth first-touch shadow wiring', () => {
  it('checks canonical market policy and durable opt-in before persisting a first-touch draft', () => {
    expect(shadowApproval).toContain("input.idempotencyKey.trim().startsWith('growth-first-touch:')");
    expect(shadowApproval).toContain(".from('market_settings')");
    expect(shadowApproval).toContain('getWhatsAppMarketingPermission');
    expect(shadowApproval).toContain('evaluateGrowthFirstTouchChannelPolicy');
    expect(shadowApproval).toContain('coldEmailEnabled: config.coldEmailEnabled === true');
    expect(shadowApproval).toContain('whatsappOptInEnabled: config.whatsappOptInEnabled === true');
    expect(shadowApproval).toContain('whatsappOptInVerified');
    expect(shadowApproval).not.toContain('config.whatsappColdEnabled');
  });

  it('preserves the approved Meta template configuration and its body parameters', () => {
    expect(shadowApproval).toContain('config.whatsappOptInTemplateName');
    expect(shadowApproval).toContain('config.whatsappOptInTemplateLanguageCode');
    expect(shadowApproval).toContain('template_name: resolvedTemplateName ?? null');
    expect(shadowApproval).toContain('template_language_code: resolvedTemplateLanguageCode ?? null');
    expect(shadowApproval).toContain('template_body_parameters: resolvedTemplateBodyParameters.length');
  });
});

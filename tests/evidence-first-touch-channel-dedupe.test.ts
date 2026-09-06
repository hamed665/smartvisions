import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'app/api/operations/evidence-pipeline/route.ts'), 'utf8');

describe('evidence first-touch channel dedupe', () => {
  it('does not let a legacy blocked WhatsApp draft masquerade as an Email duplicate', () => {
    const duplicateLookup = route.slice(route.indexOf("const { data: existing"), route.indexOf('if (existingError)'));
    expect(duplicateLookup).toContain(".eq('channel', 'EMAIL')");
    expect(duplicateLookup).toContain(".eq('provider_message_id', providerMessageId)");
  });

  it('does not treat BLOCKED unsent history as real customer message activity', () => {
    const activityLookup = route.slice(route.indexOf('const [conversationMessageCount'), route.indexOf('if (conversationMessageCount.error'));
    expect(activityLookup).toContain(".neq('status', 'BLOCKED')");
    expect(activityLookup).toContain("from('outreach_messages')");
  });
});

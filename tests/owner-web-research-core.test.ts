import { describe, expect, it } from 'vitest';

import {
  extractOwnerWebResearchMeta,
  normalizeOwnerWebUrl,
} from '@/lib/ai/owner-web-research-core';

describe('Owner web research evidence extraction', () => {
  it('extracts only http(s) sources actually returned by web_search calls and citations', () => {
    const result = extractOwnerWebResearchMeta({
      output: [
        {
          type: 'web_search_call',
          action: {
            sources: [
              { url: 'https://example.com/report#section' },
              { url: 'javascript:alert(1)' },
            ],
          },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: '{}',
            annotations: [
              { type: 'url_citation', url: 'https://example.com/report', title: 'Example report' },
              { type: 'url_citation', url: 'https://competitor.example/pricing/', title: 'Pricing' },
            ],
          }],
        },
      ],
    });

    expect(result.webSearchCalls).toBe(1);
    expect(result.sources).toEqual([
      { url: 'https://example.com/report', title: 'Example report' },
      { url: 'https://competitor.example/pricing', title: 'Pricing' },
    ]);
  });

  it('normalizes fragments and trailing slashes without accepting non-web schemes', () => {
    expect(normalizeOwnerWebUrl('https://example.com/a/#x')).toBe('https://example.com/a');
    expect(normalizeOwnerWebUrl('http://example.com/')).toBe('http://example.com');
    expect(normalizeOwnerWebUrl('file:///etc/passwd')).toBeNull();
  });
});

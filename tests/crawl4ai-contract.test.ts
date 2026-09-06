import { afterEach, describe, expect, it, vi } from 'vitest';
import { Crawl4AiAuditor, WebsiteAuditProviderError } from '@/lib/audit/crawl4ai';

afterEach(() => vi.restoreAllMocks());

describe('Crawl4AI audit contract', () => {
  it('normalizes provider quality values to the database contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      sourceUrl: 'https://example.com/',
      mobileQuality: 'good',
      seoQuality: 'EXCELLENT',
      ctaQuality: ' poor ',
      brokenLinks: -4,
      detectedLanguages: ['en', 'en', ''],
      socialLinks: { instagram: 'https://instagram.com/example', ignored: 12 },
      evidence: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await new Crawl4AiAuditor('https://audit.internal').audit('https://example.com/');
    expect(result.mobileQuality).toBe('GOOD');
    expect(result.seoQuality).toBe('UNKNOWN');
    expect(result.ctaQuality).toBe('POOR');
    expect(result.brokenLinks).toBe(0);
    expect(result.detectedLanguages).toEqual(['en']);
    expect(result.socialLinks).toEqual({ instagram: 'https://instagram.com/example' });
  });

  it('separates provider HTTP failures and retryability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await expect(new Crawl4AiAuditor('https://audit.internal').audit('https://example.com/'))
      .rejects.toMatchObject<Partial<WebsiteAuditProviderError>>({ code: 'HTTP', retryable: true });
  });

  it('marks malformed provider JSON as non-retryable parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad-json', { status: 200 })));
    await expect(new Crawl4AiAuditor('https://audit.internal').audit('https://example.com/'))
      .rejects.toMatchObject<Partial<WebsiteAuditProviderError>>({ code: 'PARSE', retryable: false });
  });

  it('marks a non-object provider payload as validation failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(['unexpected']), { status: 200 })));
    await expect(new Crawl4AiAuditor('https://audit.internal').audit('https://example.com/'))
      .rejects.toMatchObject<Partial<WebsiteAuditProviderError>>({ code: 'VALIDATION', retryable: false });
  });

  it('classifies fetch failures without automatically retrying them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network unavailable'); }));
    await expect(new Crawl4AiAuditor('https://audit.internal').audit('https://example.com/'))
      .rejects.toMatchObject<Partial<WebsiteAuditProviderError>>({ code: 'FETCH', retryable: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyChatwootHttpStatus,
  mutationOutcomeMayBeAmbiguous,
  normalizeChatwootBaseUrl,
  normalizeChatwootRequestPath,
  parseRetryAfterMs,
} from '@/lib/chatwoot/http-contract';

describe('Chatwoot HTTP safety contract', () => {
  it('accepts only root HTTPS origins, with localhost HTTP only when explicitly allowed', () => {
    expect(normalizeChatwootBaseUrl('https://inbox.example.com')).toBe(
      'https://inbox.example.com',
    );
    expect(normalizeChatwootBaseUrl('https://inbox.example.com/')).toBe(
      'https://inbox.example.com',
    );
    expect(normalizeChatwootBaseUrl('https://user:pass@inbox.example.com')).toBeNull();
    expect(normalizeChatwootBaseUrl('https://inbox.example.com/path')).toBeNull();
    expect(normalizeChatwootBaseUrl('http://inbox.example.com')).toBeNull();
    expect(
      normalizeChatwootBaseUrl('http://localhost:3000', {
        allowInsecureLocalhost: true,
      }),
    ).toBe('http://localhost:3000');
  });

  it('rejects absolute, protocol-relative and encoded traversal paths', () => {
    expect(normalizeChatwootRequestPath('/platform/api/v1/accounts?x=1')).toBe(
      '/platform/api/v1/accounts?x=1',
    );
    expect(normalizeChatwootRequestPath('https://evil.example/path')).toBeNull();
    expect(normalizeChatwootRequestPath('//evil.example/path')).toBeNull();
    expect(normalizeChatwootRequestPath('/a/../b')).toBeNull();
    expect(normalizeChatwootRequestPath('/a/%2e%2e/b')).toBeNull();
    expect(normalizeChatwootRequestPath('/a\\b')).toBeNull();
    expect(normalizeChatwootRequestPath('/a#fragment')).toBeNull();
  });

  it('classifies auth, validation, rate-limit and upstream statuses without guessing', () => {
    expect(classifyChatwootHttpStatus(401)).toEqual({
      code: 'AUTH_FAILED',
      retryable: false,
    });
    expect(classifyChatwootHttpStatus(422)).toEqual({
      code: 'VALIDATION_FAILED',
      retryable: false,
    });
    expect(classifyChatwootHttpStatus(429)).toEqual({
      code: 'RATE_LIMITED',
      retryable: true,
    });
    expect(classifyChatwootHttpStatus(503)).toEqual({
      code: 'UPSTREAM_FAILED',
      retryable: true,
    });
  });

  it('marks only mutation transport/server uncertainty as ambiguous', () => {
    expect(
      mutationOutcomeMayBeAmbiguous({
        method: 'POST',
        networkFailure: true,
      }),
    ).toBe(true);
    expect(
      mutationOutcomeMayBeAmbiguous({
        method: 'POST',
        status: 503,
      }),
    ).toBe(true);
    expect(
      mutationOutcomeMayBeAmbiguous({
        method: 'POST',
        status: 422,
      }),
    ).toBe(false);
    expect(
      mutationOutcomeMayBeAmbiguous({
        method: 'GET',
        networkFailure: true,
      }),
    ).toBe(false);
  });

  it('bounds Retry-After values instead of sleeping arbitrarily long', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('999')).toBe(5000);
    expect(
      parseRetryAfterMs('Thu, 01 Jan 2026 00:00:10 GMT', Date.parse('2026-01-01T00:00:08Z')),
    ).toBe(2000);
    expect(parseRetryAfterMs('not-a-date')).toBeNull();
  });
});

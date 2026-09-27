import { describe, expect, it } from 'vitest';
import { normalizeCrmIdentity } from '@/lib/crm/contact-identity';

describe('Instagram provider-scoped CRM identity', () => {
  it('keeps provider user IDs opaque instead of treating them as usernames', () => {
    expect(normalizeCrmIdentity('INSTAGRAM_PROVIDER_USER', ' 17841400000123456 '))
      .toBe('17841400000123456');
    expect(normalizeCrmIdentity('INSTAGRAM', '@Some.User')).toBe('some.user');
  });

  it('rejects empty provider identities', () => {
    expect(normalizeCrmIdentity('INSTAGRAM_PROVIDER_USER', '   ')).toBeNull();
  });
});

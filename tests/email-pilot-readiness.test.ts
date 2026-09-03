import { describe, expect, it } from 'vitest';
import { selectFirstPartyContactEmail } from '@/lib/hunters/business/contact-evidence';
import { mailboxUsageWindowStart } from '@/lib/outreach/mailbox-usage';

describe('Oman email pilot readiness', () => {
  it('accepts a verified same-domain website contact email', () => {
    expect(selectFirstPartyContactEmail(
      'https://www.communitydental.om/en/',
      ['Info@communitydental.om'],
    )).toBe('info@communitydental.om');
  });

  it('fails closed for third-party or invalid contact addresses', () => {
    expect(selectFirstPartyContactEmail(
      'https://communitydental.om/en/',
      ['communityclinic@gmail.com', 'not-an-email'],
    )).toBeNull();
    expect(selectFirstPartyContactEmail('not-a-url', ['info@communitydental.om'])).toBeNull();
  });

  it('does not accept lookalike or parent-domain mismatches', () => {
    expect(selectFirstPartyContactEmail(
      'https://communitydental.om/en/',
      ['info@evilcommunitydental.om'],
    )).toBeNull();
    expect(selectFirstPartyContactEmail(
      'https://booking.communitydental.om/',
      ['info@communitydental.om'],
    )).toBeNull();
  });

  it('uses a rolling 24-hour durable usage window instead of a stale calendar counter', () => {
    expect(mailboxUsageWindowStart(new Date('2026-09-03T10:00:00.000Z')))
      .toBe('2026-09-02T10:00:00.000Z');
  });
});

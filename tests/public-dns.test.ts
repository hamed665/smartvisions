import { describe, expect, it } from 'vitest';
import { assertPublicHostname } from '../lib/hunters/business/public-dns';

const resolvers = (v4: string[] | Error, v6: string[] | Error = []) => ({
  resolve4: async () => {
    if (v4 instanceof Error) throw v4;
    return v4;
  },
  resolve6: async () => {
    if (v6 instanceof Error) throw v6;
    return v6;
  },
});

describe('public DNS guard', () => {
  it('accepts a hostname when every resolved address is public', async () => {
    await expect(assertPublicHostname('example.com', resolvers(['93.184.216.34'], ['2606:2800:220:1:248:1893:25c8:1946'])))
      .resolves.toEqual(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);
  });

  it('blocks when any DNS answer is private', async () => {
    await expect(assertPublicHostname('example.com', resolvers(['93.184.216.34', '10.0.0.4'])))
      .rejects.toThrow('blocked/private');
  });

  it('accepts one address family when the other has no record', async () => {
    await expect(assertPublicHostname('example.com', resolvers(new Error('ENODATA'), ['2606:2800:220:1:248:1893:25c8:1946'])))
      .resolves.toEqual(['2606:2800:220:1:248:1893:25c8:1946']);
  });

  it('fails closed when neither address family resolves', async () => {
    await expect(assertPublicHostname('missing.invalid', resolvers(new Error('ENOTFOUND'), new Error('ENOTFOUND'))))
      .rejects.toThrow('could not be resolved');
  });
});

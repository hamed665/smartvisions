import { resolve4, resolve6 } from 'node:dns/promises';
import { isPrivateIp } from './website-audit';

type AddressResolvers = {
  resolve4: (hostname: string) => Promise<string[]>;
  resolve6: (hostname: string) => Promise<string[]>;
};

const defaultResolvers: AddressResolvers = { resolve4, resolve6 };

export async function assertPublicHostname(
  hostname: string,
  resolvers: AddressResolvers = defaultResolvers,
) {
  if (isPrivateIp(hostname)) throw new Error('Private/local audit targets are blocked');

  const settled = await Promise.allSettled([
    resolvers.resolve4(hostname),
    resolvers.resolve6(hostname),
  ]);
  const addresses = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);

  if (!addresses.length) throw new Error('Website hostname could not be resolved');
  if (addresses.some((address) => isPrivateIp(address))) {
    throw new Error('Website resolved to a blocked/private address');
  }

  return addresses;
}

import { ACTIVE_CHANNEL_ADAPTERS } from './adapters';
import type { ActiveOmnichannelChannel, ChannelCapabilityDescriptor } from './types';

export function isActiveOmnichannelChannel(value: unknown): value is ActiveOmnichannelChannel {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(ACTIVE_CHANNEL_ADAPTERS, value);
}

export function getChannelDescriptor(value: unknown): ChannelCapabilityDescriptor | null {
  if (!isActiveOmnichannelChannel(value)) return null;
  return ACTIVE_CHANNEL_ADAPTERS[value].descriptor;
}

export function getChannelIntegrationIdentity(value: unknown): {
  provider: 'EMAIL_PROVIDER' | 'META';
  channel: ActiveOmnichannelChannel;
} | null {
  const descriptor = getChannelDescriptor(value);
  if (!descriptor) return null;
  return {
    provider: descriptor.integrationProvider,
    channel: descriptor.channel,
  };
}

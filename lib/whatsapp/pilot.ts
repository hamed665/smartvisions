import { normalizeIdempotencyKey } from '@/lib/agents/idempotency';

export function whatsappPilotRequestKey(inboundId: string) {
  return normalizeIdempotencyKey(`whatsapp-pilot:${inboundId}`);
}

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function evaluateWhatsAppSendPolicy(input: {
  lastCustomerMessageAt?: Date | string | null;
  templateName?: string;
  marketingOptInVerified?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const lastInbound = input.lastCustomerMessageAt ? new Date(input.lastCustomerMessageAt) : null;
  const ageMs = lastInbound && Number.isFinite(lastInbound.getTime()) ? now.getTime() - lastInbound.getTime() : Number.POSITIVE_INFINITY;
  const customerWindowOpen = ageMs >= 0 && ageMs < CUSTOMER_SERVICE_WINDOW_MS;

  if (customerWindowOpen) {
    return { allowed: true, mode: 'FREEFORM' as const, customerWindowOpen, reason: 'CUSTOMER_SERVICE_WINDOW_OPEN' as const };
  }
  if (input.templateName?.trim() && input.marketingOptInVerified === true) {
    return { allowed: true, mode: 'TEMPLATE' as const, customerWindowOpen, reason: 'VERIFIED_OPT_IN_TEMPLATE' as const };
  }
  if (input.templateName?.trim()) {
    return { allowed: false, mode: 'BLOCK' as const, customerWindowOpen, reason: 'WHATSAPP_MARKETING_OPT_IN_REQUIRED' as const };
  }
  return { allowed: false, mode: 'BLOCK' as const, customerWindowOpen, reason: 'OUTSIDE_24H_WINDOW_TEMPLATE_REQUIRED' as const };
}

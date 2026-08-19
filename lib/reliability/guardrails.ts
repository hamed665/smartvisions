import type { Lead } from "@/lib/types";

export interface GuardrailContext {
  lead: Lead;
  globalKillSwitch: boolean;
  channelPaused: boolean;
  suppressed: boolean;
  insideSendWindow: boolean;
  priceVerified: boolean;
  discountPct: number;
  maxAllowedDiscountPct: number;
}

export function enforceGuardrails(ctx: GuardrailContext) {
  const blocks: string[] = [];
  if (ctx.globalKillSwitch) blocks.push("GLOBAL_KILL_SWITCH");
  if (ctx.channelPaused) blocks.push("CHANNEL_PAUSED");
  if (ctx.suppressed || ctx.lead.status === "DO_NOT_CONTACT") blocks.push("SUPPRESSED");
  if (ctx.lead.agentMode === "HUMAN") blocks.push("HUMAN_TAKEOVER");
  if (!ctx.insideSendWindow) blocks.push("OUTSIDE_SEND_WINDOW");
  if (!ctx.priceVerified) blocks.push("UNVERIFIED_PRICE");
  if (ctx.discountPct > ctx.maxAllowedDiscountPct) blocks.push("DISCOUNT_LIMIT");
  return { allowed: blocks.length === 0, blocks };
}

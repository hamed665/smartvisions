import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizePersistedPreview(command: TelegramOwnerCommand, preview: CommandExecutionResult): CommandExecutionResult {
  const before = rec(preview.before);
  let orderedBefore: unknown = preview.before;

  switch (command.type) {
    case 'SET_PRICE':
      orderedBefore = { serviceId: before.serviceId, countryCode: before.countryCode, currency: before.currency, price: before.price, minimumPrice: before.minimumPrice };
      break;
    case 'SET_SERVICE_ENABLED':
      orderedBefore = { id: before.id, name: before.name, enabled: before.enabled };
      break;
    case 'SET_SERVICE_OPTION':
      orderedBefore = { serviceId: before.serviceId, optionKey: before.optionKey, value: before.value };
      break;
    case 'SET_MARKET_ENABLED':
      orderedBefore = { countryCode: before.countryCode, enabled: before.enabled };
      break;
    case 'SET_PAUSE':
      orderedBefore = { target: before.target, paused: before.paused };
      break;
    case 'APPROVE_MESSAGE':
    case 'REJECT_MESSAGE':
      orderedBefore = { id: before.id, status: before.status, requiresApproval: before.requiresApproval, approvalReason: before.approvalReason };
      break;
    case 'SET_DISCOUNT_POLICY':
      orderedBefore = { serviceId: before.serviceId, countryCode: before.countryCode, maxAutoDiscountPct: before.maxAutoDiscountPct, maxDiscountWithApprovalPct: before.maxDiscountWithApprovalPct };
      break;
    case 'SET_MINIMUM_PRICE':
      orderedBefore = { serviceId: before.serviceId, countryCode: before.countryCode, minimumPrice: before.minimumPrice };
      break;
    case 'SET_MARKET_STYLE':
      orderedBefore = { countryCode: before.countryCode, field: before.field, value: before.value };
      break;
    case 'SET_MARKET_SEND_WINDOW':
      orderedBefore = { countryCode: before.countryCode, start: before.start, end: before.end };
      break;
    case 'SET_AGENT_ENABLED':
      orderedBefore = { agentName: before.agentName, enabled: before.enabled };
      break;
    case 'SET_AGENT_THRESHOLD':
      orderedBefore = { agentName: before.agentName, threshold: before.threshold };
      break;
    case 'SET_COST_LIMIT':
      orderedBefore = { key: before.key, value: before.value };
      break;
    case 'ACTIVATE_KILL_SWITCH':
      orderedBefore = { globalKillSwitch: before.globalKillSwitch, shadowMode: before.shadowMode };
      break;
    default:
      break;
  }

  return { ...preview, before: orderedBefore };
}

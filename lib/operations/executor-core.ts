export type OperationalChannel = 'EMAIL' | 'WHATSAPP';

export type OperationalInbound = {
  organizationId: string;
  leadId: string | null;
  conversationId: string | null;
  channel: OperationalChannel;
  providerMessageId: string | null;
  body: string;
};

export type OperationalSafetyState = {
  leadStatus?: string | null;
  leadAgentMode?: string | null;
  conversationStage?: string | null;
  conversationAgentMode?: string | null;
  conversationRequiresHuman?: boolean;
  globalKillSwitch?: boolean;
  agentsPaused?: boolean;
};

export type OperationalChannelControlState = {
  channel: OperationalChannel;
  globalKillSwitch?: boolean;
  agentsPaused?: boolean;
  emailPaused?: boolean;
  whatsappAiPaused?: boolean;
};

export type AutomationRuleSnapshot = {
  id: string;
  triggerKey: string;
  actionKey: string;
  priority: number;
  config: Record<string, unknown>;
};

const TERMINAL_LEAD_STATES = new Set(['WON', 'LOST', 'DO_NOT_CONTACT', 'HUMAN']);
const TERMINAL_CONVERSATION_STAGES = new Set(['WON', 'LOST', 'DO_NOT_CONTACT', 'SPAM', 'PAUSED', 'NEEDS_HUMAN']);
const SAFE_AUTOMATION_ACTIONS = new Set(['REQUIRE_HUMAN', 'PAUSE_AUTOMATION', 'SET_STAGE', 'QUEUE_TEMPLATE_APPROVAL']);
const SAFE_STAGES = new Set(['NEW','ACTIVE','CLOSING','WAITING_CUSTOMER','UNANSWERED','HOT','NEEDS_HUMAN','FOLLOW_UP_DUE','WON','LOST','DO_NOT_CONTACT','SPAM','PAUSED']);

export function stableAgentRequestKey(channel: string, providerMessageId: string) {
  const normalizedChannel = channel.trim().toLowerCase();
  const normalizedId = providerMessageId.trim();
  if (!['email', 'whatsapp'].includes(normalizedChannel)) throw new Error('Unsupported inbound channel');
  if (!normalizedId) throw new Error('providerMessageId is required');
  return `agent:${normalizedChannel}:${normalizedId}`;
}

export function conversationIdFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  for (const key of ['conversationId', 'conversation_id']) {
    const value = typeof row[key] === 'string' ? row[key].trim() : '';
    if (value) return value;
  }
  return null;
}

export function operationalAutomationAllowed(state: OperationalSafetyState) {
  if (state.globalKillSwitch) return { allowed: false, reason: 'GLOBAL_KILL_SWITCH' as const };
  if (state.agentsPaused) return { allowed: false, reason: 'AGENTS_PAUSED' as const };
  if (TERMINAL_LEAD_STATES.has(String(state.leadStatus ?? ''))) return { allowed: false, reason: 'LEAD_TERMINAL_OR_HUMAN' as const };
  if (state.leadAgentMode === 'PAUSED' || state.leadAgentMode === 'HUMAN') return { allowed: false, reason: 'LEAD_AUTOMATION_DISABLED' as const };
  if (TERMINAL_CONVERSATION_STAGES.has(String(state.conversationStage ?? ''))) return { allowed: false, reason: 'CONVERSATION_TERMINAL_OR_HUMAN' as const };
  if (state.conversationAgentMode === 'PAUSED' || state.conversationAgentMode === 'HUMAN' || state.conversationRequiresHuman) return { allowed: false, reason: 'CONVERSATION_AUTOMATION_DISABLED' as const };
  return { allowed: true, reason: 'ALLOWED' as const };
}

export function operationalChannelAllowed(state: OperationalChannelControlState) {
  if (state.globalKillSwitch) return { allowed: false, reason: 'GLOBAL_KILL_SWITCH' as const };
  if (state.agentsPaused) return { allowed: false, reason: 'AGENTS_PAUSED' as const };
  if (state.channel === 'EMAIL' && state.emailPaused) return { allowed: false, reason: 'EMAIL_PAUSED' as const };
  if (state.channel === 'WHATSAPP' && state.whatsappAiPaused) return { allowed: false, reason: 'WHATSAPP_AI_PAUSED' as const };
  return { allowed: true, reason: 'ALLOWED' as const };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase()) : [];
}

export function ruleMatchesEvent(input: {
  rule: AutomationRuleSnapshot;
  triggerKey: string;
  channel?: string | null;
  leadStatus?: string | null;
  conversationStage?: string | null;
}) {
  if (input.rule.triggerKey !== input.triggerKey) return false;
  const channels = stringArray(input.rule.config.channels);
  if (channels.length && !channels.includes(String(input.channel ?? '').toUpperCase())) return false;
  const leadStatuses = stringArray(input.rule.config.lead_statuses);
  if (leadStatuses.length && !leadStatuses.includes(String(input.leadStatus ?? '').toUpperCase())) return false;
  const stages = stringArray(input.rule.config.conversation_stages);
  if (stages.length && !stages.includes(String(input.conversationStage ?? '').toUpperCase())) return false;
  return true;
}

export function chooseSafeAutomationRule(input: {
  rules: AutomationRuleSnapshot[];
  triggerKey: string;
  channel?: string | null;
  leadStatus?: string | null;
  conversationStage?: string | null;
}) {
  const matching = input.rules
    .filter((rule) => ruleMatchesEvent({ ...input, rule }))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const selected = matching[0] ?? null;
  if (!selected) return { action: 'NONE' as const, rule: null };
  if (!SAFE_AUTOMATION_ACTIONS.has(selected.actionKey)) {
    return { action: 'BLOCKED_UNSAFE_ACTION' as const, rule: selected };
  }
  if (selected.actionKey === 'SET_STAGE') {
    const stage = typeof selected.config.stage === 'string' ? selected.config.stage.toUpperCase() : '';
    if (!SAFE_STAGES.has(stage)) return { action: 'BLOCKED_INVALID_CONFIG' as const, rule: selected };
  }
  if (selected.actionKey === 'QUEUE_TEMPLATE_APPROVAL') {
    const templateId = typeof selected.config.message_template_id === 'string' ? selected.config.message_template_id.trim() : '';
    if (!templateId) return { action: 'BLOCKED_INVALID_CONFIG' as const, rule: selected };
  }
  return { action: selected.actionKey as 'REQUIRE_HUMAN'|'PAUSE_AUTOMATION'|'SET_STAGE'|'QUEUE_TEMPLATE_APPROVAL', rule: selected };
}

export function followupStopReason(input: {
  safety: OperationalSafetyState;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
}) {
  const safety = operationalAutomationAllowed(input.safety);
  if (!safety.allowed) return safety.reason;
  if (input.lastInboundAt && (!input.lastOutboundAt || new Date(input.lastInboundAt).getTime() >= new Date(input.lastOutboundAt).getTime())) {
    return 'CUSTOMER_REPLIED' as const;
  }
  return null;
}

export function operationalAlertCodeForBudgetMode(mode: string) {
  if (mode === 'WARNING') return 'COST_WARNING' as const;
  if (mode === 'THROTTLED') return 'COST_THROTTLE' as const;
  if (mode === 'CRITICAL' || mode === 'HARD_STOP') return 'COST_CRITICAL' as const;
  return null;
}

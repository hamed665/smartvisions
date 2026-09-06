import type { PanelParityCommand } from './panel-parity-types';

export type TelegramCostLimitKey =
  | 'monthly_total_budget_usd'
  | 'openai_budget_usd'
  | 'google_places_budget_usd'
  | 'email_budget_usd'
  | 'whatsapp_budget_usd'
  | 'daily_new_leads'
  | 'daily_website_audits'
  | 'daily_deep_ai_runs'
  // Compatibility-only legacy parser keys. The live control plane rejects them.
  | 'resend_budget_usd'
  | 'meta_budget_usd'
  | 'daily_outreach_limit';

export type TelegramMarketStyleField =
  | 'tone'
  | 'dialect'
  | 'primaryLocale'
  | 'fallbackLocale'
  | 'dialectIntensity'
  | 'maxFirstTouchWords'
  | 'maxReplyWords';

export type TelegramOwnerCommand =
  | { type: 'SHOW_STATUS' }
  | { type: 'LIST_SERVICES' }
  | { type: 'SHOW_PRICING'; countryCode?: string; serviceQuery?: string }
  | { type: 'SHOW_LEADS'; limit?: number; stage?: string }
  | { type: 'SHOW_MARKETS' }
  | { type: 'SHOW_MARKET_POLICY'; countryCode: string }
  | { type: 'SHOW_AGENTS' }
  | { type: 'SHOW_BUDGET' }
  | { type: 'SHOW_APPROVALS'; limit?: number }
  | { type: 'SHOW_CAMPAIGNS'; limit?: number }
  | { type: 'SHOW_PANEL_CAPABILITIES' }
  | { type: 'TEST_OWNER_ALERT' }
  | { type: 'SAFETY_BLOCK'; reason: 'SHADOW_MODE' | 'KILL_SWITCH_OFF' | 'SECRETS' | 'DNC_BYPASS' | 'AUTO_COLD_CHANNEL' | 'APPROVAL_BYPASS' }
  | { type: 'CATALOG_COMPOSE'; rawText: string }
  | { type: 'SET_PRICE'; countryCode: string; serviceQuery: string; price: number }
  | { type: 'SET_DISCOUNT_POLICY'; countryCode: string; serviceQuery: string; maxAutoDiscountPct: number; maxDiscountWithApprovalPct: number }
  | { type: 'SET_MINIMUM_PRICE'; countryCode: string; serviceQuery: string; minimumPrice: number }
  | { type: 'SET_SERVICE_ENABLED'; serviceQuery: string; enabled: boolean }
  | { type: 'SET_SERVICE_OPTION'; serviceQuery: string; optionKey: string; value: string | number | boolean }
  | { type: 'CREATE_HUNTER_CAMPAIGN'; countryCode: string; industry: string; city?: string; targetCount?: number }
  | { type: 'SET_MARKET_ENABLED'; countryCode: string; enabled: boolean }
  | { type: 'SET_MARKET_STYLE'; countryCode: string; field: TelegramMarketStyleField; value: string | number }
  | { type: 'SET_MARKET_SEND_WINDOW'; countryCode: string; start: string; end: string }
  | { type: 'SET_AGENT_ENABLED'; agentQuery: string; enabled: boolean }
  | { type: 'SET_AGENT_THRESHOLD'; agentQuery: string; threshold: number }
  | { type: 'SET_COST_LIMIT'; key: TelegramCostLimitKey; value: number }
  | { type: 'ACTIVATE_KILL_SWITCH' }
  | { type: 'SET_PAUSE'; target: 'AGENTS' | 'EMAIL' | 'WHATSAPP'; paused: boolean }
  | { type: 'APPROVE_MESSAGE'; messageId: string }
  | { type: 'REJECT_MESSAGE'; messageId: string; reason?: string }
  | PanelParityCommand
  | { type: 'REVERT_LAST_CHANGE'; targetRunId?: string }
  | { type: 'HELP' };

export type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number | string; type?: string };
  from?: { id: number | string; username?: string; first_name?: string };
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from: { id: number | string; username?: string; first_name?: string };
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type CommandExecutionResult = {
  title: string;
  text: string;
  before?: unknown;
  after?: unknown;
  entityType?: string;
  entityId?: string;
  requiresConfirmation?: boolean;
};

export type TelegramNotificationType =
  | 'NEW_LEAD'
  | 'HOT_LEAD'
  | 'SALES_HANDOFF'
  | 'DISCOUNT_REQUEST'
  | 'CONSULTATION_REQUEST'
  | 'SYSTEM_ALERT';

export const MUTATING_COMMANDS = new Set<TelegramOwnerCommand['type']>([
  'CATALOG_COMPOSE','SET_PRICE','SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE','SET_SERVICE_ENABLED','SET_SERVICE_OPTION','CREATE_HUNTER_CAMPAIGN','SET_MARKET_ENABLED','SET_MARKET_STYLE','SET_MARKET_SEND_WINDOW','SET_AGENT_ENABLED','SET_AGENT_THRESHOLD','SET_COST_LIMIT','ACTIVATE_KILL_SWITCH','SET_PAUSE','APPROVE_MESSAGE','REJECT_MESSAGE','PANEL_ACTION','REVERT_LAST_CHANGE',
]);

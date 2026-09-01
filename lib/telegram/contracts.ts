export type TelegramOwnerCommand =
  | { type: 'SHOW_STATUS' }
  | { type: 'LIST_SERVICES' }
  | { type: 'SHOW_PRICING'; countryCode?: string; serviceQuery?: string }
  | { type: 'SHOW_LEADS'; limit?: number; stage?: string }
  | { type: 'SET_PRICE'; countryCode: string; serviceQuery: string; price: number }
  | { type: 'SET_SERVICE_ENABLED'; serviceQuery: string; enabled: boolean }
  | { type: 'SET_SERVICE_OPTION'; serviceQuery: string; optionKey: string; value: string | number | boolean }
  | { type: 'CREATE_HUNTER_CAMPAIGN'; countryCode: string; industry: string; city?: string; targetCount?: number }
  | { type: 'SET_MARKET_ENABLED'; countryCode: string; enabled: boolean }
  | { type: 'SET_PAUSE'; target: 'AGENTS' | 'EMAIL' | 'WHATSAPP'; paused: boolean }
  | { type: 'APPROVE_MESSAGE'; messageId: string }
  | { type: 'REJECT_MESSAGE'; messageId: string; reason?: string }
  | { type: 'REVERT_LAST_CHANGE' }
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

export const MUTATING_COMMANDS = new Set<TelegramOwnerCommand['type']>([
  'SET_PRICE',
  'SET_SERVICE_ENABLED',
  'SET_SERVICE_OPTION',
  'CREATE_HUNTER_CAMPAIGN',
  'SET_MARKET_ENABLED',
  'SET_PAUSE',
  'APPROVE_MESSAGE',
  'REJECT_MESSAGE',
  'REVERT_LAST_CHANGE',
]);

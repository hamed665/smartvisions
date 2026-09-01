export type TelegramRuntimeConfig = {
  botToken: string;
  webhookSecret: string;
  ownerUserId: string;
  ownerChatId: string;
  organizationId: string;
};

const env = (key: string) => String(process.env[key] ?? '').trim();

export function getTelegramRuntimeConfig(): TelegramRuntimeConfig | null {
  const botToken = env('TELEGRAM_BOT_TOKEN');
  const webhookSecret = env('TELEGRAM_WEBHOOK_SECRET');
  const ownerUserId = env('TELEGRAM_OWNER_USER_ID');
  const ownerChatId = env('TELEGRAM_OWNER_CHAT_ID');
  const organizationId = env('TELEGRAM_ORGANIZATION_ID');
  if (!botToken || !webhookSecret || !ownerUserId || !ownerChatId || !organizationId) return null;
  return { botToken, webhookSecret, ownerUserId, ownerChatId, organizationId };
}

export function requireTelegramRuntimeConfig() {
  const config = getTelegramRuntimeConfig();
  if (!config) throw new Error('Telegram owner assistant is not configured');
  return config;
}

export function isAuthorizedTelegramOwner(input: { userId?: string | number; chatId?: string | number }, config: TelegramRuntimeConfig) {
  return String(input.userId ?? '') === config.ownerUserId && String(input.chatId ?? '') === config.ownerChatId;
}

export function verifyTelegramWebhookSecret(headerValue: string | null, config: TelegramRuntimeConfig) {
  return Boolean(headerValue) && headerValue === config.webhookSecret;
}

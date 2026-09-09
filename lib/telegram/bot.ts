export type TelegramInlineButton = { text: string; callback_data: string };

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
}

export function telegramCredentialReady() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_WEBHOOK_SECRET?.trim());
}

export async function sendTelegramMessage(input: {
  chatId: string;
  text: string;
  buttons?: TelegramInlineButton[][];
}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text.slice(0, 3900),
      disable_web_page_preview: true,
      reply_markup: input.buttons?.length ? { inline_keyboard: input.buttons } : undefined,
    }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
  if (!response.ok || payload?.ok !== true) throw new Error(`Telegram send failed: ${payload?.description ?? `HTTP ${response.status}`}`);
  return Number(payload.result?.message_id ?? 0) || null;
}

export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text.slice(0, 180) }),
  });
  if (!response.ok) throw new Error(`Telegram callback answer failed with HTTP ${response.status}`);
}

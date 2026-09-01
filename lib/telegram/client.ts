import { requireTelegramRuntimeConfig } from './config';

type InlineButton = { text: string; callback_data?: string; url?: string };
type ReplyMarkup = { inline_keyboard: InlineButton[][] };

async function telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const { botToken } = requireTelegramRuntimeConfig();
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !body?.ok) {
    throw new Error(`Telegram ${method} failed: ${String(body?.description ?? response.statusText).slice(0, 240)}`);
  }
  return body.result as T;
}

export async function sendTelegramMessage(input: { chatId?: string; text: string; replyMarkup?: ReplyMarkup; disableWebPagePreview?: boolean }) {
  const config = requireTelegramRuntimeConfig();
  const result = await telegramApi<{ message_id: number }>('sendMessage', {
    chat_id: input.chatId ?? config.ownerChatId,
    text: input.text.slice(0, 3900),
    disable_web_page_preview: input.disableWebPagePreview ?? true,
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  });
  return { messageId: result.message_id };
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  await telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 180) } : {}),
  });
}

export function confirmationKeyboard(token: string): ReplyMarkup {
  return {
    inline_keyboard: [[
      { text: '✅ تأیید', callback_data: `tg:ok:${token}` },
      { text: '❌ لغو', callback_data: `tg:no:${token}` },
    ]],
  };
}

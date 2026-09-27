export type TelegramCustomerMediaKind =
  | 'PHOTO'
  | 'DOCUMENT'
  | 'AUDIO'
  | 'VOICE'
  | 'VIDEO'
  | 'VIDEO_NOTE'
  | 'STICKER';

export type TelegramCustomerMedia = {
  kind: TelegramCustomerMediaKind;
  fileId: string;
  fileUniqueId: string | null;
  fileSize: number | null;
  mimeType: string | null;
  fileName: string | null;
};

export type NormalizedTelegramCustomerEvent = {
  updateId: number;
  eventType: 'MESSAGE' | 'EDITED_MESSAGE' | 'CALLBACK_QUERY';
  providerMessageId: string | null;
  chatId: string;
  chatType: string;
  senderId: string | null;
  senderIsBot: boolean;
  text: string | null;
  occurredAt: string | null;
  media: TelegramCustomerMedia[];
  callbackQueryId: string | null;
  callbackData: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 8192) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveId(value: unknown) {
  const parsed = integer(value);
  return parsed !== null && parsed > 0 ? String(parsed) : null;
}

function fileSize(value: unknown) {
  const parsed = integer(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function mediaFromObject(kind: TelegramCustomerMediaKind, value: unknown): TelegramCustomerMedia | null {
  const row = object(value);
  const fileId = text(row?.file_id, 512);
  if (!row || !fileId) return null;
  return {
    kind,
    fileId,
    fileUniqueId: text(row.file_unique_id, 512),
    fileSize: fileSize(row.file_size),
    mimeType: text(row.mime_type, 160),
    fileName: text(row.file_name, 180),
  };
}

function photoMedia(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const choices = value
    .map((item) => {
      const row = object(item);
      const media = mediaFromObject('PHOTO', row);
      if (!media) return null;
      return {
        media,
        size: fileSize(row?.file_size) ?? 0,
        area: Math.max(0, Number(row?.width ?? 0)) * Math.max(0, Number(row?.height ?? 0)),
      };
    })
    .filter((item): item is { media: TelegramCustomerMedia; size: number; area: number } => Boolean(item));
  if (!choices.length) return null;
  choices.sort((a, b) => b.size - a.size || b.area - a.area);
  return choices[0].media;
}

function mediaFromMessage(message: Record<string, unknown>) {
  const candidates: Array<TelegramCustomerMedia | null> = [
    photoMedia(message.photo),
    mediaFromObject('DOCUMENT', message.document),
    mediaFromObject('AUDIO', message.audio),
    mediaFromObject('VOICE', message.voice),
    mediaFromObject('VIDEO', message.video),
    mediaFromObject('VIDEO_NOTE', message.video_note),
    mediaFromObject('STICKER', message.sticker),
  ];
  return candidates.filter((item): item is TelegramCustomerMedia => Boolean(item)).slice(0, 4);
}

function messageEvent(
  updateId: number,
  eventType: 'MESSAGE' | 'EDITED_MESSAGE',
  value: unknown,
): NormalizedTelegramCustomerEvent | null {
  const message = object(value);
  const chat = object(message?.chat);
  const sender = object(message?.from);
  const messageId = integer(message?.message_id);
  const chatId = positiveId(chat?.id) ?? (typeof chat?.id === 'number' && chat.id < 0 ? String(chat.id) : null);
  if (!message || messageId === null || !chatId) return null;

  const unix = integer(message.date);
  return {
    updateId,
    eventType,
    providerMessageId: `${chatId}:${messageId}`,
    chatId,
    chatType: text(chat?.type, 32) ?? 'unknown',
    senderId: positiveId(sender?.id),
    senderIsBot: sender?.is_bot === true,
    text: text(message.text) ?? text(message.caption),
    occurredAt: unix !== null && unix > 0 ? new Date(unix * 1000).toISOString() : null,
    media: mediaFromMessage(message),
    callbackQueryId: null,
    callbackData: null,
  };
}

function callbackEvent(updateId: number, value: unknown): NormalizedTelegramCustomerEvent | null {
  const callback = object(value);
  const sender = object(callback?.from);
  const message = object(callback?.message);
  const chat = object(message?.chat);
  const callbackId = text(callback?.id, 256);
  const chatId = positiveId(chat?.id) ?? (typeof chat?.id === 'number' && chat.id < 0 ? String(chat.id) : null);
  if (!callback || !callbackId || !chatId) return null;
  const messageId = integer(message?.message_id);
  return {
    updateId,
    eventType: 'CALLBACK_QUERY',
    providerMessageId: messageId === null ? null : `${chatId}:${messageId}`,
    chatId,
    chatType: text(chat?.type, 32) ?? 'unknown',
    senderId: positiveId(sender?.id),
    senderIsBot: sender?.is_bot === true,
    text: null,
    occurredAt: null,
    media: [],
    callbackQueryId: callbackId,
    callbackData: text(callback.data, 256),
  };
}

export function normalizeTelegramCustomerUpdate(value: unknown): NormalizedTelegramCustomerEvent | null {
  const update = object(value);
  const updateId = integer(update?.update_id);
  if (!update || updateId === null || updateId < 0) {
    throw new Error('Telegram customer update_id is required');
  }
  if (update.message) return messageEvent(updateId, 'MESSAGE', update.message);
  if (update.edited_message) return messageEvent(updateId, 'EDITED_MESSAGE', update.edited_message);
  if (update.callback_query) return callbackEvent(updateId, update.callback_query);
  return null;
}

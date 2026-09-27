import {
  extractProviderRateLimitEvidence,
  ProviderHttpError,
  type ProviderRateLimitEvidence,
} from '@/lib/omnichannel/rate-limit-evidence';

const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
export const TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

type ApiEnvelope<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
};

type TelegramMessageResult = {
  message_id?: number;
  chat?: { id?: number | string };
};

function validToken(value: string) {
  return /^[1-9][0-9]{4,19}:[A-Za-z0-9_-]{20,240}$/.test(value);
}

function safeToken(value: string) {
  const token = value.trim();
  if (!validToken(token)) throw new Error('Telegram Bot token format is invalid');
  return token;
}

function apiUrl(token: string, method: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(method)) throw new Error('Telegram Bot API method is invalid');
  return `${TELEGRAM_API_ORIGIN}/bot${safeToken(token)}/${method}`;
}

function fileUrl(token: string, path: string) {
  const safePath = path.trim();
  if (!safePath || safePath.length > 512 || safePath.includes('..') || safePath.startsWith('/')) {
    throw new Error('Telegram file path is invalid');
  }
  return `${TELEGRAM_API_ORIGIN}/file/bot${safeToken(token)}/${safePath}`;
}

function mergeRetryEvidence(
  base: ProviderRateLimitEvidence | null,
  retryAfter: unknown,
): ProviderRateLimitEvidence | null {
  const retry = Number(retryAfter);
  const retryAfterSeconds = Number.isFinite(retry) && retry >= 0 ? retry : null;
  if (!base && retryAfterSeconds === null) return null;
  const observedAt = base?.observedAt ?? new Date().toISOString();
  return {
    observedAt,
    limit: base?.limit ?? null,
    remaining: base?.remaining ?? null,
    resetSeconds: base?.resetSeconds ?? null,
    retryAfterSeconds: retryAfterSeconds ?? base?.retryAfterSeconds ?? null,
    appUsage: base?.appUsage ?? null,
    businessUsage: base?.businessUsage ?? null,
  };
}

async function decode<T>(response: Response): Promise<{ body: ApiEnvelope<T>; evidence: ProviderRateLimitEvidence | null }> {
  const evidenceFromHeaders = extractProviderRateLimitEvidence(response.headers);
  let body: ApiEnvelope<T>;
  try {
    body = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new ProviderHttpError(
      `Telegram Bot API returned invalid JSON (${response.status})`,
      response.status,
      evidenceFromHeaders,
    );
  }
  const evidence = mergeRetryEvidence(evidenceFromHeaders, body.parameters?.retry_after);
  if (!response.ok || body.ok !== true || body.result === undefined) {
    const description = typeof body.description === 'string'
      ? body.description.replace(/https?:\/\/\S+/g, '[url]').slice(0, 300)
      : 'Telegram Bot API request failed';
    throw new ProviderHttpError(
      `Telegram Bot API request failed (${response.status}): ${description}`,
      Number(body.error_code) || response.status,
      evidence,
    );
  }
  return { body, evidence };
}

async function jsonRequest<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(apiUrl(token, method), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'error',
  });
  const decoded = await decode<T>(response);
  return { result: decoded.body.result as T, rateLimit: decoded.evidence };
}

function providerMessageId(result: TelegramMessageResult) {
  const messageId = Number(result.message_id);
  const chatId = result.chat?.id;
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || chatId === undefined || chatId === null) {
    throw new Error('Telegram Bot API response did not include canonical message identity');
  }
  return `${String(chatId)}:${messageId}`;
}

export type TelegramCustomerSendResult = {
  providerMessageId: string;
  status: 'accepted';
  rateLimit?: ProviderRateLimitEvidence | null;
};

export class TelegramCustomerProvider {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(input: { token: string; fetchImpl?: typeof fetch }) {
    this.token = safeToken(input.token);
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async getMe() {
    const value = await jsonRequest<{ id?: number; is_bot?: boolean; username?: string }>(
      this.token,
      'getMe',
      {},
      this.fetchImpl,
    );
    const id = Number(value.result.id);
    const username = typeof value.result.username === 'string' ? value.result.username.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || value.result.is_bot !== true || !username) {
      throw new Error('Telegram Bot identity verification failed');
    }
    return { id: String(id), username, rateLimit: value.rateLimit };
  }

  async setWebhook(input: { url: string; secretToken: string }) {
    const url = new URL(input.url);
    if (url.protocol !== 'https:') throw new Error('Telegram webhook URL must use HTTPS');
    const secretToken = input.secretToken.trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(secretToken)) {
      throw new Error('Telegram webhook secret token is invalid');
    }
    return jsonRequest<boolean>(
      this.token,
      'setWebhook',
      {
        url: url.toString(),
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: false,
      },
      this.fetchImpl,
    );
  }

  async getWebhookInfo() {
    return jsonRequest<{
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }>(this.token, 'getWebhookInfo', {}, this.fetchImpl);
  }

  async sendText(input: { chatId: string; text: string; replyToMessageId?: number | null }): Promise<TelegramCustomerSendResult> {
    const text = input.text.trim();
    if (!input.chatId.trim() || !text || text.length > 4096) {
      throw new Error('Telegram customer text payload is invalid');
    }
    const payload: Record<string, unknown> = { chat_id: input.chatId.trim(), text };
    if (input.replyToMessageId && Number.isSafeInteger(input.replyToMessageId) && input.replyToMessageId > 0) {
      payload.reply_parameters = { message_id: input.replyToMessageId };
    }
    const value = await jsonRequest<TelegramMessageResult>(this.token, 'sendMessage', payload, this.fetchImpl);
    const id = providerMessageId(value.result);
    return { providerMessageId: id, status: 'accepted', ...(value.rateLimit ? { rateLimit: value.rateLimit } : {}) };
  }

  async sendMedia(input: {
    chatId: string;
    kind: 'PHOTO' | 'DOCUMENT' | 'AUDIO' | 'VOICE' | 'VIDEO';
    blob: Blob;
    filename: string;
    caption?: string | null;
  }): Promise<TelegramCustomerSendResult> {
    if (!input.chatId.trim() || input.blob.size < 1 || input.blob.size > TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES) {
      throw new Error('Telegram outbound media is outside the safe size bound');
    }
    const methodByKind = {
      PHOTO: ['sendPhoto', 'photo'],
      DOCUMENT: ['sendDocument', 'document'],
      AUDIO: ['sendAudio', 'audio'],
      VOICE: ['sendVoice', 'voice'],
      VIDEO: ['sendVideo', 'video'],
    } as const;
    const [method, field] = methodByKind[input.kind];
    const form = new FormData();
    form.append('chat_id', input.chatId.trim());
    if (input.caption?.trim()) form.append('caption', input.caption.trim().slice(0, 1024));
    form.append(field, input.blob, input.filename.trim().slice(0, 180) || 'attachment');

    const response = await this.fetchImpl(apiUrl(this.token, method), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
      cache: 'no-store',
      redirect: 'error',
    });
    const decoded = await decode<TelegramMessageResult>(response);
    const id = providerMessageId(decoded.body.result as TelegramMessageResult);
    return { providerMessageId: id, status: 'accepted', ...(decoded.evidence ? { rateLimit: decoded.evidence } : {}) };
  }

  async downloadMedia(input: { fileId: string; declaredSize?: number | null; declaredMimeType?: string | null }) {
    const fileId = input.fileId.trim();
    if (!fileId || fileId.length > 512) throw new Error('Telegram file_id is invalid');
    if (input.declaredSize !== null && input.declaredSize !== undefined && input.declaredSize > TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES) {
      throw new Error('Telegram media exceeds the Smart Core 10 MiB inbound bound');
    }

    const info = await jsonRequest<{ file_path?: string; file_size?: number }>(
      this.token,
      'getFile',
      { file_id: fileId },
      this.fetchImpl,
    );
    const path = typeof info.result.file_path === 'string' ? info.result.file_path.trim() : '';
    const providerSize = Number(info.result.file_size);
    if (!path) throw new Error('Telegram getFile did not return a file path');
    if (Number.isFinite(providerSize) && providerSize > TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES) {
      throw new Error('Telegram media exceeds the Smart Core 10 MiB inbound bound');
    }

    const response = await this.fetchImpl(fileUrl(this.token, path), {
      method: 'GET',
      headers: { Accept: '*/*' },
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) {
      throw new ProviderHttpError(
        `Telegram file download failed (${response.status})`,
        response.status,
        extractProviderRateLimitEvidence(response.headers),
      );
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error('Telegram media exceeds the Smart Core 10 MiB inbound bound');
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1 || buffer.byteLength > TELEGRAM_CUSTOMER_MEDIA_MAX_BYTES) {
      throw new Error('Telegram media exceeds the Smart Core 10 MiB inbound bound');
    }
    const upstream = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    const declared = input.declaredMimeType?.trim().toLowerCase() ?? '';
    const contentType = declared || upstream || 'application/octet-stream';
    return {
      blob: new Blob([buffer], { type: contentType }),
      contentType,
      size: buffer.byteLength,
      rateLimit: info.rateLimit,
    };
  }
}

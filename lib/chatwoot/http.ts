import 'server-only';

import {
  classifyChatwootHttpStatus,
  isChatwootReadMethod,
  isRetryableChatwootReadStatus,
  mutationOutcomeMayBeAmbiguous,
  normalizeChatwootBaseUrl,
  normalizeChatwootRequestPath,
  parseRetryAfterMs,
  type ChatwootHttpErrorCode,
  type ChatwootHttpMethod,
} from '@/lib/chatwoot/http-contract';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_READ_ATTEMPTS = 3;

type ChatwootAuth =
  | { kind: 'platform' }
  | { kind: 'user'; accessToken: string };

export class ChatwootHttpError extends Error {
  code: ChatwootHttpErrorCode;
  status: number | null;
  retryable: boolean;
  ambiguousMutationOutcome: boolean;

  constructor(input: {
    code: ChatwootHttpErrorCode;
    message: string;
    status?: number | null;
    retryable?: boolean;
    ambiguousMutationOutcome?: boolean;
  }) {
    super(input.message);
    this.name = 'ChatwootHttpError';
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = Boolean(input.retryable);
    this.ambiguousMutationOutcome = Boolean(input.ambiguousMutationOutcome);
  }
}

function provisioningEnabled() {
  return process.env.CHATWOOT_PROVISIONING_ENABLED === 'true';
}

function baseUrl() {
  const normalized = normalizeChatwootBaseUrl(process.env.CHATWOOT_BASE_URL, {
    allowInsecureLocalhost: process.env.NODE_ENV !== 'production',
  });

  if (!normalized) {
    throw new ChatwootHttpError({
      code: 'CONFIG_INVALID',
      message: 'Chatwoot base URL is invalid',
    });
  }

  return normalized;
}

function platformToken() {
  const token = process.env.CHATWOOT_PLATFORM_TOKEN?.trim();
  if (!token) {
    throw new ChatwootHttpError({
      code: 'CONFIG_INVALID',
      message: 'Chatwoot Platform token is not configured',
    });
  }
  return token;
}

function authToken(auth: ChatwootAuth) {
  if (auth.kind === 'platform') return platformToken();

  const token = auth.accessToken.trim();
  if (!token) {
    throw new ChatwootHttpError({
      code: 'CONFIG_INVALID',
      message: 'Chatwoot user access token is missing',
    });
  }
  return token;
}

function requestUrl(path: string) {
  const normalizedPath = normalizeChatwootRequestPath(path);
  if (!normalizedPath) {
    throw new ChatwootHttpError({
      code: 'CONFIG_INVALID',
      message: 'Chatwoot request path is invalid',
    });
  }
  return new URL(normalizedPath, baseUrl()).toString();
}

async function readBoundedResponse(response: Response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const bytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(bytes) && bytes > MAX_RESPONSE_BYTES) {
      throw new ChatwootHttpError({
        code: 'RESPONSE_TOO_LARGE',
        message: 'Chatwoot response exceeded the configured size limit',
        status: response.status,
      });
    }
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ChatwootHttpError({
          code: 'RESPONSE_TOO_LARGE',
          message: 'Chatwoot response exceeded the configured size limit',
          status: response.status,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chatwootProvisioningRequest<T>(input: {
  path: string;
  method?: ChatwootHttpMethod;
  auth: ChatwootAuth;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  if (!provisioningEnabled()) {
    throw new ChatwootHttpError({
      code: 'PROVISIONING_DISABLED',
      message: 'Chatwoot provisioning is disabled',
    });
  }

  const method = input.method ?? 'GET';
  if (isChatwootReadMethod(method) && input.body !== undefined) {
    throw new ChatwootHttpError({
      code: 'CONFIG_INVALID',
      message: 'Chatwoot GET requests cannot include a body',
    });
  }

  let requestBody: string | undefined;
  if (input.body !== undefined) {
    try {
      requestBody = JSON.stringify(input.body);
    } catch {
      throw new ChatwootHttpError({
        code: 'CONFIG_INVALID',
        message: 'Chatwoot request body is not serializable',
      });
    }
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const token = authToken(input.auth);
  const url = requestUrl(input.path);
  const timeoutMs = Math.min(
    Math.max(Math.trunc(input.timeoutMs ?? DEFAULT_TIMEOUT_MS), 1_000),
    30_000,
  );
  const attempts = isChatwootReadMethod(method) ? MAX_READ_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          api_access_token: token,
        },
        body: requestBody,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) {
        const classified = classifyChatwootHttpStatus(response.status);

        if (
          isChatwootReadMethod(method) &&
          classified.retryable &&
          isRetryableChatwootReadStatus(response.status) &&
          attempt < attempts
        ) {
          const retryAfterMs =
            response.status === 429
              ? parseRetryAfterMs(response.headers.get('retry-after'))
              : null;
          await sleep(retryAfterMs ?? 150 * 2 ** (attempt - 1));
          continue;
        }

        throw new ChatwootHttpError({
          code: classified.code,
          message: `Chatwoot request failed with HTTP ${response.status}`,
          status: response.status,
          retryable: isChatwootReadMethod(method) && classified.retryable,
          ambiguousMutationOutcome: mutationOutcomeMayBeAmbiguous({
            method,
            status: response.status,
          }),
        });
      }

      if (response.status === 204) return null as T;

      const text = await readBoundedResponse(response);
      if (!text) return null as T;

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ChatwootHttpError({
          code: 'INVALID_RESPONSE',
          message: 'Chatwoot returned invalid JSON',
          status: response.status,
        });
      }
    } catch (error) {
      if (error instanceof ChatwootHttpError) throw error;

      const networkFailure =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TypeError');

      if (isChatwootReadMethod(method) && networkFailure && attempt < attempts) {
        await sleep(150 * 2 ** (attempt - 1));
        continue;
      }

      throw new ChatwootHttpError({
        code: 'NETWORK_FAILED',
        message: 'Chatwoot network request failed',
        retryable: isChatwootReadMethod(method),
        ambiguousMutationOutcome: mutationOutcomeMayBeAmbiguous({
          method,
          networkFailure: true,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ChatwootHttpError({
    code: 'NETWORK_FAILED',
    message: 'Chatwoot request attempts exhausted',
    retryable: true,
  });
}

export function chatwootPlatformProvisioningRequest<T>(input: {
  path: string;
  method?: ChatwootHttpMethod;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  return chatwootProvisioningRequest<T>({
    ...input,
    auth: { kind: 'platform' },
  });
}

export function chatwootAccountProvisioningRequest<T>(input: {
  path: string;
  accessToken: string;
  method?: ChatwootHttpMethod;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const { accessToken, ...rest } = input;
  return chatwootProvisioningRequest<T>({
    ...rest,
    auth: { kind: 'user', accessToken },
  });
}

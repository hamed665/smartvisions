export type ChatwootHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ChatwootHttpErrorCode =
  | 'PROVISIONING_DISABLED'
  | 'CONFIG_INVALID'
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'UPSTREAM_FAILED'
  | 'NETWORK_FAILED'
  | 'REQUEST_TOO_LARGE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_RESPONSE';

export function normalizeChatwootBaseUrl(
  value: unknown,
  options: { allowInsecureLocalhost?: boolean } = {},
) {
  if (typeof value !== 'string' || !value.trim()) return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const local = localHosts.has(url.hostname);

  if (
    url.protocol !== 'https:' &&
    !(options.allowInsecureLocalhost && local && url.protocol === 'http:')
  ) {
    return null;
  }

  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;

  return url.origin;
}

export function normalizeChatwootRequestPath(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return null;
  }

  const rawPath = value.split(/[?#]/, 1)[0] ?? '';
  if (
    /[\x00-\x1F\x7F]/.test(value) ||
    /%2e/i.test(rawPath) ||
    /(^|/).{1,2}(?:/|$)/.test(rawPath) ||
    rawPath.includes('\\')
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, 'https://chatwoot.invalid');
  } catch {
    return null;
  }

  if (url.origin !== 'https://chatwoot.invalid' || url.hash) return null;
  if (!url.pathname.startsWith('/')) return null;

  return `${url.pathname}${url.search}`;
}

export function normalizeChatwootAccessToken(value: unknown) {
  if (typeof value !== 'string') return null;
  const token = value.trim();

  if (
    token.length < 1 ||
    token.length > 4096 ||
    /[\x00-\x1F\x7F]/.test(token)
  ) {
    return null;
  }

  return token;
}

export function isChatwootReadMethod(method: ChatwootHttpMethod) {
  return method === 'GET';
}

export function isRetryableChatwootReadStatus(status: number) {
  return [429, 500, 502, 503, 504].includes(status);
}

export function classifyChatwootHttpStatus(status: number): {
  code: ChatwootHttpErrorCode;
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: 'AUTH_FAILED', retryable: false };
  }

  if (status === 404) {
    return { code: 'NOT_FOUND', retryable: false };
  }

  if (status === 400 || status === 409 || status === 422) {
    return { code: 'VALIDATION_FAILED', retryable: false };
  }

  if (status === 429) {
    return { code: 'RATE_LIMITED', retryable: true };
  }

  if (status >= 500) {
    return { code: 'UPSTREAM_FAILED', retryable: true };
  }

  return { code: 'UPSTREAM_FAILED', retryable: false };
}

export function mutationOutcomeMayBeAmbiguous(input: {
  method: ChatwootHttpMethod;
  status?: number | null;
  networkFailure?: boolean;
}) {
  if (isChatwootReadMethod(input.method)) return false;
  if (input.networkFailure) return true;
  if (input.status === null || input.status === undefined) return true;
  return input.status >= 500;
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
  maxMs = 5_000,
) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), maxMs);
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;

  return Math.min(Math.max(dateMs - nowMs, 0), maxMs);
}


const MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991n;

export function preserveUnsafeJsonIntegers(text: string) {
  let output = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const char = text[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const start = index;
      if (text[index] === '-') index += 1;

      while (index < text.length && text[index] >= '0' && text[index] <= '9') {
        index += 1;
      }

      if (text[index] === '.') {
        index += 1;
        while (
          index < text.length &&
          text[index] >= '0' &&
          text[index] <= '9'
        ) {
          index += 1;
        }
      }

      if (text[index] === 'e' || text[index] === 'E') {
        index += 1;
        if (text[index] === '+' || text[index] === '-') index += 1;
        while (
          index < text.length &&
          text[index] >= '0' &&
          text[index] <= '9'
        ) {
          index += 1;
        }
      }

      const token = text.slice(start, index);
      if (/^-?[0-9]+$/.test(token)) {
        try {
          const value = BigInt(token);
          if (
            value > MAX_SAFE_JSON_INTEGER ||
            value < -MAX_SAFE_JSON_INTEGER
          ) {
            output += JSON.stringify(token);
            continue;
          }
        } catch {
          // JSON.parse below remains the source of truth for malformed numbers.
        }
      }

      output += token;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

export function parseChatwootJson(text: string): unknown {
  return JSON.parse(preserveUnsafeJsonIntegers(text));
}

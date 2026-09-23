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

  const local =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1';

  if (url.protocol !== 'https:' && !(options.allowInsecureLocalhost && local && url.protocol === 'http:')) {
    return null;
  }

  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;

  return url.origin;
}

export function isChatwootReadMethod(method: ChatwootHttpMethod) {
  return method === 'GET';
}

export function isRetryableChatwootReadStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
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
  if (status === 409 || status === 422) {
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

import { selectFirstPartyContactEmail } from './contact-evidence';
import { assertPublicHostname } from './public-dns';
import { analyzeWebsiteHtml, normalizeAuditUrl, type WebsiteAuditResult } from './website-audit';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

export type DeterministicWebsiteEvidence = {
  sourceUrl: string;
  htmlBytes: number;
  result: WebsiteAuditResult;
  firstPartyEmail: string | null;
};

export function safeWebsiteEvidenceError(error: unknown, fallback = 'Website audit failed') {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 240);
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = String(record.message ?? record.cause ?? '').trim();
    if (message) return message.slice(0, 240);
    const name = String(record.name ?? '').trim();
    const code = String(record.code ?? '').trim();
    if (name || code) return [name, code].filter(Boolean).join(' ').slice(0, 240);
  }
  const text = String(error ?? '').trim();
  return text && text !== '[object Object]' ? text.slice(0, 240) : fallback;
}

async function readLimitedText(response: Response): Promise<{ text: string; bytes: number }> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_BYTES) throw new Error('Website response is larger than the audit limit');
  if (!response.body) return { text: '', bytes: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Website response exceeded the audit limit');
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), bytes };
}

export async function fetchDeterministicWebsiteEvidence(startUrl: string): Promise<DeterministicWebsiteEvidence> {
  let url = normalizeAuditUrl(startUrl);
  const visited = new Set<string>();

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const normalized = url.toString();
    if (visited.has(normalized)) throw new Error(`Website redirect loop detected at ${url.origin}`);
    visited.add(normalized);
    await assertPublicHostname(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'user-agent': 'SmartVisionsWebsiteAudit/1.0' },
        });
      } catch (error) {
        throw new Error(`Website fetch failed at ${url.origin}: ${safeWebsiteEvidenceError(error, 'network error')}`);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Website redirect HTTP ${response.status} is missing a destination`);
        if (attempt >= MAX_REDIRECTS) throw new Error(`Website exceeded ${MAX_REDIRECTS} redirects`);
        url = normalizeAuditUrl(new URL(location, url).toString());
        continue;
      }

      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
      if (!(response.headers.get('content-type')?.toLowerCase() || '').includes('text/html')) {
        throw new Error('Website did not return HTML');
      }

      const body = await readLimitedText(response);
      const result = analyzeWebsiteHtml(body.text);
      return {
        sourceUrl: url.toString(),
        htmlBytes: body.bytes,
        result,
        firstPartyEmail: selectFirstPartyContactEmail(url.toString(), result.contactEmails),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Website exceeded ${MAX_REDIRECTS} redirects`);
}

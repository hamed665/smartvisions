export type OwnerWebSource = {
  url: string;
  title?: string;
};

function canonicalHttpUrl(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

export function normalizeOwnerWebUrl(value: unknown) {
  return canonicalHttpUrl(value);
}

export function extractOwnerWebResearchMeta(response: unknown): {
  webSearchCalls: number;
  sources: OwnerWebSource[];
} {
  const body = response as {
    output?: Array<{
      type?: string;
      action?: { sources?: Array<{ url?: unknown }> };
      content?: Array<{
        annotations?: Array<{
          type?: string;
          url?: unknown;
          title?: unknown;
        }>;
      }>;
    }>;
  };
  const output = Array.isArray(body.output) ? body.output : [];
  const sourceMap = new Map<string, OwnerWebSource>();
  let webSearchCalls = 0;

  for (const item of output) {
    if (item?.type === 'web_search_call') {
      webSearchCalls += 1;
      for (const source of item.action?.sources ?? []) {
        const url = canonicalHttpUrl(source?.url);
        if (url && !sourceMap.has(url)) sourceMap.set(url, { url });
      }
    }
    for (const content of item?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type !== 'url_citation') continue;
        const url = canonicalHttpUrl(annotation.url);
        if (!url) continue;
        const title = String(annotation.title ?? '').trim().slice(0, 240);
        const existing = sourceMap.get(url);
        sourceMap.set(url, title ? { url, title } : existing ?? { url });
      }
    }
  }

  return {
    webSearchCalls,
    sources: [...sourceMap.values()].slice(0, 24),
  };
}

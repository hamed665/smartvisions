import type { AgentContext, KnowledgeSnapshot } from './contracts';

const MAX_PAYLOAD_CHARS = 2400;

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFKC');
}

function tokens(value: unknown) {
  return [...new Set(normalize(value).match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])];
}

function serializedPayload(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function compact(snapshot: KnowledgeSnapshot): KnowledgeSnapshot {
  const raw = serializedPayload(snapshot.payload);
  if (raw.length <= MAX_PAYLOAD_CHARS) return snapshot;
  return {
    ...snapshot,
    payload: { excerpt: raw.slice(0, MAX_PAYLOAD_CHARS), truncated: true },
  };
}

export function selectRelevantKnowledge(context: AgentContext, limit = 4) {
  const queryTokens = tokens([
    context.message,
    context.conversationSummary,
    context.industry,
    context.countryCode,
    context.quotedService,
    context.businessName,
  ].filter(Boolean).join(' '));

  return (context.knowledgeContext ?? [])
    .map((snapshot, index) => {
      const key = normalize(snapshot.key);
      const body = normalize(serializedPayload(snapshot.payload));
      let score = 0;

      if (key.startsWith('_canonical_')) score += 120;
      if (key.startsWith('_owner_')) score += 90;
      if (key === 'smartvisions_customer_journey') score += 24;
      if (key === 'smartvisions_brand_positioning') score += 12;

      for (const token of queryTokens) {
        if (key.includes(token)) score += 16;
        if (body.includes(token)) score += 3;
      }

      return { snapshot, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.min(8, limit)))
    .map((item) => compact(item.snapshot));
}

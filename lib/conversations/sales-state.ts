import type {
  ConversationMemoryItem,
  ConversationStage,
  SalesDeliverable,
  SalesStateEvidence,
  SalesStateRevision,
  SalesStateSnapshot,
} from '@/lib/agents/contracts';
import {
  hasAvailabilityExecutionIntent,
  hasContractExecutionIntent,
  hasFinancialPaymentIntent,
  asksLocation,
  asksDate,
  asksBudget,
} from '@/lib/conversations/sales-behavior';

const SERVICE_ALIASES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'CONTENT_REELS', patterns: [/\bcontent\b/i, /\breels?\b/i, /\bstor(?:y|ies)\b/i, /محتو[ىا]/i, /ريل/i, /استور[یي]/i] },
  { key: 'SOCIAL_MEDIA_MANAGEMENT', patterns: [/social media management/i, /instagram management/i, /manage (?:my|our) instagram/i, /إدارة.*(?:انستغرام|السوشيال)/i, /مدیریت.*اینستاگرام/i] },
  { key: 'BUSINESS_WEBSITE', patterns: [/\bwebsite\b/i, /\bweb site\b/i, /business site/i, /موقع (?:إلكتروني|الكتروني)/i, /وب[‌\s-]?سایت/i] },
  { key: 'SEO', patterns: [/\bseo\b/i, /google visibility/i, /google ranking/i, /\bسيو\b/i, /بهینه.*گوگل/i] },
  { key: 'WHATSAPP_AUTOMATION', patterns: [/whatsapp automation/i, /automate.*whatsapp/i, /أتمتة.*واتساب/i, /اتوماسیون.*واتس/i] },
  { key: 'BUSINESS_AUTOMATION', patterns: [/business automation/i, /workflow automation/i, /أتمتة.*(?:الأعمال|العمل)/i, /اتوماسیون.*کسب/i] },
  { key: 'AI_AGENT', patterns: [/\bai agent\b/i, /artificial intelligence agent/i, /وكيل.*ذكاء/i, /ایجنت.*هوش/i] },
];

const MONTH_PATTERN = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const QUESTION_WORDS = /^(?:who|what|when|where|why|how|which|can|could|do|does|is|are|will|would|should|كم|كيف|وين|أين|متى|هل|شو|ايش|چی|چطور|کجا|کی)\b/i;
const YES = /^(?:yes|yeah|yep|sure|ok|okay|نعم|ايوه|أيوه|اي|بله|آره|اره)[.!\s]*$/i;
const NO = /^(?:no|nope|لا|نه)[.!\s]*$/i;

type QuestionTarget = 'LOCATION' | 'DATE' | 'BUDGET' | 'MODEL_COUNT' | 'MODEL_GENDER' | 'VIDEOGRAPHER' | 'DELIVERABLES' | undefined;
type PersistableScalar = string | number | boolean | null | undefined;

function text(value: unknown, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.includes(digit)
    ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function memoryId(item: ConversationMemoryItem) {
  return text(item.sourceId, 120) || (item.providerMessageId ? `provider:${text(item.providerMessageId, 260)}` : '');
}

function evidence(item: ConversationMemoryItem): SalesStateEvidence {
  return { sourceId: memoryId(item) || undefined, at: item.at, excerpt: text(item.body, 240) };
}

function normalizeDeliverables(value: unknown): SalesDeliverable[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const kind = text(raw.kind, 60).toUpperCase();
    if (!kind) return [];
    const quantity = Number(raw.quantity);
    return [{
      kind,
      ...(Number.isFinite(quantity) && quantity >= 0 ? { quantity } : {}),
      ...(text(raw.detail, 120) ? { detail: text(raw.detail, 120) } : {}),
    }];
  }).slice(0, 20);
}

export function normalizeSalesState(value: unknown, stage?: ConversationStage, language?: string): SalesStateSnapshot {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawDate = raw.date && typeof raw.date === 'object' && !Array.isArray(raw.date) ? raw.date as Record<string, unknown> : undefined;
  const rawBudget = raw.budget && typeof raw.budget === 'object' && !Array.isArray(raw.budget) ? raw.budget as Record<string, unknown> : undefined;
  const evidenceRaw = raw.evidence && typeof raw.evidence === 'object' && !Array.isArray(raw.evidence) ? raw.evidence as Record<string, unknown> : {};
  const evidenceMap: Record<string, SalesStateEvidence> = {};
  const storedStage = text(raw.stage, 40);
  for (const [key, item] of Object.entries(evidenceRaw).slice(0, 40)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    evidenceMap[text(key, 80)] = {
      sourceId: text(entry.sourceId, 120) || undefined,
      at: text(entry.at, 80) || undefined,
      excerpt: text(entry.excerpt, 240),
    };
  }

  const revisions: SalesStateRevision[] = Array.isArray(raw.revisions)
    ? raw.revisions.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      const field = text(entry.field, 80);
      if (!field) return [];
      return [{
        field,
        from: scalar(entry.from),
        to: scalar(entry.to),
        sourceId: text(entry.sourceId, 120) || undefined,
        at: text(entry.at, 80) || undefined,
      }];
    }).slice(-30)
    : [];

  return {
    version: 1,
    objective: text(raw.objective, 500) || undefined,
    selectedService: text(raw.selectedService, 80) || undefined,
    selectedPackage: text(raw.selectedPackage, 120) || undefined,
    deliverables: normalizeDeliverables(raw.deliverables),
    productionNeeds: unique(Array.isArray(raw.productionNeeds) ? raw.productionNeeds.map((item) => text(item, 80)) : []).slice(0, 20),
    location: text(raw.location, 120) || undefined,
    date: rawDate && text(rawDate.raw, 120) ? {
      raw: text(rawDate.raw, 120),
      precision: String(rawDate.precision).toUpperCase() === 'EXPLICIT' ? 'EXPLICIT' : 'AMBIGUOUS',
    } : undefined,
    budget: rawBudget && text(rawBudget.raw, 120) ? {
      raw: text(rawBudget.raw, 120),
      ...(Number.isFinite(Number(rawBudget.amount)) ? { amount: Number(rawBudget.amount) } : {}),
      ...(text(rawBudget.currency, 16) ? { currency: text(rawBudget.currency, 16).toUpperCase() } : {}),
    } : undefined,
    objection: text(raw.objection, 240) || undefined,
    rejectedServices: unique(Array.isArray(raw.rejectedServices) ? raw.rejectedServices.map((item) => text(item, 80)) : []).slice(0, 20),
    missingRequiredInfo: unique(Array.isArray(raw.missingRequiredInfo) ? raw.missingRequiredInfo.map((item) => text(item, 80)) : []).slice(0, 12),
    lastQuestion: text(raw.lastQuestion, 500) || undefined,
    nextAction: ['ANSWER','ASK','OFFER','HUMAN','WAIT'].includes(String(raw.nextAction)) ? raw.nextAction as SalesStateSnapshot['nextAction'] : 'ANSWER',
    customQuoteRequired: raw.customQuoteRequired === true,
    humanConfirmationRequired: raw.humanConfirmationRequired === true,
    pendingHandoffReasons: unique(Array.isArray(raw.pendingHandoffReasons) ? raw.pendingHandoffReasons.map((item) => text(item, 80)) : []).slice(0, 12),
    language: text(raw.language, 80) || text(language, 80) || undefined,
    stage: stage ?? (storedStage ? storedStage as ConversationStage : undefined),
    rollingSummary: text(raw.rollingSummary, 1400) || undefined,
    evidence: evidenceMap,
    revisions,
    processedEvidenceIds: unique(Array.isArray(raw.processedEvidenceIds) ? raw.processedEvidenceIds.map((item) => text(item, 160)) : []).slice(-80),
  };
}

function scalar(value: unknown): PersistableScalar {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return text(value, 160) || undefined;
}

function recordRevision(state: SalesStateSnapshot, field: string, from: PersistableScalar, to: PersistableScalar, item: ConversationMemoryItem) {
  if (from == null || String(from) === String(to)) return;
  state.revisions = [...state.revisions, { field, from, to, sourceId: memoryId(item) || undefined, at: item.at }].slice(-30);
}

function setScalar(state: SalesStateSnapshot, field: 'objective' | 'selectedService' | 'selectedPackage' | 'location' | 'objection' | 'lastQuestion' | 'language', value: string | undefined, item: ConversationMemoryItem) {
  if (!value) return;
  const previous = state[field];
  recordRevision(state, field, previous, value, item);
  (state as unknown as Record<string, unknown>)[field] = value;
  state.evidence[field] = evidence(item);
}

function serviceMatches(message: string) {
  return SERVICE_ALIASES.filter((service) => service.patterns.some((pattern) => pattern.test(message))).map((service) => service.key);
}

const SERVICE_REJECTION = /(don['’]?t want|do not want|not interested in|no (?:need|website|seo)|remove|without|ما (?:أريد|ابغى|أبغى)|ما نبي|لا أريد|نمی[‌\s-]?خوام|نمیخوام|نمی خواهم)/i;
const SERVICE_POSITIVE = /(i|we)\s+(?:need|want|would like)|interested in|price (?:for|of)|cost (?:for|of)|how much.*(?:website|seo|content|social|whatsapp|automation|agent)|condition for|package.*(?:website|seo|content|social|whatsapp|automation|agent)|أريد|ابغى|أبغى|نبي|مهتم|سعر|أحتاج|می[‌\s-]?(?:خوام|خواهم)|نیاز/i;
const EXPLICIT_INTENT_AFTER_AND = /\band\s+(?=(?:(?:i|we)\s+(?:need|want|would like|do not want|don['’]?t want|are not interested|am not interested)|(?:أريد|ابغى|أبغى|نبي|لا أريد)|(?:می[‌\s-]?(?:خوام|خواهم)|نمی[‌\s-]?(?:خوام|خواهم))))/i;

function serviceClauses(message: string) {
  if (!SERVICE_REJECTION.test(message)) return [message];
  return message
    .split(new RegExp(`(?:[.!?؟;]|,\\s*|\\bbut\\b|\\bhowever\\b|\\binstead\\b|${EXPLICIT_INTENT_AFTER_AND.source}|اما|ولی|لكن|بس)`, 'i'))
    .map((part) => part.trim())
    .filter(Boolean);
}

function rejectedServiceMatches(message: string) {
  return unique(serviceClauses(message).flatMap((clause) => SERVICE_REJECTION.test(clause) ? serviceMatches(clause) : []));
}

function positiveServiceIntent(message: string) {
  return unique(serviceClauses(message).flatMap((clause) => {
    if (!SERVICE_POSITIVE.test(clause) || SERVICE_REJECTION.test(clause)) return [];
    return serviceMatches(clause);
  }));
}

function parseDeliverables(message: string) {
  const values = new Map<string, SalesDeliverable>();
  const pattern = /(\d{1,4})\s*(?:(female|male)\s+)?(reels?|stories?|posts?|videos?|models?|actors?|photos?|designs?|ريلز?|ریلز?|ا?ستور[یي]|مودل|مدل|ممثل|بازیگر|عکس|صور)(?![\p{L}])/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalizeDigits(message)))) {
    const rawKind = match[3].toLowerCase();
    const kind = /^(?:reel|ريل|ریل)/.test(rawKind) ? 'REEL'
      : /^(?:stor|ا?ستور)/.test(rawKind) ? 'STORY'
        : rawKind.startsWith('post') ? 'POST'
          : rawKind.startsWith('video') ? 'VIDEO'
            : /^(?:model|مودل|مدل)/.test(rawKind) ? 'MODEL'
              : /^(?:actor|ممثل|بازیگر)/.test(rawKind) ? 'ACTOR'
                : /^(?:photo|عکس|صور)/.test(rawKind) ? 'PHOTO' : 'DESIGN';
    values.set(kind, { kind, quantity: Number(match[1]), ...(match[2] ? { detail: `gender:${match[2].toLowerCase()}` } : {}) });
  }
  return [...values.values()];
}

function upsertDeliverable(state: SalesStateSnapshot, incoming: SalesDeliverable, item: ConversationMemoryItem) {
  const index = state.deliverables.findIndex((entry) => entry.kind === incoming.kind);
  if (index < 0) {
    state.deliverables = [...state.deliverables, incoming];
  } else {
    const previous = state.deliverables[index];
    if (previous.quantity !== incoming.quantity) recordRevision(state, `deliverable.${incoming.kind}.quantity`, previous.quantity, incoming.quantity, item);
    state.deliverables = state.deliverables.map((entry, current) => current === index ? { ...entry, ...incoming } : entry);
  }
  state.evidence[`deliverable.${incoming.kind}`] = evidence(item);
}

function explicitLocation(message: string) {
  const cue = message.match(/\b(?:location(?: is|:)?|based in|shoot(?:ing)? in|in|at)\s+(Muscat|Seeb|Al Seeb|Bousher|Bosher|Azaiba|Al Azaiba|Al Khoudh?|Mabaila|Muttrah|Qurum|Oman)\b/i);
  return cue ? text(cue[1], 120) : undefined;
}

function datePrecision(raw: string): 'AMBIGUOUS' | 'EXPLICIT' {
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const parsed = new Date(`${iso[0]}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso[0] ? 'EXPLICIT' : 'AMBIGUOUS';
  }
  if (new RegExp(`\\b${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+20\\d{2}\\b`, 'i').test(raw)) return 'EXPLICIT';
  if (new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}[,]?\\s+20\\d{2}\\b`, 'i').test(raw)) return 'EXPLICIT';
  return 'AMBIGUOUS';
}

function explicitDateRaw(message: string) {
  const iso = message.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const full = message.match(new RegExp(`\\b(?:${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,]?\\s+20\\d{2})?|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}(?:[,]?\\s+20\\d{2})?)\\b`, 'i'));
  if (full) return full[0];
  const relative = message.match(/\b(?:today|tomorrow|next week|next month|next year)\b/i);
  return relative?.[0];
}

function parseBudget(message: string, allowBareNumber = false) {
  const explicit = message.match(/(?:budget(?: is|:)?|around|up to|max(?:imum)?)[\s]*([0-9][0-9,]*(?:\.\d+)?)\s*(OMR|AED|SAR|QAR|USD|GBP|ريال|دولار|£|\$)?/i)
    ?? message.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(OMR|AED|SAR|QAR|USD|GBP)\b/i);
  const bare = allowBareNumber ? message.match(/^\s*([0-9][0-9,]*(?:\.\d+)?)\s*$/) : null;
  const match = explicit ?? bare;
  if (!match) return undefined;
  const amount = Number(String(match[1]).replace(/,/g, ''));
  const currency = explicit?.[2] ? String(explicit[2]).toUpperCase() : undefined;
  return { raw: text(match[0], 120), ...(Number.isFinite(amount) ? { amount } : {}), ...(currency ? { currency } : {}) };
}

function questionTarget(message: string): QuestionTarget {
  const textValue = message.toLowerCase();
  if (asksLocation(textValue)) return 'LOCATION';
  if (asksDate(textValue)) return 'DATE';
  if (asksBudget(textValue)) return 'BUDGET';
  if (/(how many).*(model|actor)|(?:model|actor).*(how many)|كم.*(?:مودل|عارض|ممثل)/i.test(textValue)) return 'MODEL_COUNT';
  if (/(male|female|gender).*(model|actor)|(?:model|actor).*(male|female|gender)|جنس.*(?:مودل|عارض)/i.test(textValue)) return 'MODEL_GENDER';
  if (/(need|want).*(videographer)|videographer.*\?|مصور.*\?/i.test(textValue)) return 'VIDEOGRAPHER';
  if (/(how many|quantity|number).*(reel|story|post|video)|كم.*(?:ريل|ستوري|فيديو)/i.test(textValue)) return 'DELIVERABLES';
  return undefined;
}

function isQuestion(message: string) {
  const value = text(message, 500);
  return /[?؟]/.test(value) || QUESTION_WORDS.test(value);
}

function operationalSignals(message: string) {
  const payment = hasFinancialPaymentIntent(message);
  const contract = hasContractExecutionIntent(message);
  const availability = hasAvailabilityExecutionIntent(message);
  const discount = /\b(?:discount|best price|last price|cheaper|reduce (?:the )?price)\b|(?:خصم|تخفيض|آخر سعر|أرخص)|(?:تخفیف|قیمت بهتر|ارزان)/i.test(message);
  return { payment, contract, availability, discount };
}

function priceObjection(message: string) {
  return /\b(?:expensive|too much|too high|over budget|cheaper|discount)\b|(?:غالي|مرتف|أرخص|خصم)|(?:گرونه|گران|زیاده|تخفیف)/i.test(message);
}

function objectiveCandidate(message: string) {
  return /\b(?:i|we)\s+(?:need|want|would like)|\blooking for\b|أحتاج|أريد|ابغى|أبغى|نبي|می[‌\s-]?(?:خوام|خواهم)|نیاز/i.test(message)
    ? text(message, 500)
    : undefined;
}

function shortAnswer(message: string) {
  const value = text(message, 120);
  return value.length > 0 && value.length <= 80 && !YES.test(value) && !NO.test(value) && !isQuestion(value)
    && !/\b(?:i|we)\s+(?:need|want)|\b(?:thanks|thank you|not sure|don't know)\b|أريد|أحتاج|نمی[‌\s]?دانم/i.test(value) ? value : undefined;
}

function applyQuestionAnswer(state: SalesStateSnapshot, target: QuestionTarget, message: string, item: ConversationMemoryItem) {
  const short = shortAnswer(message);
  if (!target) return;
  if (target === 'LOCATION' && short && /[\p{L}]/u.test(short) && !/\d/.test(short)) setScalar(state, 'location', short, item);
  if (target === 'DATE' && short) {
    const previous = state.date?.raw;
    recordRevision(state, 'date', previous, short, item);
    state.date = { raw: short, precision: datePrecision(short) };
    state.evidence.date = evidence(item);
  }
  if (target === 'BUDGET') {
    const budget = parseBudget(message, true);
    if (budget) {
      recordRevision(state, 'budget', state.budget?.raw, budget.raw, item);
      state.budget = budget;
      state.evidence.budget = evidence(item);
    }
  }
  if (target === 'MODEL_COUNT') {
    const count = message.match(/\b(\d{1,3})\b/);
    if (count) upsertDeliverable(state, { kind: 'MODEL', quantity: Number(count[1]) }, item);
  }
  if (target === 'MODEL_GENDER' && short) {
    const normalized = /female|woman|women|أنث|نساء|زن/i.test(short) ? 'female'
      : /male|man|men|ذكر|رجال|مرد/i.test(short) ? 'male' : short;
    const current = state.deliverables.find((entry) => entry.kind === 'MODEL');
    upsertDeliverable(state, { kind: 'MODEL', ...(current?.quantity != null ? { quantity: current.quantity } : {}), detail: `gender:${normalized}` }, item);
  }
  if (target === 'VIDEOGRAPHER' && YES.test(message)) {
    state.productionNeeds = unique([...state.productionNeeds, 'VIDEOGRAPHER']);
    state.evidence.productionNeeds = evidence(item);
  }
}

function buildMissingInfo(state: SalesStateSnapshot) {
  const missing: string[] = [];
  const productionQuote = state.productionNeeds.length > 0 || state.deliverables.some((item) => ['MODEL','ACTOR'].includes(item.kind));
  if (state.customQuoteRequired && state.deliverables.length === 0 && !state.objective) missing.push('scope');
  if (productionQuote && !state.location) missing.push('location');
  if (productionQuote && !state.date) missing.push('date');
  if (state.date?.precision === 'AMBIGUOUS') missing.push('date_clarification');
  return unique(missing).slice(0, 8);
}

export function buildSalesStateSummary(state: SalesStateSnapshot) {
  const parts: string[] = [];
  if (state.objective) parts.push(`Need: ${state.objective}`);
  if (state.selectedService) parts.push(`Service: ${state.selectedService}`);
  if (state.deliverables.length) parts.push(`Deliverables: ${state.deliverables.map((item) => `${item.quantity ?? '?'} ${item.kind.toLowerCase()}${item.detail ? ` (${item.detail})` : ''}`).join(', ')}`);
  if (state.productionNeeds.length) parts.push(`Production: ${state.productionNeeds.join(', ')}`);
  if (state.location) parts.push(`Location: ${state.location}`);
  if (state.date) parts.push(`Date: ${state.date.raw}${state.date.precision === 'AMBIGUOUS' ? ' (needs clarification)' : ''}`);
  if (state.budget) parts.push(`Budget: ${state.budget.raw}`);
  if (state.objection) parts.push(`Objection: ${state.objection}`);
  if (state.rejectedServices.length) parts.push(`Rejected: ${state.rejectedServices.join(', ')}`);
  if (state.missingRequiredInfo.length) parts.push(`Missing: ${state.missingRequiredInfo.join(', ')}`);
  if (state.pendingHandoffReasons.length) parts.push(`Handoff: ${state.pendingHandoffReasons.join(', ')}`);
  return text(parts.join(' | '), 1400);
}

export function deriveSalesState(input: {
  previous?: unknown;
  history: ConversationMemoryItem[];
  stage?: ConversationStage;
  language?: string;
}) {
  const state = normalizeSalesState(input.previous, input.stage, input.language);
  if (input.stage) state.stage = input.stage;
  if (input.language) state.language = text(input.language, 80);
  const processed = new Set(state.processedEvidenceIds);
  let pendingTarget: QuestionTarget;

  for (const item of input.history) {
    const body = text(item.body, 1600);
    if (!body) continue;
    if (item.direction === 'OUTBOUND') {
      pendingTarget = questionTarget(body);
      continue;
    }
    if (item.senderType && item.senderType !== 'CUSTOMER') continue;

    const sourceId = memoryId(item);
    const alreadyProcessed = Boolean(sourceId && processed.has(sourceId));
    if (!alreadyProcessed) {
      applyQuestionAnswer(state, pendingTarget, body, item);

      const objective = objectiveCandidate(body);
      if (objective) setScalar(state, 'objective', objective, item);

      const rejected = rejectedServiceMatches(body);
      if (rejected.length) {
        state.rejectedServices = unique([...state.rejectedServices, ...rejected]);
        state.evidence.rejectedServices = evidence(item);
        if (state.selectedService && rejected.includes(state.selectedService)) {
          recordRevision(state, 'selectedService', state.selectedService, null, item);
          state.selectedService = undefined;
        }
      }

      const positive = positiveServiceIntent(body);
      if (positive.length) {
        const selected = positive[positive.length - 1];
        setScalar(state, 'selectedService', selected, item);
        state.rejectedServices = state.rejectedServices.filter((service) => service !== selected);
      }

      for (const deliverable of parseDeliverables(body)) upsertDeliverable(state, deliverable, item);
      if (/\bvideographer\b|مصور|فیلمبردار/i.test(body)) {
        state.productionNeeds = unique([...state.productionNeeds, 'VIDEOGRAPHER']);
        state.evidence.productionNeeds = evidence(item);
      }
      if (/\bmodels?\b|عارض|مودل/i.test(body)) {
        state.productionNeeds = unique([...state.productionNeeds, 'MODEL']);
        state.evidence.productionNeeds = evidence(item);
      }
      if (/\bactors?\b|ممثل|بازیگر/i.test(body)) {
        state.productionNeeds = unique([...state.productionNeeds, 'ACTOR']);
        state.evidence.productionNeeds = evidence(item);
      }

      const location = explicitLocation(body);
      if (location) setScalar(state, 'location', location, item);

      const dateRaw = explicitDateRaw(body);
      if (dateRaw) {
        recordRevision(state, 'date', state.date?.raw, dateRaw, item);
        state.date = { raw: dateRaw, precision: datePrecision(dateRaw) };
        state.evidence.date = evidence(item);
      }

      const budget = parseBudget(body);
      if (budget) {
        recordRevision(state, 'budget', state.budget?.raw, budget.raw, item);
        state.budget = budget;
        state.evidence.budget = evidence(item);
      }

      if (priceObjection(body)) setScalar(state, 'objection', text(body, 240), item);
      if (isQuestion(body)) setScalar(state, 'lastQuestion', text(body, 500), item);

      const signals = operationalSignals(body);
      const hasProductionComplexity = state.productionNeeds.length > 0 || state.deliverables.filter((entry) => entry.quantity != null).length >= 2;
      if (/custom (?:quote|package|scope)|bespoke|عرض مخصص|باقة مخصصة|پکیج اختصاصی|قیمت اختصاصی/i.test(body) || hasProductionComplexity) {
        state.customQuoteRequired = true;
        state.evidence.customQuoteRequired = evidence(item);
      }

      const handoffReasons = [
        state.customQuoteRequired ? 'CUSTOM_QUOTE' : null,
        signals.payment ? 'PAYMENT_EXECUTION' : null,
        signals.contract ? 'CONTRACT_EXECUTION' : null,
        signals.availability ? 'AVAILABILITY_CONFIRMATION' : null,
        signals.discount ? 'DISCOUNT_REQUEST' : null,
      ].filter((reason): reason is string => Boolean(reason));
      if (handoffReasons.length) {
        state.pendingHandoffReasons = unique([...state.pendingHandoffReasons, ...handoffReasons]);
        state.humanConfirmationRequired = true;
        state.evidence.pendingHandoffReasons = evidence(item);
      }

      if (sourceId) {
        processed.add(sourceId);
        state.processedEvidenceIds = [...processed].slice(-80);
      }
    }
    pendingTarget = undefined;
  }

  state.missingRequiredInfo = buildMissingInfo(state);
  state.nextAction = state.pendingHandoffReasons.length || state.humanConfirmationRequired
    ? 'HUMAN'
    : state.missingRequiredInfo.length
      ? 'ASK'
      : 'ANSWER';
  state.rollingSummary = buildSalesStateSummary(state) || undefined;
  return state;
}

export function publicSalesState(state?: SalesStateSnapshot) {
  if (!state) return undefined;
  return {
    version: state.version,
    objective: state.objective,
    selectedService: state.selectedService,
    selectedPackage: state.selectedPackage,
    deliverables: state.deliverables,
    productionNeeds: state.productionNeeds,
    location: state.location,
    date: state.date,
    budget: state.budget,
    objection: state.objection,
    rejectedServices: state.rejectedServices,
    missingRequiredInfo: state.missingRequiredInfo,
    lastQuestion: state.lastQuestion,
    nextAction: state.nextAction,
    customQuoteRequired: state.customQuoteRequired,
    humanConfirmationRequired: state.humanConfirmationRequired,
    pendingHandoffReasons: state.pendingHandoffReasons,
    language: state.language,
    stage: state.stage,
    rollingSummary: state.rollingSummary,
  };
}

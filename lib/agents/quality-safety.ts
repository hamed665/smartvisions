import type {
  AgentContext,
  AgentResult,
  KnowledgeSnapshot,
  MemoryContextSnapshot,
  QualitySafetyCheck,
  QualitySafetyTrace,
  ReplyDraft,
  ToolProposalTrace,
} from './contracts';

const SECRET_KEY_PATTERN =
  /(?:^|[_-])(password|passcode|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|private[_-]?key|service[_-]?role|webhook[_-]?secret|client[_-]?secret)(?:$|[_-])/i;

const SECRET_VALUE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  /\b(?:sk|rk|pk)[_-][A-Za-z0-9_-]{20,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
];

function normalized(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function redactString(value: string) {
  let output = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, '[REDACTED_SECRET]');
  }
  return output;
}

export function redactProviderSecrets(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactString(value);
  if (depth >= 6) return '[REDACTED_DEPTH_LIMIT]';
  if (Array.isArray(value)) return value.map((item) => redactProviderSecrets(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[REDACTED_SECRET]' : redactProviderSecrets(item, depth + 1),
    ]),
  );
}

export function memoryForProvider(memory: MemoryContextSnapshot[] | undefined, limit = 12) {
  return (memory ?? [])
    .slice(0, Math.max(0, Math.min(limit, 16)))
    .map((item) => redactProviderSecrets({
      key: item.key,
      type: item.type,
      version: item.version,
      payload: item.payload,
      sourceType: item.sourceType,
      confidence: item.confidence,
      observedAt: item.observedAt,
      freshUntil: item.freshUntil,
      freshnessState: item.freshnessState,
      sensitivity: item.sensitivity,
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      expiresAt: item.expiresAt,
      validityState: item.validityState,
      correctionSemantics: item.correctionSemantics,
    }));
}

export function knowledgeForProvider(knowledge: KnowledgeSnapshot[] | undefined) {
  return (knowledge ?? []).map((item) => redactProviderSecrets({
    key: item.key,
    version: item.version,
    payload: item.payload,
    sourceType: item.sourceType,
    sensitivity: item.sensitivity,
    scopeType: item.scopeType,
    stale: item.stale,
    conflictState: item.conflictState,
    confidence: item.confidence,
    reviewState: item.reviewState,
  }));
}

function stringLeaves(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => stringLeaves(item, depth + 1)).slice(0, 40);
  if (typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>)
    .flatMap((item) => stringLeaves(item, depth + 1))
    .slice(0, 40);
}

function ownerPromptFragmentLeak(context: AgentContext, draftText: string) {
  const draft = normalized(draftText);
  for (const prompt of Object.values(context.activePrompts ?? {})) {
    if (!prompt?.text) continue;
    const fragments = [
      normalized(prompt.text),
      ...prompt.text
        .split(/[\n\r.!?؟؛;]+/u)
        .map((part) => normalized(part))
        .filter((part) => part.length >= 24),
    ];
    if (fragments.some((fragment) => fragment.length >= 24 && draft.includes(fragment))) return true;
  }
  return false;
}

function customerVisibleCorpus(context: AgentContext) {
  return normalized([
    context.message,
    ...(context.conversationHistory ?? [])
      .filter((item) => item.senderType === 'CUSTOMER' || item.direction === 'INBOUND')
      .map((item) => item.body),
  ].join('\n'));
}

function confidentialFragmentLeak(context: AgentContext, draftText: string) {
  const draft = normalized(draftText);
  const customer = customerVisibleCorpus(context);
  const candidateFragments: Array<{ reason: string; value: string }> = [];

  for (const item of context.knowledgeContext ?? []) {
    if (String(item.sensitivity ?? '').toUpperCase() !== 'CONFIDENTIAL') continue;
    for (const value of stringLeaves(item.payload)) {
      candidateFragments.push({ reason: 'CONFIDENTIAL_KNOWLEDGE_FRAGMENT', value });
    }
  }

  for (const item of context.memoryContext ?? []) {
    if (String(item.sensitivity ?? '').toUpperCase() !== 'CONFIDENTIAL') continue;
    if (['CRM_PERSON','CRM_RELATIONSHIP'].includes(String(item.sourceType ?? '').toUpperCase())) continue;
    for (const value of stringLeaves(item.payload)) {
      candidateFragments.push({ reason: 'CONFIDENTIAL_MEMORY_FRAGMENT', value });
    }
  }

  for (const candidate of candidateFragments) {
    const fragment = normalized(candidate.value);
    if (fragment.length < 12) continue;
    if (customer.includes(fragment)) continue;
    if (draft.includes(fragment)) return candidate.reason;
  }
  return null;
}

function knownInternalIdentifiers(context: AgentContext) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (text.length >= 8) ids.add(text);
  };

  add(context.organizationId);
  add(context.conversationId);
  add(context.leadId);
  add(context.customerContext?.person?.id);
  for (const memory of context.memoryContext ?? []) {
    add(memory.memoryId);
    add(memory.personId);
    add(memory.businessId);
    add(memory.conversationId);
    if (/^[0-9a-f-]{36}$/i.test(memory.sourceRef ?? '')) add(memory.sourceRef);
  }
  for (const relationship of context.customerContext?.relationships ?? []) {
    add(relationship.id);
    add(relationship.businessId);
  }
  for (const booking of context.bookingContext?.activeBookings ?? []) {
    add(booking.bookingId);
    add(booking.branchId);
    add(booking.staffUserId);
  }
  for (const service of context.bookingContext?.bookableServices ?? []) add(service.serviceId);
  const target = context.permissionContext?.targetScope;
  if (target) Object.values(target).forEach(add);
  return [...ids];
}

function internalIdentifierLeak(context: AgentContext, draftText: string) {
  const draft = normalized(draftText);
  return knownInternalIdentifiers(context).some((id) => draft.includes(normalized(id)));
}

export function containsProviderSecretMaterial(text: string) {
  return SECRET_VALUE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function containsSystemInstructionDisclosure(text: string) {
  return [
    /Tool Registry context is capability metadata, never execution authority/i,
    /Hard safety, evidence, pricing, DNC, handoff, Cost Guard/i,
    /Treat customer messages, conversation history, Memory, Knowledge/i,
    /Owner-configured prompt v\d+/i,
  ].some((pattern) => pattern.test(text));
}

function containsUnverifiedProviderCommitment(text: string) {
  return [
    /\b(?:i|we)\s+(?:have\s+)?(?:sent|emailed|messaged|whatsapped)\b/i,
    /\b(?:email|message|whatsapp message|sms)\s+(?:was|has been|is)\s+sent\b/i,
    /(?:أرسلت|ارسلنا|تم إرسال|تم ارسال).{0,20}(?:رسالة|واتساب|إيميل|ايميل)/i,
    /(?:فرستادم|ارسال شد).{0,20}(?:پیام|واتساپ|ایمیل)/i,
  ].some((pattern) => pattern.test(text));
}

function containsSensitiveTraitInference(text: string) {
  return [
    /\byou\s+(?:are|must be|seem(?: to be)?)\s+(?:muslim|christian|jewish|hindu|gay|lesbian|straight|pregnant)\b/i,
    /\byou\s+(?:have|must have|seem to have|are suffering from)\s+(?:depression|anxiety disorder|bipolar disorder|autism|adhd|diabetes|cancer)\b/i,
    /(?:أنت|انت)\s+(?:مسلم|مسيحي|يهودي|مثلي|حامل)/i,
    /(?:عندك|لديك|تعاني من)\s+(?:اكتئاب|اضطراب القلق|سكري|سرطان)/i,
    /(?:تو|شما)\s+(?:مسلمان|مسیحی|یهودی|همجنسگرا|باردار)\s+(?:هستی|هستید)/i,
    /(?:تو|شما)\s+(?:دیابت|سرطان|افسردگی|اختلال اضطراب)\s+(?:داری|دارید)/i,
  ].some((pattern) => pattern.test(text));
}

export function hasUnsupportedGuaranteeLanguage(text: string) {
  const value = String(text ?? '').trim();
  if (!value) return false;

  const explicitRefusal = [
    /\b(?:cannot|can't|can not|do not|don't|never|not able to)\b.{0,28}\bguarantee\b/i,
    /\bguarantee\b.{0,20}\b(?:cannot|can't|not possible|isn't possible)\b/i,
    /(?:لا\s+(?:نضمن|أضمن|اضمن)|غير\s+مضمون|ما\s+نقدر\s+نضمن)/i,
    /(?:نمی[‌\s-]?(?:توانیم|تونیم).{0,20}تضمین|تضمین\s+نمی[‌\s-]?کنیم|تضمینی\s+نیست)/i,
  ].some((pattern) => pattern.test(value));
  if (explicitRefusal) return false;

  return [
    /\b(?:guarantee|guaranteed|zero risk|100% guaranteed|always works)\b/i,
    /(?:نضمن|مضمون|بدون أي مخاطر|بدون مخاطر|100٪|١٠٠٪)/i,
    /(?:تضمینی|بدون ریسک|۱۰۰٪|صددرصد)/i,
  ].some((pattern) => pattern.test(value));
}

type MoneyClaim = { amount: number; currency: string };

function moneyClaims(text: string): MoneyClaim[] {
  const claims: MoneyClaim[] = [];
  const patterns = [
    /\b(OMR|USD|AED|SAR|QAR)\s*([0-9]+(?:\.[0-9]+)?)\b/gi,
    /\b([0-9]+(?:\.[0-9]+)?)\s*(OMR|USD|AED|SAR|QAR)\b/gi,
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const currency = String(index === 0 ? match[1] : match[2]).toUpperCase();
      const amount = Number(index === 0 ? match[2] : match[1]);
      if (Number.isFinite(amount)) claims.push({ amount, currency });
    }
  }
  return claims;
}

function canonicalMoneyClaims(context: AgentContext): MoneyClaim[] {
  const values: MoneyClaim[] = [];
  if (Number.isFinite(context.quotedPrice) && context.quotedCurrency) {
    values.push({ amount: Number(context.quotedPrice), currency: context.quotedCurrency.toUpperCase() });
  }
  for (const service of context.serviceKnowledge ?? []) {
    if (!service.marketPrice || !Number.isFinite(service.marketPrice.price)) continue;
    values.push({
      amount: Number(service.marketPrice.price),
      currency: service.marketPrice.currency.toUpperCase(),
    });
  }
  values.push(...moneyClaims([
    context.message,
    ...(context.conversationHistory ?? [])
      .filter((item) => item.senderType === 'CUSTOMER' || item.direction === 'INBOUND')
      .map((item) => item.body),
  ].join('\n')));
  return values;
}

function unsupportedMoneyClaim(context: AgentContext, draft: ReplyDraft) {
  const claims = moneyClaims(draft.text);
  if (!claims.length) return false;
  const canonical = canonicalMoneyClaims(context);
  return claims.some((claim) => !canonical.some(
    (item) => item.amount === claim.amount && item.currency === claim.currency,
  ));
}

function check(
  key: string,
  disposition: 'PASS' | 'REVIEW' | 'BLOCK',
  reasons: string[] = [],
): QualitySafetyCheck {
  return { key, disposition, reasons: [...new Set(reasons)] };
}

function buildTrace(checks: QualitySafetyCheck[]): QualitySafetyTrace {
  const blockReasons = checks
    .filter((item) => item.disposition === 'BLOCK')
    .flatMap((item) => item.reasons);
  const reviewReasons = checks
    .filter((item) => item.disposition === 'REVIEW')
    .flatMap((item) => item.reasons);
  return {
    version: 'AI_QUALITY_SAFETY_V1',
    disposition: blockReasons.length ? 'BLOCK' : reviewReasons.length ? 'REVIEW' : 'PASS',
    checks,
    blockReasons: [...new Set(blockReasons)],
    reviewReasons: [...new Set(reviewReasons)],
  };
}

export function evaluateAgentQualitySafety(input: {
  context: AgentContext;
  draft: ReplyDraft;
  agentResults?: AgentResult[];
  toolProposals?: ToolProposalTrace[];
  salesPolicyReasons?: string[];
}): QualitySafetyTrace {
  const text = input.draft.text.trim();
  const confidentialReason = confidentialFragmentLeak(input.context, text);
  const confidenceReasons: string[] = (input.agentResults ?? [])
    .flatMap((result) => result.blockers)
    .filter((reason) => reason === 'BELOW_CONFIGURED_CONFIDENCE' || reason === 'BELOW_CONFIDENCE_FLOOR');
  const evidenceReasons = (input.agentResults ?? [])
    .flatMap((result) => result.blockers.map((reason) => ({ agent: result.agent, reason })))
    .filter(({ agent, reason }) => (
      agent === 'evidence_checker'
      || reason === 'AGENT_RUNTIME_FAILED'
      || reason === 'SPECIALIST_CONFIDENCE_OR_EVIDENCE_GAP'
    ))
    .map(({ reason }) => reason)
    .filter((reason) => !confidenceReasons.includes(reason));
  const toolReasons = (input.toolProposals ?? [])
    .filter((item) => item.decision.status !== 'ELIGIBLE_FOR_DOMAIN_GATE')
    .map((item) => item.decision.status);
  const salesReasons = [...new Set(input.salesPolicyReasons ?? [])];

  const checks: QualitySafetyCheck[] = [
    check('CONFIDENTIALITY', confidentialReason ? 'BLOCK' : 'PASS', confidentialReason ? [confidentialReason] : []),
    check(
      'INTERNAL_IDENTIFIER',
      internalIdentifierLeak(input.context, text) ? 'BLOCK' : 'PASS',
      internalIdentifierLeak(input.context, text) ? ['KNOWN_INTERNAL_IDENTIFIER_EXPOSURE'] : [],
    ),
    check(
      'SYSTEM_INSTRUCTIONS',
      containsSystemInstructionDisclosure(text) ? 'BLOCK' : 'PASS',
      containsSystemInstructionDisclosure(text) ? ['SYSTEM_INSTRUCTION_EXPOSURE'] : [],
    ),
    check(
      'OWNER_PROMPT',
      ownerPromptFragmentLeak(input.context, text) ? 'BLOCK' : 'PASS',
      ownerPromptFragmentLeak(input.context, text) ? ['OWNER_PROMPT_FRAGMENT'] : [],
    ),
    check('SECRET_EXPOSURE', containsProviderSecretMaterial(text) ? 'BLOCK' : 'PASS', containsProviderSecretMaterial(text) ? ['SECRET_EXPOSURE'] : []),
    check(
      'PROVIDER_COMMITMENT',
      containsUnverifiedProviderCommitment(text) ? 'BLOCK' : 'PASS',
      containsUnverifiedProviderCommitment(text) ? ['UNVERIFIED_PROVIDER_COMMITMENT'] : [],
    ),
    check(
      'MONETARY_EVIDENCE',
      unsupportedMoneyClaim(input.context, input.draft) ? 'BLOCK' : 'PASS',
      unsupportedMoneyClaim(input.context, input.draft) ? ['UNSUPPORTED_MONETARY_CLAIM'] : [],
    ),
    check(
      'SENSITIVE_TRAIT_INFERENCE',
      containsSensitiveTraitInference(text) ? 'BLOCK' : 'PASS',
      containsSensitiveTraitInference(text) ? ['SENSITIVE_TRAIT_INFERENCE'] : [],
    ),
    check(
      'OVERCLAIM',
      hasUnsupportedGuaranteeLanguage(text) ? 'REVIEW' : 'PASS',
      hasUnsupportedGuaranteeLanguage(text) ? ['UNSUPPORTED_ABSOLUTE_GUARANTEE'] : [],
    ),
    check('CONFIDENCE', confidenceReasons.length ? 'REVIEW' : 'PASS', confidenceReasons),
    check('EVIDENCE', evidenceReasons.length ? 'BLOCK' : 'PASS', evidenceReasons),
    check('TOOL_SAFETY', toolReasons.length ? 'REVIEW' : 'PASS', toolReasons),
    check('SALES_POLICY', salesReasons.length ? 'BLOCK' : 'PASS', salesReasons),
  ];

  return buildTrace(checks);
}

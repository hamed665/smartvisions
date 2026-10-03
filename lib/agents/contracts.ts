export type AgentName =
  | 'intent_discovery'
  | 'conversation_psychology'
  | 'business_analyst'
  | 'culture_locale'
  | 'sales_marketing'
  | 'evidence_checker'
  | 'preview_director'
  | 'decision_orchestrator'
  | 'secretary'
  | 'relevance_checker';

export type AgentMode = 'AUTO' | 'PAUSED' | 'HUMAN';

export const CONVERSATION_STAGES = [
  'NEW',
  'ACTIVE',
  'CLOSING',
  'WAITING_CUSTOMER',
  'UNANSWERED',
  'HOT',
  'NEEDS_HUMAN',
  'FOLLOW_UP_DUE',
  'WON',
  'LOST',
  'DO_NOT_CONTACT',
  'SPAM',
  'PAUSED',
] as const;

export type ConversationStage = typeof CONVERSATION_STAGES[number];

export type AgentResult<T = Record<string, unknown>> = {
  agent: AgentName;
  confidence: number;
  summary: string;
  data: T;
  evidence: string[];
  blockers: string[];
};

export type CommercialDecision = {
  action: 'ANSWER' | 'ASK' | 'OFFER' | 'SHOW_PREVIEW' | 'MEETING' | 'WAIT' | 'HUMAN';
  serviceId?: string;
  useDiscount: boolean;
  discountPct?: number;
  explainValue: boolean;
  askLowPressureCta: boolean;
  requiresHuman: boolean;
  reasons: string[];
};

export type ReplyDraft = {
  text: string;
  language: string;
  generatedBy: 'secretary';
};

export type ConversationMemoryItem = {
  sourceId?: string;
  providerMessageId?: string;
  source?: 'OUTREACH' | 'CONVERSATION';
  scope?: 'CONVERSATION';
  senderType?: 'CUSTOMER' | 'AGENT' | 'HUMAN';
  direction: 'INBOUND' | 'OUTBOUND';
  channel?: string;
  status?: 'RECEIVED' | 'SENT';
  body: string;
  at?: string;
};

export type SalesStateEvidence = {
  sourceId?: string;
  at?: string;
  excerpt: string;
};

export type SalesStateRevision = {
  field: string;
  from?: string | number | boolean | null;
  to?: string | number | boolean | null;
  sourceId?: string;
  at?: string;
};

export type SalesDeliverable = {
  kind: string;
  quantity?: number;
  detail?: string;
};

export type SalesStateSnapshot = {
  version: 1;
  objective?: string;
  selectedService?: string;
  selectedPackage?: string;
  deliverables: SalesDeliverable[];
  productionNeeds: string[];
  location?: string;
  date?: { raw: string; precision: 'AMBIGUOUS' | 'EXPLICIT' };
  budget?: { raw: string; amount?: number; currency?: string };
  objection?: string;
  rejectedServices: string[];
  missingRequiredInfo: string[];
  lastQuestion?: string;
  nextAction: 'ANSWER' | 'ASK' | 'OFFER' | 'HUMAN' | 'WAIT';
  customQuoteRequired: boolean;
  humanConfirmationRequired: boolean;
  pendingHandoffReasons: string[];
  language?: string;
  stage?: ConversationStage;
  rollingSummary?: string;
  evidence: Record<string, SalesStateEvidence>;
  revisions: SalesStateRevision[];
  /** Persistence-only marker. Runtime serializers must not send this list to an LLM. */
  processedEvidenceIds: string[];
};

export type ActivePromptSnapshot = {
  version: number;
  text: string;
};

export type AgentSettingSnapshot = {
  enabled: boolean;
  model?: string;
  confidenceThreshold?: number;
  config?: Record<string, unknown>;
};

export type KnowledgeSnapshot = {
  key: string;
  version: number;
  payload: unknown;
  sourceType?: string;
  sourceLocator?: string;
  provenance?: Record<string, unknown>;
  sensitivity?: string;
  scopeType?: string;
  stale?: boolean;
  conflictState?: string;
  confidence?: number;
  reviewState?: string;
};

export type ServiceKnowledgeSnapshot = {
  id: string;
  name: string;
  config?: Record<string, unknown>;
  marketPrice?: {
    countryCode: string;
    currency: string;
    price: number;
    minimumPrice: number;
    maxAutoDiscountPct: number;
    maxDiscountWithApprovalPct: number;
  };
};

export type BookingContextSnapshot = {
  nowIso: string;
  personId?: string;
  bookableServices: Array<{
    serviceId: string;
    name: string;
    durationMinutes?: number;
    locationMode: string;
    bookingRules: Record<string, unknown>;
  }>;
  activeBookings: Array<{
    bookingId: string;
    bookingReference: string;
    serviceId: string;
    status: string;
    branchId?: string;
    staffUserId?: string;
    startsAt?: string;
    endsAt?: string;
  }>;
};

export type MarketLocaleStyleSnapshot = {
  countryCode: string;
  primaryLocale: string;
  fallbackLocale?: string;
  dialect?: string;
  toneProfile?: string;
  dialectIntensity?: number;
  maxFirstTouchWords?: number;
  maxReplyWords?: number;
};

export type CustomerContextSnapshot = {
  person?: {
    id: string;
    displayName?: string;
    status?: string;
  };
  relationships: Array<{
    id: string;
    businessId: string;
    relationshipType?: string;
    jobTitle?: string;
    verificationMethod?: string;
    status?: string;
  }>;
};

export type MemoryContextSnapshot = {
  key: string;
  type: string;
  version: number;
  payload: unknown;
  sourceType: string;
  sourceRef: string;
  sourceEvidence?: Record<string, unknown>;
  confidence?: number;
  observedAt?: string;
  freshUntil?: string;
  freshnessState?: string;
  sensitivity?: string;
  validFrom?: string;
  validUntil?: string;
  expiresAt?: string;
  validityState?: string;
  correctionSemantics?: string;
  memoryId?: string;
  personId?: string;
  businessId?: string;
  conversationId?: string;
};

export type BusinessTwinContextSnapshot = {
  schemaVersion?: number;
  authority?: string;
  organization?: {
    id?: string;
    name?: string;
    brandName?: string;
  };
  policyConfiguration: Array<{
    scopeType: string;
    key: string;
    value: unknown;
    version?: number;
  }>;
  sourceSummary: Record<string, number>;
};

export type ToolAvailabilitySnapshot = {
  actionKey: string;
  toolKey: string;
  authorityKey: string;
  contractVersion: number;
  permissionKey: string;
  scopeType: string;
  costClass: string;
  sideEffectClass: string;
  approvalRequirement: string;
  approvalPolicyKey?: string;
  verifierKey: string;
  availability: string;
  requiredWorkPackages: string[];
  runtimeAuthorizationRequired: true;
};

export type PermissionContextSnapshot = {
  actorType: 'SYSTEM' | 'USER';
  userId?: string;
  organizationRole?: string;
  scopeAssignments: Array<{
    id: string;
    scopeType: string;
    role: string;
    brandId?: string;
    tenantBusinessId?: string;
    branchId?: string;
    departmentId?: string;
    teamId?: string;
  }>;
  source: 'IAM_CANONICAL';
  runtimeAuthorizationRequired: true;
};

export type ContextEvidenceSource = {
  authority: string;
  count?: number;
  version?: number | string;
  refs?: string[];
};

export type ContextEvidenceManifest = {
  schemaVersion: 1;
  sources: ContextEvidenceSource[];
};

export type AgentCollaboration = {
  specialistResults?: AgentResult[];
  orchestratorResult?: AgentResult | null;
  commercialDecision?: CommercialDecision;
  proposedReply?: ReplyDraft;
  bookingToolResult?: Record<string, unknown>;
};

export type AgentContext = {
  organizationId?: string;
  leadId?: string;
  conversationId?: string;
  businessName?: string;
  countryCode?: string;
  language?: string;
  dialect?: string;
  marketLocaleStyle?: MarketLocaleStyleSnapshot;
  industry?: string;
  message: string;
  conversationSummary?: string;
  conversationHistory?: ConversationMemoryItem[];
  salesState?: SalesStateSnapshot;
  knowledgeContext?: KnowledgeSnapshot[];
  serviceKnowledge?: ServiceKnowledgeSnapshot[];
  bookingContext?: BookingContextSnapshot;
  customerContext?: CustomerContextSnapshot;
  memoryContext?: MemoryContextSnapshot[];
  businessTwinContext?: BusinessTwinContextSnapshot;
  toolAvailability?: ToolAvailabilitySnapshot[];
  permissionContext?: PermissionContextSnapshot;
  contextEvidence?: ContextEvidenceManifest;
  activePrompts?: Partial<Record<AgentName, ActivePromptSnapshot>>;
  agentSettings?: Partial<Record<AgentName, AgentSettingSnapshot>>;
  collaboration?: AgentCollaboration;
  stage?: ConversationStage;
  intentScore?: number;
  opportunityScore?: number;
  agentMode?: AgentMode;
  quotedService?: string;
  quotedPrice?: number;
  quotedCurrency?: string;
  verifiedEvidence?: string[];
  approvedPortfolio?: string[];
  shadowMode?: boolean;
};

export type CatalogRecommendation = {
  contentId: string;
  serviceKey: string;
  label: string;
  source: 'SERVICE_ID' | 'EXPLICIT_MESSAGE';
};

export type SalesEfficiencyTrace = {
  policyPassed: boolean;
  wordCount: number;
  questionCount: number;
  maxReplyWords?: number;
  directPriceAnswerRequired: boolean;
  directPriceAnswered: boolean;
  readyToStart: boolean;
  qualificationQuestions: string[];
};

export type PipelineTrace = {
  reasoningTier?: 'ZERO_COST' | 'LIGHT' | 'FULL';
  routeReasons?: string[];
  estimatedLlmCalls?: number;
  paidAgentCallsPlanned?: number;
  routedAgents: AgentName[];
  agentResults: AgentResult[];
  decision: CommercialDecision;
  guardrails: string[];
  handoffReasons: string[];
  relevancePassed: boolean;
  humanStylePassed?: boolean;
  delivery: 'SEND' | 'REVIEW' | 'BLOCK';
  catalogRecommendation: CatalogRecommendation | null;
  salesEfficiency?: SalesEfficiencyTrace;
  bookingToolResult?: Record<string, unknown>;
};

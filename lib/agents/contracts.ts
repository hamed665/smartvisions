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
  direction: 'INBOUND' | 'OUTBOUND';
  channel?: string;
  body: string;
  at?: string;
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

export type AgentCollaboration = {
  specialistResults?: AgentResult[];
  orchestratorResult?: AgentResult | null;
  commercialDecision?: CommercialDecision;
  proposedReply?: ReplyDraft;
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
  knowledgeContext?: KnowledgeSnapshot[];
  serviceKnowledge?: ServiceKnowledgeSnapshot[];
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
};
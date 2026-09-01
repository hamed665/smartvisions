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

export type ConversationStage =
  | 'NEW'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'HOT'
  | 'HUMAN'
  | 'WON'
  | 'LOST';

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

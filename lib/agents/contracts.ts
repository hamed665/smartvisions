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

export type AgentContext = {
  organizationId?: string;
  leadId?: string;
  businessName?: string;
  countryCode?: string;
  language?: string;
  industry?: string;
  message: string;
  conversationSummary?: string;
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

export type CatalogRecommendation = {
  contentId: string;
  serviceKey: string;
  label: string;
  source: 'SERVICE_ID' | 'EXPLICIT_MESSAGE';
};

export type ReplyDraft = {
  text: string;
  language: string;
  generatedBy: 'secretary';
};

export type PipelineTrace = {
  routedAgents: AgentName[];
  agentResults: AgentResult[];
  decision: CommercialDecision;
  guardrails: string[];
  handoffReasons: string[];
  relevancePassed: boolean;
  delivery: 'SEND' | 'REVIEW' | 'BLOCK';
  catalogRecommendation: CatalogRecommendation | null;
};

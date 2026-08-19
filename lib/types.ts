export type AgentMode = "AUTO" | "PAUSED" | "HUMAN";
export type LeadStatus = "NEW" | "AUDITED" | "QUALIFIED" | "READY_TO_CONTACT" | "CONTACTED" | "REPLIED" | "INTERESTED" | "HOT" | "HUMAN" | "WON" | "LOST" | "DO_NOT_CONTACT";
export type MarketCode = "OM" | "AE" | "SA" | "QA" | "GB" | "US";

export interface Lead {
  id: string;
  businessName: string;
  country: MarketCode;
  city?: string;
  timezone?: string;
  status: LeadStatus;
  opportunityScore: number;
  intentScore: number;
  agentMode: AgentMode;
}

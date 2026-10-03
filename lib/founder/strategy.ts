import type { FounderEvidenceQuality } from './contracts';

export type FounderStrategicGoalV1={id:string;status:'DRAFT'|'ACTIVE'|'COMPLETED'|'CANCELED';category:'GROWTH'|'PRODUCT'|'REVENUE'|'CUSTOMER'|'OPERATIONS'|'FUNDRAISING'|'TEAM'|'OTHER';title:string;description:string|null;horizon:'QUARTER'|'YEAR'|'MULTI_YEAR'|'CUSTOM';startDate:string|null;endDate:string|null;sourceRef:string;notes:string|null;version:number;updatedAt:string};
export type FounderKeyResultV1={id:string;goalId:string;status:'NOT_STARTED'|'ON_TRACK'|'AT_RISK'|'ACHIEVED'|'CANCELED';metricName:string;unit:string|null;direction:'INCREASE'|'DECREASE'|'MAINTAIN'|'QUALITATIVE';baselineValue:number|null;targetValue:number|null;currentValue:number|null;dueDate:string|null;sourceRef:string;notes:string|null;version:number;updatedAt:string};
export type FounderMarketResearchItemV1={id:string;status:'CURRENT'|'STALE'|'ARCHIVED';researchType:'MARKET_SIZE'|'COMPETITOR'|'PRICING'|'REGULATION'|'TREND'|'INVESTOR'|'OTHER';title:string;claim:string;geography:string|null;segment:string|null;sourceUrl:string;sourceTitle:string|null;observedAt:string;lastVerifiedAt:string;notes:string|null;version:number;updatedAt:string};
export type FounderBoardReportV1={id:string;status:'DRAFT'|'PUBLISHED'|'ARCHIVED';title:string;periodStart:string;periodEnd:string;executiveSummary:string;decisionsNeeded:string[];risks:string[];sourceRef:string;version:number;updatedAt:string};
export type FounderStrategyEvidenceV1={authority:'STRATEGIC_GOALS'|'KEY_RESULTS'|'MARKET_RESEARCH'|'BOARD_REPORTS';quality:FounderEvidenceQuality;evidenceClass:'VERIFIED_PRODUCTION';count:number;detail:string};
export type FounderStrategyWorkspaceV1={schemaVersion:1;generatedAt:string;goals:FounderStrategicGoalV1[];keyResults:FounderKeyResultV1[];marketResearch:FounderMarketResearchItemV1[];boardReports:FounderBoardReportV1[];commandCenter:{activeGoals:number;activeKeyResults:number;atRiskKeyResults:number;achievedKeyResults:number;currentResearchItems:number;currentResearchTypes:string[];latestPublishedBoardReportAt:string|null};evidence:FounderStrategyEvidenceV1[]};

export function founderStrategyVerifiedAuthorities(strategy:FounderStrategyWorkspaceV1|null|undefined){
 return strategy?strategy.evidence.filter(x=>x.quality==='VERIFIED').map(x=>x.authority):[];
}
export function founderStrategyModelPayload(strategy:FounderStrategyWorkspaceV1|null|undefined){
 if(!strategy)return null;
 return {
  schemaVersion:strategy.schemaVersion,generatedAt:strategy.generatedAt,commandCenter:strategy.commandCenter,
  goals:strategy.goals.filter(g=>g.status!=='CANCELED').map(g=>({id:g.id,status:g.status,category:g.category,title:g.title,description:g.description,horizon:g.horizon,startDate:g.startDate,endDate:g.endDate})),
  keyResults:strategy.keyResults.filter(k=>k.status!=='CANCELED').map(k=>({id:k.id,goalId:k.goalId,status:k.status,metricName:k.metricName,unit:k.unit,direction:k.direction,baselineValue:k.baselineValue,targetValue:k.targetValue,currentValue:k.currentValue,dueDate:k.dueDate})),
  marketResearch:strategy.marketResearch.filter(x=>x.status==='CURRENT').slice(0,60).map(x=>({id:x.id,researchType:x.researchType,title:x.title,claim:x.claim,geography:x.geography,segment:x.segment,sourceUrl:x.sourceUrl,sourceTitle:x.sourceTitle,observedAt:x.observedAt,lastVerifiedAt:x.lastVerifiedAt})),
  boardReports:strategy.boardReports.filter(x=>x.status==='PUBLISHED').slice(0,12).map(x=>({id:x.id,title:x.title,periodStart:x.periodStart,periodEnd:x.periodEnd,executiveSummary:x.executiveSummary,decisionsNeeded:x.decisionsNeeded,risks:x.risks})),
  evidence:strategy.evidence,
 };
}

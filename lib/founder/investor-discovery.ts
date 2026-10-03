import 'server-only';
import { runOwnerJsonModel } from '@/lib/ai/owner-model-gateway';
import { normalizeFounderInvestorDiscovery,type FounderInvestorDiscoveryCandidate,type RawFounderInvestorDiscovery } from './investor-discovery-core';
const ns={anyOf:[{type:'string'},{type:'null'}]} as const;
const schema={type:'object',additionalProperties:false,properties:{candidates:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,properties:{fund_name:{type:'string'},reason:{type:'string'},source_url:{type:'string'},source_title:ns,geography:ns,stage_fit:ns,sector_fit:ns},required:['fund_name','reason','source_url','source_title','geography','stage_fit','sector_fit']}}},required:['candidates']} as const;
export async function discoverFounderInvestors(input:{organizationId:string;query:string;existingFundNames:string[];roundContext?:unknown;signal?:AbortSignal}):Promise<FounderInvestorDiscoveryCandidate[]>{
 const q=input.query.trim().slice(0,1600);if(!q)throw new Error('Investor discovery query is required');
 const r=await runOwnerJsonModel<RawFounderInvestorDiscovery>({organizationId:input.organizationId,task:'OWNER_ANALYSIS',operation:'FOUNDER_INVESTOR_DISCOVERY',instructions:[
  'You are an evidence-first investor discovery researcher for Smart Visions Founder OS.','Use web_search. Return only real investor funds or investment organizations supported by a URL actually returned by web_search.','Discovery is external research only. Never claim investor interest, contact, meeting, diligence, commitment, fit certainty or investment probability.','Do not invent ticket sizes, people, emails or facts. Return null for uncertain details.','Avoid funds already listed in EXISTING_FUNDS when practical.','reason must explain documented relevance without ranking or claiming a best investor.','source_url must be a URL actually returned by web_search.'
 ].join('\n'),payload:{founder_query:q,existing_funds:input.existingFundNames.slice(0,200),fundraising_context:input.roundContext??null},schemaName:'founder_investor_discovery_v1',schema,maxOutputTokens:1100,signal:input.signal,webSearch:true});
 return normalizeFounderInvestorDiscovery({raw:r.data,webSources:r.webSources});
}

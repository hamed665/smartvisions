import { normalizeOwnerWebUrl,type OwnerWebSource } from '@/lib/ai/owner-web-research-core';
export type RawFounderInvestorDiscovery={candidates?:unknown};
export type FounderInvestorDiscoveryCandidate={fundName:string;reason:string;sourceUrl:string;sourceTitle:string|null;geography:string|null;stageFit:string|null;sectorFit:string|null;verifiedDate:string};
function text(v:unknown,m:number){return String(v??'').trim().slice(0,m);}
export function normalizeFounderInvestorDiscovery(input:{raw:RawFounderInvestorDiscovery;webSources:OwnerWebSource[];nowIso?:string}):FounderInvestorDiscoveryCandidate[]{
 if(!Array.isArray(input.raw.candidates))return[];const allowed=new Map<string,string|null>();
 for(const s of input.webSources){const u=normalizeOwnerWebUrl(s.url);if(u)allowed.set(u,text(s.title,500)||null);}
 const seen=new Set<string>(),out:FounderInvestorDiscoveryCandidate[]=[];
 for(const item of input.raw.candidates){if(!item||typeof item!=='object'||Array.isArray(item))continue;const r=item as Record<string,unknown>,fund=text(r.fund_name,240),reason=text(r.reason,800),url=normalizeOwnerWebUrl(r.source_url);if(!fund||!reason||!url||!allowed.has(url))continue;const key=fund.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({fundName:fund,reason,sourceUrl:url,sourceTitle:text(r.source_title,500)||allowed.get(url)||null,geography:text(r.geography,160)||null,stageFit:text(r.stage_fit,160)||null,sectorFit:text(r.sector_fit,500)||null,verifiedDate:(input.nowIso??new Date().toISOString()).slice(0,10)});if(out.length>=8)break;}return out;
}

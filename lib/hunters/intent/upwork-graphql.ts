import 'server-only';

/** Official Upwork GraphQL, owner-initiated search only. No scraper or crawler. */
const ENDPOINT = 'https://api.upwork.com/graphql';
const QUERY = `
query SearchJobs($filter: MarketplaceJobPostingsSearchFilter) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: $filter
    searchType: USER_JOBS_SEARCH
    sortAttributes: [{ field: RECENCY }]
  ) {
    totalCount
    edges {
      node {
        id
        title
        description
        ciphertext
        totalApplicants
        publishedDateTime
        amount { displayValue currency }
        hourlyBudgetMin { displayValue currency }
        hourlyBudgetMax { displayValue currency }
        client { totalHires totalPostedJobs totalFeedback }
        skills { name }
      }
    }
  }
}`;

type UpworkMoney = { displayValue?: unknown; currency?: unknown } | null;
type RawNode = {
  id?: unknown; title?: unknown; description?: unknown; ciphertext?: unknown;
  publishedDateTime?: unknown; totalApplicants?: unknown; amount?: UpworkMoney;
  hourlyBudgetMin?: UpworkMoney; hourlyBudgetMax?: UpworkMoney;
  client?: { totalHires?: unknown; totalPostedJobs?: unknown; totalFeedback?: unknown } | null;
  skills?: Array<{ name?: unknown }> | null;
};
export type UpworkSearchJob = {
  id:string;title:string;description:string;publishedAt:string|null;
  applicants:number|null;budget:string|null;hourly:string|null;
  totalHires:number|null;totalPostedJobs:number|null;clientRating:number|null;
  skills:string[];
};

export class UpworkSearchError extends Error {
  constructor(public readonly code:'NOT_CONFIGURED'|'UPSTREAM_ERROR'|'INVALID_QUERY'|'MALFORMED_RESPONSE') {
    super(code);
  }
}
const str = (value:unknown, max=1000) => typeof value==='string'?value.trim().slice(0,max):'';
const num = (value:unknown) => typeof value==='number' && Number.isFinite(value) ? value : null;
function money(value:UpworkMoney):string|null {
  const amount = str(value?.displayValue,40);
  const currency = str(value?.currency,12);
  return amount ? [amount,currency].filter(Boolean).join(' ') : null;
}
export function mapUpworkJob(node:RawNode):UpworkSearchJob|null {
  const id = str(node.id,128), title=str(node.title,200),description=str(node.description,2000);
  if(!id||!title||!description) return null;
  const min=money(node.hourlyBudgetMin??null),max=money(node.hourlyBudgetMax??null);
  return {
    id,title,description,publishedAt:str(node.publishedDateTime,80)||null,
    applicants:num(node.totalApplicants),budget:money(node.amount??null),
    hourly:min||max?[min,max].filter(Boolean).join(' – '):null,
    totalHires:num(node.client?.totalHires),totalPostedJobs:num(node.client?.totalPostedJobs),
    clientRating:num(node.client?.totalFeedback),
    skills:(node.skills??[]).slice(0,12).map(x=>str(x.name,70)).filter(Boolean),
  };
}

export function normalizeUpworkSearch(query:string):string {
  const normalized=query.trim().replace(/\s+/g,' ');
  if(normalized.length<3 || normalized.length>90 || /[<>\u0000-\u001f]/.test(normalized)) {
    throw new UpworkSearchError('INVALID_QUERY');
  }
  return normalized;
}

export async function searchUpworkJobs(input:{
  query:string;accessToken:string;tenantId?:string;
  fetcher?:typeof fetch;
}):Promise<{total:number;jobs:UpworkSearchJob[]}> {
  const query=normalizeUpworkSearch(input.query);
  const token=input.accessToken.trim();
  if(!token)throw new UpworkSearchError('NOT_CONFIGURED');
  if(input.tenantId && !/^[0-9A-Za-z_-]{3,96}$/.test(input.tenantId))throw new UpworkSearchError('NOT_CONFIGURED');
  const headers:Record<string,string>={
    'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'
  };
  if(input.tenantId)headers['X-Upwork-API-TenantId']=input.tenantId;
  let response:Response;
  try {
    response=await (input.fetcher??fetch)(ENDPOINT,{
      method:'POST',headers,cache:'no-store',signal:AbortSignal.timeout(9000),
      body:JSON.stringify({query:QUERY,variables:{filter:{searchExpression_eq:query,pagination_eq:{after:'0',first:10}}}}),
    });
  }catch{throw new UpworkSearchError('UPSTREAM_ERROR');}
  if(!response.ok)throw new UpworkSearchError('UPSTREAM_ERROR');
  let raw:unknown;
  try{raw=await response.json();}catch{throw new UpworkSearchError('MALFORMED_RESPONSE');}
  if(!raw||typeof raw!=='object')throw new UpworkSearchError('MALFORMED_RESPONSE');
  const result=raw as {errors?:unknown;data?:{marketplaceJobPostingsSearch?:{
    totalCount?:unknown;edges?:Array<{node?:RawNode}>;
  }}};
  if(Array.isArray(result.errors)&&result.errors.length)throw new UpworkSearchError('UPSTREAM_ERROR');
  const search=result.data?.marketplaceJobPostingsSearch;
  if(!search||!Array.isArray(search.edges))throw new UpworkSearchError('MALFORMED_RESPONSE');
  return {
    total:num(search.totalCount)??search.edges.length,
    jobs:search.edges.slice(0,10).map(edge=>edge.node?mapUpworkJob(edge.node):null)
      .filter((job):job is UpworkSearchJob=>job!==null),
  };
}

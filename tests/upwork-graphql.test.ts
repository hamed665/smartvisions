import {describe,expect,it,vi} from 'vitest';
import {
  mapUpworkJob,normalizeUpworkSearch,searchUpworkJobs,UpworkSearchError
} from '@/lib/hunters/intent/upwork-graphql';

describe('official Upwork GraphQL read-only job search',()=>{
  it('validates user search input and forbids an empty token',async()=>{
    expect(()=>normalizeUpworkSearch('x')).toThrow(UpworkSearchError);
    expect(()=>normalizeUpworkSearch('<script>')).toThrow(UpworkSearchError);
    const fetcher=vi.fn();
    await expect(searchUpworkJobs({query:'Next.js',accessToken:'',fetcher})).rejects.toMatchObject({code:'NOT_CONFIGURED'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('only makes an official GraphQL query when explicitly called',async()=>{
    const fetcher=vi.fn().mockResolvedValue({
      ok:true,json:async()=>({
        data:{marketplaceJobPostingsSearch:{totalCount:1,edges:[{node:{
          id:'123',title:'Next.js and SaaS',description:'Need skilled Next.js and React developer for SaaS platform.',
          totalApplicants:14,amount:{displayValue:'1500',currency:'USD'},publishedDateTime:'2026-10-10T10:00:00Z',
          client:{totalHires:10,totalFeedback:4.8},skills:[{name:'Next.js'}]
        }}]}}
      })
    });
    const result=await searchUpworkJobs({query:' Next.js   SaaS ',accessToken:'fake-test-token',tenantId:'12345',fetcher});
    expect(result.jobs[0].title).toBe('Next.js and SaaS');
    expect(result.jobs[0].budget).toContain('USD');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,opts]=fetcher.mock.calls[0];
    expect(url).toBe('https://api.upwork.com/graphql');
    expect(opts.method).toBe('POST');
    expect(opts.cache).toBe('no-store');
    expect(opts.headers['X-Upwork-API-TenantId']).toBe('12345');
    const sent=JSON.parse(opts.body);
    expect(sent.variables.filter.searchExpression_eq).toBe('Next.js SaaS');
    expect(sent.variables.filter.pagination_eq.first).toBe(10);
    expect(sent.query).toContain('USER_JOBS_SEARCH');
    expect(sent.query).not.toContain('mutation');
  });
  it('fails closed on GraphQL errors, HTTP 429, and malformed payloads',async()=>{
    const errorFetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({errors:[{message:'bad scope'}]})});
    await expect(searchUpworkJobs({query:'Next.js',accessToken:'placeholder',fetcher:errorFetch})).rejects.toMatchObject({code:'UPSTREAM_ERROR'});
    const failFetch=vi.fn().mockResolvedValue({ok:false,status:429});
    await expect(searchUpworkJobs({query:'Next.js',accessToken:'placeholder',fetcher:failFetch})).rejects.toMatchObject({code:'UPSTREAM_ERROR'});
    const brokenFetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{}})});
    await expect(searchUpworkJobs({query:'Next.js',accessToken:'placeholder',fetcher:brokenFetch})).rejects.toMatchObject({code:'MALFORMED_RESPONSE'});
  });
  it('drops invalid items and bounds untrusted upstream text',()=>{
    expect(mapUpworkJob({title:'Missing ID',description:'desc'})).toBeNull();
    const job=mapUpworkJob({id:'1',title:'a'.repeat(500),description:'b'.repeat(4000),skills:[{name:'React'}]});
    expect(job?.title.length).toBe(200);
    expect(job?.description.length).toBe(2000);
    expect(job?.skills).toEqual(['React']);
  });
});

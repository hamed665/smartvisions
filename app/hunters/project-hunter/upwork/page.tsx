import Link from 'next/link';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { normalizeUpworkSearch, searchUpworkJobs, UpworkSearchError } from '@/lib/hunters/intent/upwork-graphql';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{q?:string}>;

export default async function UpworkOfficialSearchPage({searchParams}:{searchParams:SearchParams}) {
  await getCurrentOrganization(true);
  const query=String((await searchParams).q??'').trim();
  const enabled=process.env.UPWORK_OFFICIAL_API_ENABLED==='true';
  const token=process.env.UPWORK_OAUTH_ACCESS_TOKEN??'';
  const configured=enabled&&Boolean(token);
  let result:Awaited<ReturnType<typeof searchUpworkJobs>>|null=null;
  let error:string|null=null;
  if(query&&configured){
    try{
      normalizeUpworkSearch(query);
      result=await searchUpworkJobs({query,accessToken:token,tenantId:process.env.UPWORK_API_TENANT_ID});
    }catch(e) {
      error=e instanceof UpworkSearchError
        ? (e.code==='INVALID_QUERY'?'Enter 3–90 safe characters.':'Upwork API search unavailable or authorization expired. Check scopes and token.')
        : 'Upwork search unavailable';
    }
  }
  return <main className="pageStack">
    <section className="panel">
      <div className="headerRow"><div><p className="eyebrow">Official integration · owner initiated</p><h1>Upwork Job Search</h1></div><Link className="textLink" href="/hunters/project-hunter">← Project Hunter</Link></div>
      <p className="muted">Official OAuth-protected GraphQL search. No scraping, no autonomous polling, no auto-apply, no external messages, no stored API search responses. Results are Upwork-only and remain separate from other source results.</p>
      <p><strong>Connection:</strong> {configured?'Read-only credentials configured':'NOT CONFIGURED / awaiting approved OAuth credentials'}</p>
      {!configured?<p><a className="textLink" href="https://www.upwork.com/developer/keys/apply" target="_blank" rel="noopener noreferrer">Apply for an official Upwork API key ↗</a> · Approval is Upwork-controlled and eligibility restrictions apply.</p>:null}
      <form method="get" className="settingsCreate">
        <label>Search Upwork listings<input type="search" name="q" minLength={3} maxLength={90} required defaultValue={query} placeholder="Next.js SaaS"/></label>
        <button disabled={!configured}>Search official API</button>
      </form>
      {error?<p role="alert" className="muted">{error}</p>:null}
    </section>
    {result?<section className="panel">
      <h2>Upwork results ({result.total} reported)</h2>
      <p className="muted">Live results are displayed temporarily only. Review a job on Upwork before creating your own project note or sending a proposal. Upwork may have stricter requirements not visible here.</p>
      <div className="settingsList">{result.jobs.map(job=><article className="settingsRow" key={job.id}>
        <div><strong>{job.title}</strong>
          <p className="muted">Reported budget: {job.budget??'not specified'} · Hourly: {job.hourly??'not specified'} · Applicants: {job.applicants??'unknown'} · Posted: {job.publishedAt??'unknown'}</p>
          <p className="muted">Client hires: {job.totalHires??'unknown'} · Prior posts: {job.totalPostedJobs??'unknown'} · Feedback: {job.clientRating??'unknown'}</p>
          <p>{job.description.slice(0,850)}</p><p className="muted">{job.skills.join(' · ')}</p>
          <a className="textLink" href={'https://www.upwork.com/nx/search/jobs/?q='+encodeURIComponent(job.title)} target="_blank" rel="noopener noreferrer">Find listing on Upwork ↗</a>
        </div>
      </article>)}</div>
    </section>:null}
  </main>;
}

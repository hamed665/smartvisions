import { IdentityResolutionClient } from './resolution-client';
import { listCrmIdentityResolutionCandidates } from '@/lib/crm/identity-graph';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Candidate = {
  identity_id: string;
  identity_type: string;
  display_value: string | null;
  identity_status: string;
  business_ids: string[];
  person_ids: string[];
  business_count: number;
  person_count: number;
  verified_business_links: number;
  observed_business_links: number;
  verified_person_links: number;
  conflict_state: string;
  confidence_state: string;
  evidence_methods: string[];
};

type PersonRow = {
  id: string;
  display_name: string | null;
  status: string;
};

export default async function IdentityReviewPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const raw = await listCrmIdentityResolutionCandidates({
    supabase,
    organizationId,
    limit: 50,
  });
  const candidates = (raw ?? []) as Candidate[];
  const personIds = [...new Set(candidates.flatMap((candidate) => candidate.person_ids ?? []))];

  let people: PersonRow[] = [];
  if (personIds.length) {
    const { data, error } = await supabase
      .from('crm_people')
      .select('id,display_name,status')
      .eq('organization_id', organizationId)
      .in('id', personIds)
      .order('created_at');

    if (error) throw new Error(`CRM identity review Person lookup failed: ${error.message}`);
    people = (data ?? []) as PersonRow[];
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const canResolve = ['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Identity Review</h1>
        <p className="muted">Deterministic review of canonical CRM identity conflicts. No fuzzy auto-merge and no display-name-only resolution.</p>
      </div>
      <span className="status">{candidates.length} candidates</span>
    </div>

    {candidates.length === 0 ? <section className="panel">
      <strong>No unresolved identity conflicts</strong>
      <p className="muted">This only means the canonical conflict read model is currently empty. It does not invent or backfill People from existing provider display names.</p>
    </section> : null}

    <div className="settingsList">
      {candidates.map((candidate) => {
        const candidatePeople = (candidate.person_ids ?? [])
          .map((id) => peopleById.get(id))
          .filter((person): person is PersonRow => Boolean(person));

        return <section className="panel" key={candidate.identity_id}>
          <div className="headerRow">
            <div>
              <strong>{candidate.identity_type}</strong>
              <p className="muted smallText">{candidate.display_value || 'No display value'} · {candidate.conflict_state} · {candidate.confidence_state}</p>
            </div>
            <span className="status">{candidate.person_count} People · {candidate.business_count} Companies</span>
          </div>

          <div className="settingsList">
            {candidatePeople.map((person) => <div className="settingsRow" key={person.id}>
              <div>
                <strong>{person.display_name || 'Unnamed Person'}</strong>
                <span className="muted smallText">{person.id}</span>
              </div>
              <span className="status">{person.status}</span>
            </div>)}
          </div>

          {candidate.evidence_methods?.length ? <p className="muted smallText">Evidence: {candidate.evidence_methods.join(', ')}</p> : null}
          {candidate.business_ids?.length ? <p className="muted smallText">Business evidence IDs: {candidate.business_ids.join(', ')}</p> : null}

          <IdentityResolutionClient
            organizationId={organizationId}
            identityId={candidate.identity_id}
            people={candidatePeople}
            canResolve={canResolve}
            personConflict={candidate.person_count > 1}
          />
        </section>;
      })}
    </div>
  </div>;
}

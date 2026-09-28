import Link from 'next/link';

import { listCrmPeople } from '@/lib/crm/people';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type PersonRow = {
  id: string;
  display_name: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
};

export default async function CustomersPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const rows = await listCrmPeople({
    supabase,
    organizationId,
    limit: 250,
  }) as PersonRow[];

  return <div>
    <div className="headerRow">
      <div>
        <h1>Customers</h1>
        <p className="muted">Canonical People only. Provider display names and Company records do not become customers without identity evidence.</p>
      </div>
      <span className="status">{rows.length} People</span>
    </div>

    {rows.length === 0 ? <section className="panel">
      <strong>No canonical People yet</strong>
      <p className="muted">Production remains honest. Create or resolve a Person only from verified identity evidence; this screen does not fabricate customers from existing Lead or Company data.</p>
      <Link className="textLink" href="/identity-review">Open Identity Review →</Link>
    </section> : null}

    <div className="settingsList">
      {rows.map((person) => <Link className="settingsRow" href={`/customers/${person.id}`} key={person.id}>
        <div>
          <strong>{person.display_name || 'Unnamed Person'}</strong>
          <span className="muted smallText">{person.id}</span>
          <span className="muted smallText">Last seen {new Date(person.last_seen_at).toLocaleString()}</span>
        </div>
        <span className="status">{person.status}</span>
      </Link>)}
    </div>
  </div>;
}

import Link from 'next/link';

import { listCrmAccounts } from '@/lib/crm/accounts';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const accounts = await listCrmAccounts({ supabase, organizationId, limit: 250 });

  return <div>
    <div className="headerRow">
      <div>
        <h1>Accounts</h1>
        <p className="muted">Canonical external Companies from the existing Business authority. Tenant businesses and internal branches are a separate operating hierarchy.</p>
      </div>
      <span className="status">{accounts.length} Accounts</span>
    </div>

    <section className="panel">
      <strong>No inferred B2B status</strong>
      <p className="muted">Existing Companies remain UNCLASSIFIED until an authorized operator records lifecycle, owner or hierarchy evidence. Discovery data alone never turns a Company into a Customer.</p>
    </section>

    <div className="settingsList">
      {accounts.map((account) => <Link className="settingsRow" href={`/accounts/${account.id}`} key={account.id}>
        <div>
          <strong>{account.name}</strong>
          <span className="muted smallText">{account.country_code || account.id}</span>
          {account.parent_business_id ? <span className="muted smallText">{account.hierarchy_relation || 'CHILD_OF'} {account.parent_business_id}</span> : null}
        </div>
        <div>
          <span className="status">{account.account_lifecycle}</span>
          {account.account_owner_user_id ? <span className="muted smallText">Owner {account.account_owner_user_id}</span> : null}
        </div>
      </Link>)}
    </div>
  </div>;
}

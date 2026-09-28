import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountActions } from './account-actions';
import { getCrmAccountV2, listCrmAccounts } from '@/lib/crm/accounts';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
type AccountPayload = {
  account: {
    id: string;
    name: string;
    countryCode: string;
    city: string | null;
    category: string | null;
    officialWebsite: string | null;
    formattedAddress: string | null;
    lifecycle: string;
    ownerUserId: string | null;
    parentBusinessId: string | null;
    hierarchyRelation: string | null;
    updatedAt: string;
  };
  owner: Row | null;
  parent: Row | null;
  children: Row[];
  contacts: Row[];
  leads: Row[];
  deals: Row[];
  tasks: Row[];
  moduleStatus: Record<string, string>;
};

function text(value: unknown) {
  return value == null || value === '' ? '—' : String(value);
}

function rows(items: Row[], fields: Array<[string, string]>) {
  if (!items.length) return <p className="muted">No records.</p>;
  return <div className="settingsList">{items.map((item, index) => <div className="settingsRow" key={String(item.id ?? index)}>
    <div>
      <strong>{text(item.name ?? item.displayName ?? item.title ?? item.id)}</strong>
      {fields.map(([label, key]) => <span className="muted smallText" key={key}>{label}: {text(item[key])}</span>)}
    </div>
  </div>)}</div>;
}

type Props = { params: Promise<{ id: string }> };

export default async function AccountDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, organizationId, role } = await getCurrentOrganization();

  let payload: AccountPayload;
  try {
    payload = await getCrmAccountV2({
      supabase,
      organizationId,
      businessId: id,
      limit: 50,
    }) as unknown as AccountPayload;
  } catch (error) {
    if (error instanceof Error && /Account was not found/i.test(error.message)) notFound();
    throw error;
  }

  const [allAccounts, memberResult] = await Promise.all([
    listCrmAccounts({ supabase, organizationId, limit: 250 }),
    supabase
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .in('role', ['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_AGENT'])
      .order('role', { ascending: true }),
  ]);

  if (memberResult.error) throw new Error(`CRM Account member lookup failed: ${memberResult.error.message}`);
  const members = (memberResult.data ?? []).map((member) => ({
    userId: String(member.user_id),
    role: String(member.role),
  }));
  const canManage = ['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>{payload.account.name}</h1>
        <p className="muted">CRM Account over the canonical external Company record. Internal tenant businesses and branches remain separate.</p>
      </div>
      <Link className="textLink" href="/accounts">← Accounts</Link>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Lifecycle</span><strong>{payload.account.lifecycle}</strong></article>
      <article><span>Contacts</span><strong>{payload.contacts.length}</strong></article>
      <article><span>Leads</span><strong>{payload.leads.length}</strong></article>
      <article><span>Deals</span><strong>{payload.deals.length}</strong></article>
    </section>

    <section className="panel">
      <h2>Account facts</h2>
      <div className="healthList">
        <span>Country <strong>{text(payload.account.countryCode)}</strong></span>
        <span>City <strong>{text(payload.account.city)}</strong></span>
        <span>Category <strong>{text(payload.account.category)}</strong></span>
        <span>Owner <strong>{text(payload.account.ownerUserId)}</strong></span>
        <span>Parent <strong>{text(payload.account.parentBusinessId)}</strong></span>
        <span>Relation <strong>{text(payload.account.hierarchyRelation)}</strong></span>
      </div>
    </section>

    <section className="panel">
      <h2>Governance</h2>
      <AccountActions
        organizationId={organizationId}
        businessId={payload.account.id}
        currentLifecycle={payload.account.lifecycle}
        currentOwnerUserId={payload.account.ownerUserId}
        currentParentBusinessId={payload.account.parentBusinessId}
        currentRelation={payload.account.hierarchyRelation}
        canManage={canManage}
        members={members}
        accounts={allAccounts.map((account) => ({ id: account.id, name: account.name }))}
      />
    </section>

    <section className="panel"><h2>Parent</h2>{payload.parent ? rows([payload.parent], [['Lifecycle', 'lifecycle']]) : <p className="muted">Root Account.</p>}</section>
    <section className="panel"><h2>Child Accounts</h2>{rows(payload.children, [['Relation', 'hierarchyRelation'], ['Lifecycle', 'lifecycle']])}</section>
    <section className="panel"><h2>Contacts</h2>{rows(payload.contacts, [['Relationship', 'relationshipType'], ['Job title', 'jobTitle'], ['Verification', 'verificationMethod']])}</section>
    <section className="panel"><h2>Leads</h2>{rows(payload.leads, [['Status', 'status'], ['Opportunity', 'opportunityScore'], ['Intent', 'intentScore'], ['Person', 'personId']])}</section>
    <section className="panel"><h2>Deals</h2>{rows(payload.deals, [['State', 'state'], ['Amount', 'amount'], ['Currency', 'currency'], ['Person', 'personId']])}</section>
    <section className="panel"><h2>Tasks</h2>{rows(payload.tasks, [['Status', 'status'], ['Priority', 'priority'], ['Due', 'dueAt'], ['Person', 'personId']])}</section>

    <section className="panel">
      <h2>Module coverage</h2>
      <div className="healthList">
        {Object.entries(payload.moduleStatus ?? {}).map(([module, status]) => <span key={module}>{module} <strong>{status}</strong></span>)}
      </div>
    </section>
  </div>;
}

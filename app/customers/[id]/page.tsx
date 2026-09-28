import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Customer360Actions } from './customer360-actions';
import { getCrmCustomer360 } from '@/lib/crm/customer360';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Item = Record<string, unknown>;
type Candidate = {
  entityType: 'LEAD' | 'CONVERSATION' | 'TASK' | 'DEAL';
  entityId: string;
  businessId?: string | null;
  label?: string | null;
  updatedAt?: string | null;
};
type Customer360 = {
  person: {
    id: string;
    displayName: string | null;
    status: string;
    mergedIntoPersonId: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  identities: Item[];
  relationships: Item[];
  leads: Item[];
  conversations: Item[];
  tasks: Item[];
  deals: Item[];
  supportCases: Item[];
  activityTimeline: Item[];
  linkCandidates: {
    leads: Candidate[];
    conversations: Candidate[];
    tasks: Candidate[];
    deals: Candidate[];
  };
  moduleStatus: Record<string, string>;
};

function text(value: unknown) {
  return value == null || value === '' ? '—' : String(value);
}

function sectionRows(rows: Item[], fields: Array<[string, string]>) {
  if (!rows.length) return <p className="muted">No directly linked records.</p>;
  return <div className="settingsList">{rows.map((row, index) => <div className="settingsRow" key={String(row.id ?? row.itemId ?? index)}>
    <div>
      <strong>{text(row.title ?? row.label ?? row.displayValue ?? row.identityType ?? row.kind ?? row.id ?? row.itemId)}</strong>
      {fields.map(([label, key]) => <span className="muted smallText" key={key}>{label}: {text(row[key])}</span>)}
    </div>
  </div>)}</div>;
}

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, organizationId, role } = await getCurrentOrganization();

  let customer: Customer360;
  try {
    customer = await getCrmCustomer360({
      supabase,
      organizationId,
      personId: id,
      limit: 50,
    }) as unknown as Customer360;
  } catch (error) {
    if (error instanceof Error && /Person was not found/i.test(error.message)) notFound();
    throw error;
  }

  const canResolve = ['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(String(role));
  const candidates = [
    ...(customer.linkCandidates?.leads ?? []),
    ...(customer.linkCandidates?.conversations ?? []),
    ...(customer.linkCandidates?.tasks ?? []),
    ...(customer.linkCandidates?.deals ?? []),
  ];

  const linked = [
    ...customer.leads.map((row) => ({ entityType: 'LEAD' as const, entityId: String(row.id), label: text(row.recommendedOffer ?? row.id) })),
    ...customer.conversations.map((row) => ({ entityType: 'CONVERSATION' as const, entityId: String(row.id), label: text(row.channel ?? row.id) })),
    ...customer.tasks.map((row) => ({ entityType: 'TASK' as const, entityId: String(row.id), label: text(row.title ?? row.id) })),
    ...customer.deals.map((row) => ({ entityType: 'DEAL' as const, entityId: String(row.id), label: text(row.title ?? row.id) })),
  ];

  return <div>
    <div className="headerRow">
      <div>
        <h1>{customer.person.displayName || 'Unnamed Person'}</h1>
        <p className="muted">Person-centric Customer 360. Only explicit evidence-backed links are attributed to this Person.</p>
      </div>
      <Link className="textLink" href="/customers">← Customers</Link>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Status</span><strong>{customer.person.status}</strong></article>
      <article><span>Identities</span><strong>{customer.identities.length}</strong></article>
      <article><span>Relationships</span><strong>{customer.relationships.length}</strong></article>
      <article><span>Timeline</span><strong>{customer.activityTimeline.length}</strong></article>
    </section>

    {customer.person.mergedIntoPersonId ? <section className="panel">
      <strong>This Person was merged</strong>
      <p className="muted">Canonical operational links are reconciled to the target Person.</p>
      <Link className="textLink" href={`/customers/${customer.person.mergedIntoPersonId}`}>Open target Person →</Link>
    </section> : null}

    <section className="panel">
      <h2>Identity graph</h2>
      {sectionRows(customer.identities, [['Type', 'identityType'], ['Verification', 'verificationMethod'], ['Status', 'linkStatus']])}
    </section>

    <section className="panel">
      <h2>Company relationships</h2>
      {sectionRows(customer.relationships, [['Company', 'businessName'], ['Relationship', 'relationshipType'], ['Job title', 'jobTitle'], ['Status', 'status']])}
    </section>

    <section className="panel">
      <h2>Conversations</h2>
      {sectionRows(customer.conversations, [['Channel', 'channel'], ['Stage', 'stage'], ['Intent', 'intentLabel'], ['Last message', 'lastMessageAt']])}
    </section>

    <section className="panel">
      <h2>Tasks</h2>
      {sectionRows(customer.tasks, [['Type', 'taskType'], ['Status', 'status'], ['Priority', 'priority'], ['Due', 'dueAt']])}
    </section>

    <section className="panel">
      <h2>Deals</h2>
      {sectionRows(customer.deals, [['State', 'state'], ['Amount', 'amount'], ['Currency', 'currency'], ['Expected close', 'expectedCloseAt']])}
    </section>

    <section className="panel">
      <h2>Support Cases</h2>
      <p className="muted">Only Cases created with this explicit canonical Person context are shown. Customer 360 does not rewrite immutable Support Case identity/context.</p>
      {sectionRows(customer.supportCases ?? [], [['Status', 'status'], ['Priority', 'priority'], ['Escalation', 'escalationLevel'], ['CSAT', 'csatScore'], ['Updated', 'updatedAt']])}
    </section>

    <section className="panel">
      <h2>Activity timeline</h2>
      <p className="muted">Only timeline items whose Lead or Conversation is explicitly linked to this Person are shown. A Company relationship alone is never treated as Person activity.</p>
      {sectionRows(customer.activityTimeline, [['Kind', 'kind'], ['Channel', 'channel'], ['Visibility', 'visibility'], ['Occurred', 'occurredAt']])}
    </section>

    <section className="panel">
      <h2>Customer 360 link review</h2>
      <p className="muted">Candidates are derived from active Person-Company relationships, but they are not attributed until an authorized operator explicitly confirms the link.</p>
      <Customer360Actions
        organizationId={organizationId}
        personId={customer.person.id}
        canResolve={canResolve}
        candidates={candidates}
        linked={linked}
      />
    </section>

    <section className="panel">
      <h2>Module coverage</h2>
      <div className="healthList">
        {Object.entries(customer.moduleStatus ?? {}).map(([module, status]) => <span key={module}>{module} <strong>{status}</strong></span>)}
      </div>
      <p className="muted">Missing modules remain explicit. Customer 360 does not create placeholder Booking, Quote, Order, Invoice, Payment, Document or Consent truth. Scoped internal Notes stay outside this Organization-wide read model until their authorization can be preserved.</p>
    </section>
  </div>;
}

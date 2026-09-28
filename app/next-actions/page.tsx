import Link from 'next/link';

import { listCrmNextActions } from '@/lib/crm/next-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { NextActionControls } from './next-action-controls';

export const dynamic = 'force-dynamic';

export default async function NextActionsPage() {
  const { supabase, organizationId, role, userId } = await getCurrentOrganization();

  const [items, members] = await Promise.all([
    listCrmNextActions({
      supabase,
      organizationId,
      staleHours: 72,
      limit: 100,
    }),
    supabase
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .in('role', ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'])
      .order('role', { ascending: true }),
  ]);

  if (members.error) {
    throw new Error(`Next-action member lookup failed: ${members.error.message}`);
  }

  const accepted = items.filter((item) => item.accepted).length;
  const derived = items.length - accepted;
  const urgent = items.filter((item) => item.priority_score >= 90).length;
  const canAccept = ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Next Actions</h1>
        <p className="muted">One human sales queue derived from canonical CRM truth. Suggestions never send customer messages automatically.</p>
      </div>
      <Link className="textLink" href="/tasks">Open Tasks →</Link>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Queue</span><strong>{items.length}</strong></article>
      <article><span>Accepted tasks</span><strong>{accepted}</strong></article>
      <article><span>Derived candidates</span><strong>{derived}</strong></article>
      <article><span>Urgent</span><strong>{urgent}</strong></article>
    </section>

    <NextActionControls
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={String(role)}
      canAccept={canAccept}
      members={(members.data ?? []).map((row) => ({
        userId: String(row.user_id),
        role: String(row.role),
      }))}
      items={items}
      staleHours={72}
    />

    <section className="panel">
      <strong>Safety contract</strong>
      <p className="muted">Stale Leads and Deals are read-only derived candidates until a human explicitly accepts one into the canonical CRM Task store. Legacy outreach follow-up jobs are not the sales work queue. Model suggestions are advisory-only and cannot change owner, status, due time, reminder or provider-send state.</p>
    </section>
  </div>;
}

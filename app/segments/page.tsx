import { listCrmSegments } from '@/lib/crm/segments';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { SegmentActions } from './segment-actions';

export const dynamic = 'force-dynamic';

export default async function SegmentsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const page = await listCrmSegments({
    supabase,
    organizationId,
    includeArchived: true,
    limit: 100,
  });

  const canManage = ['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));
  const active = page.items.filter(segment => segment.status === 'ACTIVE').length;
  const counts = Object.fromEntries(
    ['LEAD','PERSON','DEAL','ACCOUNT'].map(type => [
      type,
      page.items.filter(segment => segment.entity_type === type).length,
    ]),
  );

  return <div>
    <div className="headerRow">
      <div>
        <h1>Segments</h1>
        <p className="muted">Versioned, bounded dynamic audiences over canonical Lead, Person, Deal and Account truth. Evaluation never sends messages or silently persists membership.</p>
      </div>
      <span className="status">{active} active · {page.items.length} total</span>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Lead</span><strong>{String(counts.LEAD ?? 0)}</strong></article>
      <article><span>Person</span><strong>{String(counts.PERSON ?? 0)}</strong></article>
      <article><span>Deal</span><strong>{String(counts.DEAL ?? 0)}</strong></article>
      <article><span>Account</span><strong>{String(counts.ACCOUNT ?? 0)}</strong></article>
    </section>

    <SegmentActions
      organizationId={organizationId}
      canManage={canManage}
      segments={page.items}
    />

    <section className="panel">
      <strong>Audience boundary</strong>
      <p className="muted">This surface owns dynamic Segment definitions only. Immutable audience snapshots are a separate Work Package. Custom-field predicates are available only where the canonical custom-field authority exists: Lead and Deal.</p>
    </section>
  </div>;
}

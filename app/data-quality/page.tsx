import { DataQualityImport } from './data-quality-import';
import {
  getCrmDataQualitySummary,
  isCrmDataQualityMutationRole,
} from '@/lib/crm/data-quality';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Issue = {
  entityId?: string;
  issueType?: string;
  severity?: string;
  detail?: Record<string, unknown>;
  detectedAt?: string;
};

export default async function DataQualityPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();

  const [summary, batches] = await Promise.all([
    getCrmDataQualitySummary({ supabase, organizationId, limit: 100 }),
    supabase
      .from('crm_data_import_batches')
      .select('id,request_key,row_count,created_people_count,linked_relationship_count,status,requested_by_user_id,created_at,completed_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  if (batches.error) throw new Error(`CRM import receipt lookup failed: ${batches.error.message}`);

  const summaryCounts = (summary.summary ?? {}) as Record<string, unknown>;
  const issues = Array.isArray(summary.issues) ? summary.issues as Issue[] : [];
  const retention = (summary.retention ?? {}) as Record<string, unknown>;

  return <div>
    <div className="headerRow">
      <div>
        <h1>Data Quality</h1>
        <p className="muted">Deterministic quality checks and verified Contact import over canonical CRM truth. No fuzzy auto-merge and no destructive retention without an approved policy.</p>
      </div>
      <span className="status">{issues.length} surfaced issues</span>
    </div>

    <section className="statsGrid fourStats">
      <article><span>People</span><strong>{String(summaryCounts.people ?? 0)}</strong></article>
      <article><span>Identities</span><strong>{String(summaryCounts.identities ?? 0)}</strong></article>
      <article><span>Businesses</span><strong>{String(summaryCounts.businesses ?? 0)}</strong></article>
      <article><span>High severity</span><strong>{String(summaryCounts.highSeverityIssues ?? 0)}</strong></article>
    </section>

    <section className="panel">
      <h2>Quality findings</h2>
      {issues.length === 0 ? <p className="muted">No deterministic quality issue is currently surfaced.</p> : null}
      <div className="settingsList">
        {issues.map((issue, index) => <article className="settingsRow" key={`${issue.issueType}-${issue.entityId}-${index}`}>
          <div>
            <strong>{issue.issueType || 'QUALITY_ISSUE'}</strong>
            <span className="muted smallText">{issue.severity || 'UNKNOWN'} · {issue.entityId || '—'}</span>
            <span className="muted smallText">{JSON.stringify(issue.detail ?? {})}</span>
          </div>
        </article>)}
      </div>
    </section>

    <DataQualityImport
      organizationId={organizationId}
      canApply={isCrmDataQualityMutationRole(role)}
    />

    <section className="panel">
      <h2>Recent verified imports</h2>
      <div className="healthList">
        {(batches.data ?? []).length ? (batches.data ?? []).map(batch => <span key={String(batch.id)}>
          {String(batch.request_key)}
          <strong>{String(batch.status)} · {String(batch.row_count)} rows · {String(batch.created_people_count)} new People · {String(batch.linked_relationship_count)} relationships</strong>
        </span>) : <span>No import receipts <strong>No synthetic import batch has been created.</strong></span>}
      </div>
    </section>

    <section className="panel">
      <h2>Retention</h2>
      <p className="muted"><strong>{String(retention.status ?? 'UNKNOWN')}</strong>: {String(retention.reason ?? 'No retention status')}</p>
    </section>
  </div>;
}

function href(format: string, days: number, businessId: string | null, branchId: string | null) {
  const params = new URLSearchParams({ format, days: String(days) });
  if (businessId) params.set('business', businessId);
  if (branchId) params.set('branch', branchId);
  return '/api/data/export?' + params.toString();
}

export function DataExportPanel({
  days,
  businessId,
  branchId,
  scopeLabel,
}: {
  days: number;
  businessId: string | null;
  branchId: string | null;
  scopeLabel: string;
}) {
  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Export governed data</h2>
        <p className="muted">
          Downloads reuse the same authenticated scope, Metrics Registry and Analytics Warehouse as this dashboard.
          No arbitrary SQL or wider-scope fallback is used.
        </p>
      </div>
      <span className="status">READ ONLY · {scopeLabel}</span>
    </div>
    <div className="conversationFilters">
      {['CSV','XLSX','PDF','JSON'].map((format) =>
        <a className="textLink" key={format} href={href(format, days, businessId, branchId)}>
          Download {format}
        </a>
      )}
    </div>
    <p className="muted smallText">
      Google Sheets direct publishing is blocked until a canonical Sheets connection is configured.
      XLSX and CSV remain Google Sheets-compatible fallbacks.
    </p>
  </section>;
}

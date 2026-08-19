const metrics = [
  'New Leads','Audited','Qualified','Contacted','Replies','Positive','HOT','Won','Lost','Revenue','API Cost','ROI','Cost / Reply','Cost / HOT','Cost / Sale','Preview View Rate','Preview → HOT','Preview → Won'
];

export default function ReportsPage() {
  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Reports</h1>
          <p className="muted">Funnel, market, service, message-variant, AI-cost and preview conversion reporting.</p>
        </div>
        <span className="status">Outcome-driven</span>
      </div>
      <div className="grid">
        {metrics.map((metric) => <div className="card" key={metric}><div className="muted">{metric}</div><div className="value">—</div></div>)}
      </div>
      <div className="twoCol">
        <section className="panel"><h2>Why this reply?</h2><p className="muted">Every agent run stores routed agents, confidence, evidence, blockers, the commercial decision, relevance result and delivery gate.</p></section>
        <section className="panel"><h2>Preview performance</h2><p className="muted">Track offered → accepted → generated → viewed → HOT → WON instead of congratulating ourselves because a mockup looked pretty.</p></section>
      </div>
    </div>
  );
}

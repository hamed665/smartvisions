const metrics = [
  ["New Leads", "0"], ["Audited", "0"], ["Qualified", "0"], ["Contacted", "0"],
  ["Replies", "0"], ["Positive", "0"], ["HOT", "0"], ["Won", "0"],
];

export default function HomePage() {
  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Control Center</h1>
          <p className="muted">Foundation mode · no autonomous outreach yet</p>
        </div>
        <span className="status">Shadow Mode ON</span>
      </div>

      <section className="grid">
        {metrics.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="muted">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </section>

      <section className="twoCol">
        <div className="panel">
          <h2>Hard safeguards</h2>
          <ul>
            <li>Local-time send window: 09:00–19:00</li>
            <li>Global DNC / suppression enforcement</li>
            <li>Human takeover hard-locks AI sending</li>
            <li>Configured prices only</li>
            <li>Discount ceilings enforced server-side</li>
            <li>Global and channel kill switches</li>
          </ul>
        </div>
        <div className="panel">
          <h2>MVP markets</h2>
          <ul>
            <li>Oman · OMR · Omani Arabic / English</li>
            <li>UAE · AED · Emirati Arabic / English</li>
            <li>Saudi · SAR · Saudi Arabic / English</li>
            <li>Qatar · QAR · Qatari/Gulf Arabic / English</li>
            <li>UK · GBP · British English</li>
            <li>USA · USD · American English</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

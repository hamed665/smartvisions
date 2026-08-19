const controls = [
  ['Send window', '09:00–19:00 local time'],
  ['US timezone', 'Lead-specific required'],
  ['Follow-ups', 'Day 3 / Day 7'],
  ['Reply stop', 'Enabled'],
  ['DNC', 'Global block'],
  ['Human takeover', 'Hard lock'],
];

const markets = [
  ['Oman', 'OMR', 'Omani Arabic / EN'],
  ['UAE', 'AED', 'Emirati Arabic / EN'],
  ['Saudi Arabia', 'SAR', 'Saudi Arabic / EN'],
  ['Qatar', 'QAR', 'Qatari Arabic / EN'],
  ['United Kingdom', 'GBP', 'British English'],
  ['United States', 'USD', 'American English'],
];

export default function OutreachPage() {
  return (
    <div>
      <h1>Outreach Control</h1>
      <p className="muted">Country-local scheduling, pricing, messaging and reply intelligence.</p>
      <section className="grid">
        {controls.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="muted">{label}</div>
            <div className="value" style={{ fontSize: 18 }}>{value}</div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Markets</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {markets.map(([name, currency, locale]) => (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: '1.2fr .6fr 1.6fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <strong>{name}</strong><span>{currency}</span><span className="muted">{locale}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

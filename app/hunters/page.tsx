const businessFlow = ['Campaign', 'Places IDs', 'Place details', 'Official website', 'Crawl4AI audit', 'Opportunity score', 'Offer'];
const intentFlow = ['Source signal', 'Freshness', 'Service match', 'Intent score', 'Contactability', 'Priority'];

export default function HuntersPage() {
  return (
    <div>
      <h1>Hunters</h1>
      <p className="muted">Business discovery and explicit-intent opportunities</p>
      <section className="grid">
        <div className="panel">
          <h2>Business Hunter</h2>
          <ol>{businessFlow.map((step) => <li key={step}>{step}</li>)}</ol>
          <p className="muted">Google Places is discovery. Long-lived evidence should come from official business-owned sources where possible.</p>
        </div>
        <div className="panel">
          <h2>Intent Hunter</h2>
          <ol>{intentFlow.map((step) => <li key={step}>{step}</li>)}</ol>
          <p className="muted">Country is optional. Fresh, explicit requests outrank cold prospects.</p>
        </div>
      </section>
      <section className="panel">
        <h2>Priority order</h2>
        <ol>
          <li>Inbound</li>
          <li>Fresh explicit freelancer/service request</li>
          <li>Previously interested lead</li>
          <li>High-score Business Hunter lead</li>
          <li>Normal cold prospect</li>
        </ol>
      </section>
    </div>
  );
}

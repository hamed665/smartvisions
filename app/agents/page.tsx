const agents = [
  ['Intent Discovery', 'Detects explicit need, freshness and commercial signals.'],
  ['Conversation Psychology', 'Reads hesitation, urgency and objections without sensitive-trait inference.'],
  ['Business Analyst', 'Matches verified business needs to the right service.'],
  ['Culture & Locale', 'Chooses language, dialect and business tone.'],
  ['Sales & Marketing', 'Recommends the next commercial action without inventing claims.'],
  ['Evidence Checker', 'Blocks unverified prices, facts, features and promises.'],
  ['Preview Director', 'Chooses whether a premium preview should exist and which vertical template fits.'],
  ['Decision Orchestrator', 'Combines specialist outputs into one constrained decision.'],
  ['Secretary', 'The only customer-facing composer.'],
  ['Relevance Checker', 'Confirms the actual question was answered.'],
] as const;

export default function AgentsPage() {
  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>AI Agents</h1>
          <p className="muted">Router-based orchestration, traceable decisions and hard human-takeover controls.</p>
        </div>
        <span className="status">Secretary-only customer output</span>
      </div>
      <div className="twoCol">
        {agents.map(([name, description]) => <section className="panel" key={name}><h2>{name}</h2><p className="muted">{description}</p></section>)}
      </div>
    </div>
  );
}

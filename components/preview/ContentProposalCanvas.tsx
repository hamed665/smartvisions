type Proposal = {
  kind?: string;
  angle?: string;
  filmingBrief?: string;
  shotList?: string[];
  reelConcepts?: string[];
  photographyPlan?: string[];
  visualConcepts?: string[];
  spokespersonOptions?: string[];
  captionDirections?: string[];
  packageServices?: string[];
};

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <section><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

export function ContentProposalCanvas({ proposal, businessName }: { proposal: Proposal; businessName?: string }) {
  return (
    <article style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', lineHeight: 1.6 }}>
      <p style={{ opacity: 0.65, marginBottom: 8 }}>{businessName ?? 'Smart Visions'} · Content Proposal</p>
      <h1 style={{ marginTop: 0 }}>{proposal.angle ?? 'Content growth concept'}</h1>
      {proposal.filmingBrief ? <p>{proposal.filmingBrief}</p> : null}
      <List title="Shot list" items={proposal.shotList}/>
      <List title="Reel concepts" items={proposal.reelConcepts}/>
      <List title="Photography plan" items={proposal.photographyPlan}/>
      <List title="Visual concepts" items={proposal.visualConcepts}/>
      <List title="Spokesperson / voiceover options" items={proposal.spokespersonOptions}/>
      <List title="Caption directions" items={proposal.captionDirections}/>
      <List title="Recommended package" items={proposal.packageServices}/>
      <p style={{ marginTop: 32, opacity: 0.6, fontSize: 14 }}>Proposal-level concept only. Heavy media generation remains subject to approval and value gates.</p>
    </article>
  );
}

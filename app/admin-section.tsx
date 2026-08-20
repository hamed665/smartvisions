type AdminSectionProps = {
  title: string;
  description: string;
  cards: Array<{ title: string; value: string; note: string }>;
};

export function AdminSection({ title, description, cards }: AdminSectionProps) {
  return (
    <section>
      <div className="headerRow">
        <div>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
        <span className="status">Live workspace</span>
      </div>
      <div className="grid">
        {cards.map((card) => (
          <div className="card" key={card.title}>
            <div className="muted">{card.title}</div>
            <div className="value">{card.value}</div>
            <p className="muted">{card.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

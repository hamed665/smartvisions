export default function PublicPreviewNotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f5f3',
        padding: '32px 16px',
        color: '#171717',
      }}
    >
      <section style={{ maxWidth: 520, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>
          404
        </p>
        <h1 style={{ margin: '12px 0 8px', fontSize: 32, lineHeight: 1.15 }}>Preview not found</h1>
        <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.7 }}>
          This preview is unavailable or has expired.
        </p>
      </section>
    </main>
  );
}

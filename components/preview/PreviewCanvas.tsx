import type { PreviewDocument } from '@/lib/preview/types';
import styles from './PreviewCanvas.module.css';

export function PreviewCanvas({ preview }: { preview: PreviewDocument }) {
  const serviceSection = preview.sections.find((section) => section.kind === 'services');
  const proofSection = preview.sections.find((section) => section.kind === 'proof');

  return (
    <article className={`${styles.canvas} ${preview.direction === 'rtl' ? styles.rtl : ''}`} dir={preview.direction}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>{preview.businessName} · Concept Preview</div>
        <h2 className={styles.headline}>{preview.headline}</h2>
        <p className={styles.sub}>{preview.subheadline}</p>
        <div className={styles.actions}>
          <span className={styles.primary}>{preview.primaryCta}</span>
          {preview.secondaryCta ? <span className={styles.secondary}>{preview.secondaryCta}</span> : null}
        </div>
      </section>

      {serviceSection ? (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>{serviceSection.heading}</div>
          <div className={styles.cards}>
            {(serviceSection.items ?? []).slice(0, 6).map((item) => <div className={styles.service} key={item}>{item}</div>)}
          </div>
        </section>
      ) : null}

      {proofSection ? (
        <section className={styles.section}>
          <div className={styles.proof}>
            <h3>{proofSection.heading}</h3>
            <p>{proofSection.body}</p>
          </div>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <span>{preview.templateId}</span>
        <span>{preview.disclaimer}</span>
      </footer>
    </article>
  );
}

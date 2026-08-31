'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Manrope, Noto_Sans_Arabic } from 'next/font/google';
import type { PreviewDocument, PreviewLocale, PreviewSection } from '@/lib/preview/types';
import styles from './PreviewCanvas.module.css';

const latinFont = Manrope({ subsets: ['latin'], display: 'swap', variable: '--preview-latin-font' });
const arabicFont = Noto_Sans_Arabic({ subsets: ['arabic'], display: 'swap', variable: '--preview-arabic-font' });

type ThemeStyle = CSSProperties & Record<`--preview-${string}`, string>;

function whatsappHref(value?: string) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

function renderSection(section: PreviewSection, preview: PreviewDocument) {
  const imageUrls = preview.assets.imageUrls;

  if (section.kind === 'proof') {
    return (
      <section className={`${styles.section} ${styles.proofSection}`} key={section.kind}>
        <p className={styles.kicker}>01 · Proof</p>
        <div className={styles.proofGrid}>
          <h3>{section.heading}</h3>
          <p>{section.body}</p>
        </div>
      </section>
    );
  }

  if (section.kind === 'services' || section.kind === 'offer') {
    return (
      <section className={styles.section} key={section.kind}>
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>{section.kind === 'offer' ? 'Highlights' : 'Services'}</p>
          <h3>{section.heading}</h3>
        </div>
        <div className={styles.cards}>
          {(section.items ?? []).slice(0, 6).map((item, index) => (
            <div className={styles.service} key={`${item}-${index}`}>
              <span className={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
              <span className={styles.cardArrow}>↗</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.kind === 'gallery') {
    return (
      <section className={styles.section} key={section.kind}>
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Visual direction</p>
          <h3>{section.heading}</h3>
        </div>
        <div className={styles.gallery}>
          {[0, 1, 2].map((index) => imageUrls[index] ? (
            <div className={styles.galleryFrame} key={imageUrls[index]}>
              {/* Verified business image URL only. */}
              <img src={imageUrls[index]} alt={`${preview.businessName} visual ${index + 1}`} loading="lazy"/>
            </div>
          ) : (
            <div className={`${styles.galleryFrame} ${styles.safeVisual}`} key={`safe-${index}`} aria-hidden="true">
              <span>{preview.businessName.slice(0, 1).toUpperCase()}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.kind === 'booking') {
    return (
      <section className={`${styles.section} ${styles.booking}`} id="contact" key={section.kind}>
        <div>
          <p className={styles.kicker}>Next step</p>
          <h3>{section.heading}</h3>
          {section.body ? <p>{section.body}</p> : null}
        </div>
        <a className={styles.primary} href="#contact">{preview.primaryCta}</a>
      </section>
    );
  }

  if (section.kind === 'location') {
    return (
      <section className={`${styles.section} ${styles.location}`} key={section.kind}>
        <p className={styles.kicker}>Location</p>
        <h3>{section.heading}</h3>
        {section.body ? <p>{section.body}</p> : null}
      </section>
    );
  }

  return null;
}

export function PreviewCanvas({ preview }: { preview: PreviewDocument }) {
  const [locale, setLocale] = useState<PreviewLocale>(preview.primaryLocale);
  const copy = preview.localized[locale] ?? preview.localized[preview.primaryLocale];
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const whatsapp = whatsappHref(preview.secondaryCta ? undefined : undefined);
  const verifiedWhatsapp = useMemo(() => {
    const booking = preview.sections.find((section) => section.kind === 'booking');
    void booking;
    return null;
  }, [preview.sections]);
  void whatsapp;
  void verifiedWhatsapp;

  if (!copy) return null;

  const themeStyle: ThemeStyle = {
    '--preview-bg': preview.design.palette.background,
    '--preview-surface': preview.design.palette.surface,
    '--preview-text': preview.design.palette.text,
    '--preview-muted': preview.design.palette.muted,
    '--preview-accent': preview.design.palette.accent,
    '--preview-accent-text': preview.design.palette.accentText,
    '--preview-line': preview.design.palette.line,
    '--preview-radius': `${preview.design.radius}px`,
    '--preview-max': `${preview.design.maxWidth}px`,
    '--preview-hero-min': `${preview.design.heroMinHeight}px`,
  };
  const trustRating = preview.evidence.rating;
  const trustCount = preview.evidence.reviewCount;
  const hasVerifiedRating = typeof trustRating === 'number' && typeof trustCount === 'number' && trustCount > 0;
  const categoryLabel = preview.evidence.categoryLabel || preview.vertical.replaceAll('_', ' ');
  const heroImage = preview.assets.imageUrls[0];
  const remainingSections = copy.sections.filter((section) => section.kind !== 'hero');

  return (
    <article
      className={`${styles.canvas} ${latinFont.variable} ${arabicFont.variable} ${direction === 'rtl' ? styles.rtl : ''}`}
      data-theme={preview.design.theme}
      data-display={preview.design.typography.display}
      data-hero-layout={preview.design.heroLayout}
      dir={direction}
      style={themeStyle}
    >
      <div className={styles.topbar}>
        <div className={styles.brandLockup}>
          {preview.assets.logoUrl ? <img src={preview.assets.logoUrl} alt={`${preview.businessName} logo`} className={styles.logo}/> : <span className={styles.monogram}>{preview.businessName.slice(0, 1).toUpperCase()}</span>}
          <strong>{preview.businessName}</strong>
        </div>
        {preview.availableLocales.length > 1 ? (
          <div className={styles.languageSwitch} aria-label="Website language preview">
            {preview.availableLocales.map((item) => (
              <button type="button" key={item} onClick={() => setLocale(item)} data-active={item === locale}>
                {item === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>{categoryLabel} · Concept preview</div>
          <h2 className={styles.headline}>{copy.headline}</h2>
          <p className={styles.sub}>{copy.subheadline}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#contact">{copy.primaryCta}</a>
            {copy.secondaryCta ? <span className={styles.secondary}>{copy.secondaryCta}</span> : null}
          </div>
          <div className={styles.trustRow}>
            {hasVerifiedRating ? <span><strong>{trustRating!.toFixed(1)} ★</strong> · {Math.round(trustCount!)} Google reviews</span> : <span>Mobile-first · Clear actions · Fast to scan</span>}
            {preview.evidence.address ? <span>{preview.evidence.address}</span> : null}
          </div>
        </div>
        <div className={styles.heroVisual}>
          {heroImage ? (
            <img src={heroImage} alt={`${preview.businessName} verified business visual`} loading="eager"/>
          ) : (
            <div className={styles.visualPlaceholder} aria-hidden="true">
              <span className={styles.visualLabel}>{categoryLabel}</span>
              <span className={styles.visualMark}>{preview.businessName.slice(0, 2).toUpperCase()}</span>
              <span className={styles.visualLine}/>
            </div>
          )}
        </div>
      </section>

      {remainingSections.map((section) => renderSection(section, preview))}

      <footer className={styles.footer}>
        <strong>{preview.businessName}</strong>
        <span>{copy.disclaimer}</span>
      </footer>

      {preview.design.mobileCta === 'sticky' ? (
        <div className={styles.mobileAction}>
          <a href="#contact">{copy.primaryCta}</a>
        </div>
      ) : null}
    </article>
  );
}

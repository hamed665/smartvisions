import Link from 'next/link';
import { localeNames, locales, type Locale } from '@/lib/i18n';

export function SiteHeader({ locale, nav }: { locale: Locale; nav: Record<string, string> }) {
  return (
    <header className="siteHeader">
      <Link className="brand" href={`/${locale}`} aria-label="Smart Visions home">
        <span className="brandMark" aria-hidden="true">SV</span>
        <span>SMART VISIONS</span>
      </Link>
      <nav className="mainNav" aria-label="Primary navigation">
        <a href="#work">{nav.work}</a><a href="#capabilities">{nav.services}</a><a href="#industries">{nav.industries}</a><a href="#insights">{nav.insights}</a><a href="#company">{nav.company}</a>
      </nav>
      <details className="localeMenu">
        <summary>{locale.toUpperCase()}</summary>
        <div className="localePanel">
          {locales.map((item) => <Link key={item} href={`/${item}`} lang={item} aria-current={item === locale ? 'page' : undefined}>{localeNames[item]}</Link>)}
        </div>
      </details>
    </header>
  );
}

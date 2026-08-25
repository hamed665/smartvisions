import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { copy, isLocale, localeDirection, locales, type Locale } from '@/lib/i18n';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  return {
    title: content.headline,
    description: content.subhead,
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: Object.fromEntries(locales.map((item) => [item, `${siteUrl}/${item}`])),
    },
    openGraph: { title: content.headline, description: content.subhead, url: `${siteUrl}/${locale}`, siteName: 'Smart Visions', type: 'website' },
  };
}

const capabilities = [
  ['01', 'AI & Automation', 'Agents, intelligent workflows and customer systems designed around measurable commercial outcomes.'],
  ['02', 'Digital Products', 'High-performance websites, platforms and experiences built to earn attention and convert it.'],
  ['03', 'Search & GEO', 'Technical SEO, local discovery and AI-search architecture built for how people find businesses now.'],
  ['04', 'Growth Systems', 'Acquisition, content, CRM and conversion infrastructure engineered as a connected system.'],
];

const sectors = ['Healthcare', 'Hospitality', 'Real Estate', 'Retail & Commerce', 'Professional Services', 'Technology'];

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const content = copy[locale];
  const whatsappNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const whatsappMessage = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE || 'Hello Smart Visions, I would like to discuss a project.';
  const whatsappHref = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : '#contact';

  return (
    <main dir={localeDirection(locale)}>
      <section className="heroShell">
        <SiteHeader locale={locale} nav={content.nav} />
        <div className="heroGlow" aria-hidden="true" />
        <div className="heroContent">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.headline}</h1>
          <p className="heroLead">{content.subhead}</p>
          <div className="heroActions">
            <a className="button buttonPrimary" href="#capabilities">{content.primaryCta}<span aria-hidden="true">↗</span></a>
            <a className="button buttonGhost" href="#contact">{content.secondaryCta}</a>
          </div>
        </div>
        <div className="heroMeta" aria-label="Company focus">
          <span>Strategy</span><span>Technology</span><span>Creative</span><span>Growth</span>
        </div>
      </section>

      <section className="statement" id="company">
        <p className="sectionKicker">SMART VISIONS / GLOBAL</p>
        <p className="statementText">We combine strategic thinking, product craft and intelligent automation to build digital systems that move businesses forward.</p>
      </section>

      <section className="section" id="capabilities">
        <div className="sectionHeading"><p className="sectionKicker">CAPABILITIES</p><div><h2>{content.capabilitiesTitle}</h2><p>{content.capabilitiesIntro}</p></div></div>
        <div className="capabilityGrid">
          {capabilities.map(([index, title, description]) => <article className="capabilityCard" key={index}><span>{index}</span><h3>{title}</h3><p>{description}</p><a href="#contact" aria-label={`${title} details`}>Explore <b>↗</b></a></article>)}
        </div>
      </section>

      <section className="darkSection" id="work">
        <div className="darkIntro"><p className="sectionKicker">SELECTED WORK / COMING IN PR6</p><h2>Complex problems deserve clear systems.</h2></div>
        <div className="workFeature"><div className="workVisual"><span className="visualOrb" /></div><div className="workCopy"><p>AI · DIGITAL TRANSFORMATION</p><h3>Building the infrastructure behind modern growth.</h3><p>Case studies will connect strategy, implementation, evidence and measurable outcomes, not decorative screenshots pretending to be results.</p><a href="#contact">Discuss a project ↗</a></div></div>
      </section>

      <section className="section" id="industries">
        <div className="sectionHeading compact"><p className="sectionKicker">INDUSTRIES</p><h2>Sector intelligence without the template-agency theatre.</h2></div>
        <div className="sectorList">{sectors.map((sector, index) => <div key={sector}><span>0{index + 1}</span><strong>{sector}</strong><b>↗</b></div>)}</div>
      </section>

      <section className="marketSection">
        <p className="sectionKicker">GLOBAL MARKETS</p><h2>{content.marketTitle}</h2>
        <div className="marketTicker" aria-label="Target markets"><span>OMAN</span><span>UAE</span><span>SAUDI ARABIA</span><span>QATAR</span><span>UK</span><span>FRANCE</span><span>SPAIN</span><span>USA</span></div>
      </section>

      <section className="section" id="insights">
        <div className="sectionHeading compact"><p className="sectionKicker">INTELLIGENCE</p><h2>{content.insightTitle}</h2></div>
        <div className="insightGrid">
          <article><small>AI / STRATEGY</small><h3>From automation experiments to operating advantage.</h3><p>How businesses can choose AI investments that change economics rather than merely add software.</p><span>8 min read</span></article>
          <article><small>SEARCH / GEO</small><h3>Being understood by search engines is no longer enough.</h3><p>Designing information architecture for search, answer engines and AI discovery.</p><span>6 min read</span></article>
          <article><small>GROWTH / SYSTEMS</small><h3>The conversion layer most company websites forgot to build.</h3><p>Why traffic without routing, qualification and follow-up is expensive decoration.</p><span>7 min read</span></article>
        </div>
      </section>

      <section className="contactSection" id="contact">
        <p className="sectionKicker">START A CONVERSATION</p><h2>{content.contactTitle}</h2><p>{content.contactText}</p>
        <div className="heroActions"><a className="button buttonLight" href={whatsappHref} target={whatsappNumber ? '_blank' : undefined} rel={whatsappNumber ? 'noreferrer' : undefined}>WhatsApp <span>↗</span></a><a className="button buttonLine" href="mailto:hello@smartvisions.example">Email our team</a></div>
      </section>

      <footer className="footer"><div className="brand footerBrand"><span className="brandMark">SV</span><span>SMART VISIONS</span></div><p>AI · DIGITAL · GROWTH · TECHNOLOGY</p><p>© {new Date().getFullYear()} Smart Visions</p></footer>

      <a className="whatsappFloat" href={whatsappHref} target={whatsappNumber ? '_blank' : undefined} rel={whatsappNumber ? 'noreferrer' : undefined} aria-label="Contact Smart Visions on WhatsApp"><span>WA</span><b>WhatsApp</b></a>
    </main>
  );
}

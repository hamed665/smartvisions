import Link from 'next/link';
import type { ReactNode } from 'react';

export function studioHref(path: string, businessId: string, fields: Record<string, string | null | undefined> = {}) {
  const params = new URLSearchParams({ businessId });
  for (const [key, value] of Object.entries(fields)) if (value) params.set(key, value);
  return path+'?'+params.toString();
}

export function StudioHeading({ section, title, description, action }: {
  section: string; title: string; description: string; action?: ReactNode;
}) {
  return <header className="studio-heading">
    <div><span className="studio-kicker"><i />{section}</span><h1>{title}</h1><p>{description}</p></div>
    {action}
  </header>;
}

export function StudioEmpty({ title, description, href, action }: {
  title: string; description: string; href?: string; action?: string;
}) {
  return <div className="studio-empty"><span aria-hidden="true">✳</span><h2>{title}</h2><p>{description}</p>
    {href && action && <Link className="studio-button studio-secondary" href={href}>{action}</Link>}
  </div>;
}

export function StudioBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'attention' }) {
  return <span className="studio-badge" data-tone={tone}><i />{children}</span>;
}

export function studioDate(value: string | null, timezone: string) {
  return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) : '—';
}

export function studioLabel(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  ['Dashboard', '/'],
  ['Hunters', '/hunters'],
  ['Leads', '/leads'],
  ['Intent Leads', '/intent-leads'],
  ['Campaigns', '/campaigns'],
  ['Conversations', '/conversations'],
  ['Hot Leads', '/hot-leads'],
  ['Services', '/services'],
  ['Pricing', '/pricing'],
  ['Portfolio', '/portfolio'],
  ['Preview Studio', '/preview-studio'],
  ['Markets', '/markets'],
  ['AI Agents', '/agents'],
  ['Outreach', '/outreach'],
  ['Reports', '/reports'],
  ['System', '/system'],
] as const;

const publicPrefixes = ['/login', '/auth'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isPublic) return <>{children}</>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Smart Visions</div>
        <div className="badge">Growth OS</div>
        <nav>
          {nav.map(([item, href]) => {
            const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
            return <Link className={active ? 'active' : undefined} href={href} key={item}>{item}</Link>;
          })}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

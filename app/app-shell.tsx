'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const nav = [
  ['Dashboard', '/'],
  ['Hunters', '/hunters'],
  ['Leads', '#'],
  ['Intent Leads', '#'],
  ['Campaigns', '#'],
  ['Conversations', '#'],
  ['Hot Leads', '#'],
  ['Services', '#'],
  ['Pricing', '#'],
  ['Portfolio', '#'],
  ['Preview Studio', '/preview-studio'],
  ['Markets', '#'],
  ['AI Agents', '/agents'],
  ['Outreach', '/outreach'],
  ['Reports', '/reports'],
  ['System', '#'],
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
        <nav>{nav.map(([item, href]) => <a href={href} key={item}>{item}</a>)}</nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

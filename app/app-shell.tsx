'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isPublicShellPath } from '@/lib/public-paths';

const groups = [
  ['Sales', [['Dashboard', '/'], ['Hunters', '/hunters'], ['Leads', '/leads'], ['Intent Leads', '/intent-leads'], ['Campaigns', '/campaigns'], ['Conversations', '/conversations'], ['Hot Leads', '/hot-leads']]],
  ['Growth', [['Outreach', '/outreach'], ['Message Studio', '/messages'], ['Automations', '/automations'], ['Approvals', '/approvals'], ['Portfolio', '/portfolio'], ['Preview Studio', '/preview-studio']]],
  ['Control', [['Services', '/services'], ['Pricing', '/pricing'], ['Markets', '/markets'], ['AI Agents', '/agents'], ['Knowledge Base', '/knowledge'], ['Integrations', '/integrations'], ['Suppression / DNC', '/suppression']]],
  ['Operations', [['Reports', '/reports'], ['Cost & Usage', '/cost-usage'], ['Audit Log', '/audit'], ['System', '/system'], ['Settings', '/settings']]],
] as const;

const mobilePrimary = [
  ['Home', '/', '⌂'],
  ['Inbox', '/conversations', '◫'],
  ['Leads', '/leads', '◎'],
  ['Approvals', '/approvals', '✓'],
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pageTitle = useMemo(() => {
    for (const [, items] of groups) {
      const current = items.find(([, href]) => isActive(pathname, href));
      if (current) return current[0];
    }
    return 'Smart Visions';
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previous = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  if (isPublicShellPath(pathname)) return <>{children}</>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Smart Visions</div>
        <div className="badge">Growth OS</div>
        <nav>
          {groups.map(([group, items]) => (
            <div className="navGroup" key={group}>
              <span className="navLabel">{group}</span>
              {items.map(([item, href]) => (
                <Link className={isActive(pathname, href) ? 'active' : undefined} href={href} key={item}>
                  {item}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <header className="mobileAppBar">
        <div className="mobileBrandBlock">
          <span className="mobileBrandMark">SV</span>
          <div>
            <strong>{pageTitle}</strong>
            <span>Growth OS</span>
          </div>
        </div>
        <button
          type="button"
          className="mobileMenuButton"
          aria-label="Open navigation"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-sheet"
          onClick={() => setMobileMenuOpen(true)}
        >
          ☰
        </button>
      </header>

      <main className="content">{children}</main>

      <nav className="mobileBottomNav" aria-label="Primary mobile navigation">
        {mobilePrimary.map(([label, href, icon]) => (
          <Link
            className={isActive(pathname, href) ? 'active' : undefined}
            href={href}
            key={href}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mobileNavIcon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={mobileMenuOpen ? 'active' : undefined}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More navigation"
        >
          <span className="mobileNavIcon" aria-hidden="true">☰</span>
          <span>More</span>
        </button>
      </nav>

      {mobileMenuOpen ? (
        <div className="mobileNavOverlay" role="presentation" onMouseDown={() => setMobileMenuOpen(false)}>
          <section
            id="mobile-navigation-sheet"
            className="mobileNavSheet"
            role="dialog"
            aria-modal="true"
            aria-label="Smart Visions navigation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobileSheetHandle" />
            <div className="mobileSheetHeader">
              <div>
                <strong>Smart Visions</strong>
                <span>Control Center</span>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation">×</button>
            </div>
            <div className="mobileSheetScroll">
              {groups.map(([group, items]) => (
                <div className="mobileNavGroup" key={group}>
                  <span className="navLabel">{group}</span>
                  <div className="mobileNavGrid">
                    {items.map(([item, href]) => (
                      <Link
                        className={isActive(pathname, href) ? 'active' : undefined}
                        href={href}
                        key={item}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

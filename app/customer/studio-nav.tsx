'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { CustomerBusinessAccess } from '@/lib/access/customer-business-scope';

const navigation = [
  { label: 'Today', href: '/customer', icon: 'M3 12h6l3-7 4 14 2-7h3' },
  { label: 'Inbox', href: '/customer/inbox', icon: 'M3 13h5l2 3h4l2-3h5M4 4h16v16H4z' },
  { label: 'CRM', href: '/customer/crm', icon: 'M4 19v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2m3-5a3 3 0 0 1 3 3v2M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3-3a3 3 0 0 1 0 6' },
  { label: 'Assistant', href: '/customer/ai', icon: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z' },
  { label: 'Connect', href: '/customer/connections', icon: 'M10 13a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2m2 4a3 3 0 0 0-4 0l-4 4a3 3 0 0 0 4 4l2-2' },
];

export function StudioNav({ businesses }: { businesses: Pick<CustomerBusinessAccess, 'id' | 'name'>[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('businessId');
  const selected = businesses.find(business => business.id === requested) ?? businesses[0];
  const suffix = selected ? '?businessId='+encodeURIComponent(selected.id) : '';

  return (
    <aside className="studio-nav">
      <Link className="studio-brand" href={'/customer'+suffix}>
        <span className="studio-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4m-16 4 8 4 8-4"/></svg></span>
        <span><strong>Smart Visions</strong><small>WHATSAPP STUDIO</small></span>
      </Link>
      {selected && <details className="studio-switch"><summary>{selected.name}</summary><ul>{businesses.map(business =>
        <li key={business.id}><Link href={'/customer?businessId='+encodeURIComponent(business.id)}
          aria-current={business.id === selected.id ? 'true' : undefined}>{business.name}</Link></li>)}</ul></details>}
      <nav aria-label="WhatsApp Studio" className="studio-nav-links">
        {navigation.map(({ label, href, icon }) => <Link href={href+suffix} key={href}
          aria-current={pathname === href ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d={icon}/></svg><span>{label}</span>
        </Link>)}
      </nav>
      <Link className="studio-settings" href={'/customer/more'+suffix}>Workspace settings</Link>
    </aside>
  );
}

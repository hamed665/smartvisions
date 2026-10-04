import Link from 'next/link';

import { loadCustomerConnections } from '@/lib/access/customer-connections';

export const dynamic = 'force-dynamic';

export default async function CustomerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const params = await searchParams;
  const context = await loadCustomerConnections({
    requestedBusinessId: params.businessId,
  });
  const business = context.selectedBusiness;
  if (!business) return null;

  return (
    <div>
      <div className="headerRow">
        <div>
          <p className="eyebrow">SMART VISIONS BUSINESS OS</p>
          <h1>{business.name}</h1>
          <p className="muted">
            {business.countryCode ?? 'Business'} · {business.businessRole} access
          </p>
        </div>
        <span className="status">{context.whatsapp.status}</span>
      </div>

      {context.businesses.length > 1 ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <strong>Business workspace</strong>
          <div className="quickActions" style={{ marginTop: 10 }}>
            {context.businesses.map((row) => (
              <Link
                href={`/customer?businessId=${encodeURIComponent(row.id)}`}
                key={row.id}
              >
                {row.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid">
        <div className="card">
          <div className="muted">Workspace role</div>
          <div className="value" style={{ fontSize: 24 }}>{business.businessRole}</div>
        </div>
        <div className="card">
          <div className="muted">WhatsApp</div>
          <div className="value" style={{ fontSize: 22 }}>{context.whatsapp.status}</div>
        </div>
      </section>

      <section className="twoCol">
        <div className="panel">
          <h2>Getting started</h2>
          <div className="healthList">
            <span>Account access <strong>Ready</strong></span>
            <span>Business scope <strong>{business.name}</strong></span>
            <span>WhatsApp <strong>{context.whatsapp.status}</strong></span>
          </div>
          <Link
            className="textLink"
            href={`/customer/connections?businessId=${encodeURIComponent(business.id)}`}
          >
            Open Connections →
          </Link>
        </div>

        <div className="panel">
          <h2>Your workspace</h2>
          <p className="muted">
            This customer surface is Business-scoped. Founder, Super Admin, billing administration, system controls and operator tools are not exposed here.
          </p>
          <div className="quickActions">
            <Link href="/customer/inbox">Inbox</Link>
            <Link href="/customer/crm">CRM</Link>
            <Link href="/customer/ai">AI</Link>
            <Link href="/customer/more">More</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

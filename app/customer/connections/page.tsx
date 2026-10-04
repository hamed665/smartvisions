import Link from 'next/link';

import {
  type CustomerConnectionStatus,
  loadCustomerConnections,
} from '@/lib/access/customer-connections';

export const dynamic = 'force-dynamic';

function statusClass(status: CustomerConnectionStatus) {
  return status === 'Connected' ? 'status' : 'status dangerStatus';
}

export default async function CustomerConnectionsPage({
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
  const whatsapp = context.whatsapp;

  return (
    <div>
      <div className="headerRow">
        <div>
          <p className="eyebrow">BUSINESS CONNECTIONS</p>
          <h1>Connections</h1>
          <p className="muted">{business.name} · only this Business scope is shown.</p>
        </div>
        <Link className="textLink" href={`/customer?businessId=${encodeURIComponent(business.id)}`}>
          Back to Home
        </Link>
      </div>

      {context.businesses.length > 1 ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <strong>Switch Business</strong>
          <div className="quickActions" style={{ marginTop: 10 }}>
            {context.businesses.map((row) => (
              <Link
                href={`/customer/connections?businessId=${encodeURIComponent(row.id)}`}
                key={row.id}
              >
                {row.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel settingsCreate" id="whatsapp">
        <div className="headerRow">
          <div>
            <h2>WhatsApp Business</h2>
            <p className="muted">
              Meta-hosted authorization only. Smart Visions never asks for your Facebook password, and this workflow never instructs you to delete the WhatsApp Business app from your phone.
            </p>
          </div>
          <span className={statusClass(whatsapp.status)}>{whatsapp.status}</span>
        </div>

        <div className="healthList">
          <span>Business <strong>{business.name}</strong></span>
          <span>Number <strong>{whatsapp.destinationLabel ?? 'Not selected'}</strong></span>
          <span>Last verified <strong>{whatsapp.lastVerifiedAt ? new Date(whatsapp.lastVerifiedAt).toLocaleString() : 'No recent evidence'}</strong></span>
          <span>Provider check <strong>{whatsapp.lastCheckedAt ? new Date(whatsapp.lastCheckedAt).toLocaleString() : 'Not checked'}</strong></span>
          <span>Incident <strong>{whatsapp.incidentCode ?? 'None recorded'}</strong></span>
        </div>

        <p className="muted">{whatsapp.reason}</p>

        {context.whatsappBindings.length > 1 ? (
          <div className="settingsList">
            {context.whatsappBindings.map((row) => (
              <div className="settingsRow" key={row.bindingId ?? row.destinationLabel ?? row.status}>
                <div>
                  <strong>{row.destinationLabel ?? 'WhatsApp binding'}</strong>
                  <span className="muted smallText">{row.status}</span>
                </div>
                <div>
                  <span className="muted smallText">Last verified: {row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString() : 'No recent evidence'}</span>
                  {row.incidentCode ? <span className="muted smallText">Incident: {row.incidentCode}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="quickActions">
          {whatsapp.canConnect ? <span aria-disabled="true">Connect WhatsApp</span> : null}
          {whatsapp.canReconnect ? <span aria-disabled="true">Reconnect WhatsApp</span> : null}
          {whatsapp.canDisconnect ? <span aria-disabled="true">Disconnect safely</span> : null}
        </div>
        <p className="muted smallText">
          Customer self-service actions are intentionally not executed from this read-only PR. The next guarded WhatsApp workflow will reuse this same canonical binding and connection state.
        </p>
      </section>
    </div>
  );
}

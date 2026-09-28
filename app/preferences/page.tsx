import { randomUUID } from 'node:crypto';
import { recordMarketingPreference } from '@/app/marketing-consent-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type PreferenceRow = {
  event_id: string;
  lead_id: string;
  permission_channel: string;
  permission_purpose: string;
  permission_recipient: string;
  permission_action: string;
  allowed: boolean;
  legal_basis: string;
  source_type: string;
  source_reference: string;
  occurred_at: string;
  verified_at: string;
  preference_center_managed: boolean;
  recorded_by_user_id: string | null;
};

export default async function PreferencesPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const canManage = ['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role);

  const [preferencesResult, leadsResult] = await Promise.all([
    supabase.rpc('get_marketing_preferences', {
      p_organization_id: organizationId,
      p_lead_id: null,
      p_limit: 200,
    }),
    supabase
      .from('leads')
      .select('id,business_id,status,businesses!inner(name,email,phone,whatsapp)')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(200),
  ]);

  const preferences = (preferencesResult.error ? [] : preferencesResult.data ?? []) as PreferenceRow[];
  const leads = leadsResult.data ?? [];

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Marketing Preferences</h1>
          <p className="muted">
            Canonical opt-in / opt-out evidence by Lead, channel and purpose. Suppression / DNC remains a separate
            mandatory block at the send gate.
          </p>
        </div>
        <span className="status">{preferences.length} effective preferences</span>
      </div>

      {preferencesResult.error ? (
        <section className="panel">
          <p className="muted">Marketing consent governance is not available on this database revision yet.</p>
        </section>
      ) : null}

      {canManage ? (
        <section className="panel settingsCreate">
          <h2>Record permission evidence</h2>
          <p className="muted">
            This records append-only evidence. It never sends a message, never removes DNC suppression and never treats
            Segment membership or Campaign approval as consent.
          </p>
          <form action={recordMarketingPreference} className="settingsGrid">
            <input type="hidden" name="request_key" value={`preference-${randomUUID()}`} />
            <label className="wideField">
              Lead
              <select name="lead_id" required>
                {leads.map((lead) => {
                  const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
                  return (
                    <option value={lead.id} key={lead.id}>
                      {business?.name ?? lead.id} · {lead.status}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Channel
              <select name="channel" defaultValue="EMAIL">
                <option>EMAIL</option>
                <option>WHATSAPP</option>
                <option>INSTAGRAM</option>
                <option>FACEBOOK_MESSENGER</option>
                <option>TELEGRAM</option>
              </select>
            </label>
            <label>
              Action
              <select name="action" defaultValue="GRANT">
                <option>GRANT</option>
                <option>REVOKE</option>
              </select>
            </label>
            <label className="wideField">
              Exact recipient
              <input name="recipient" placeholder="customer@example.com or +968..." required />
            </label>
            <label>
              Source
              <select name="source_type" defaultValue="OPERATOR">
                <option>OPERATOR</option>
                <option>WEBSITE_FORM</option>
                <option>CUSTOMER_MESSAGE</option>
                <option>CLICK_TO_MESSAGE</option>
                <option>SIGNED_PERMISSION</option>
                <option>VERBAL_PERMISSION</option>
                <option>PROVIDER_EVENT</option>
                <option>PREFERENCE_CENTER</option>
              </select>
            </label>
            <label>
              Legal / business basis
              <select name="legal_basis" defaultValue="EXPLICIT_CONSENT">
                <option>EXPLICIT_CONSENT</option>
                <option>EXISTING_CUSTOMER</option>
                <option>LEGITIMATE_INTEREST</option>
                <option>LEGAL_REQUIREMENT</option>
                <option>WITHDRAWAL</option>
                <option>OTHER_DOCUMENTED_BASIS</option>
              </select>
            </label>
            <label className="wideField">
              Source reference
              <input name="source_reference" placeholder="form:abc123 / message:provider-id / document:..." required />
            </label>
            <label>
              Occurred at
              <input type="datetime-local" name="occurred_at" defaultValue={new Date().toISOString().slice(0, 16)} required />
            </label>
            <label className="toggleLabel">
              <input type="checkbox" name="preference_center_managed" /> Preference-center managed
            </label>
            <button type="submit">Record evidence</button>
          </form>
        </section>
      ) : null}

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Channel</th>
              <th>Recipient</th>
              <th>State</th>
              <th>Basis</th>
              <th>Source</th>
              <th>Occurred</th>
            </tr>
          </thead>
          <tbody>
            {preferences.map((row) => (
              <tr key={row.event_id}>
                <td>{row.lead_id}</td>
                <td>{row.permission_channel}</td>
                <td>{row.permission_recipient}</td>
                <td>{row.allowed ? 'OPTED IN' : 'OPTED OUT'}</td>
                <td>{row.legal_basis}</td>
                <td>{row.source_type}</td>
                <td>{new Date(row.occurred_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

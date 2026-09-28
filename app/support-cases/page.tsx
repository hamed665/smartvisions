import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  canMutateCrmSupport,
  listCrmSupportCases,
  listCrmSupportSlaPolicies,
} from '@/lib/crm/support-cases';
import { SupportCaseActions } from './support-case-actions';

export const dynamic = 'force-dynamic';

export default async function SupportCasesPage() {
  const { supabase, organizationId, role, userId } = await getCurrentOrganization();

  const [casePage, policies, businesses, people, conversations, members] = await Promise.all([
    listCrmSupportCases({ supabase, organizationId, includeClosed: true, limit: 100 }),
    listCrmSupportSlaPolicies({ supabase, organizationId, includeRetired: true }),
    supabase.from('businesses').select('id,name').eq('organization_id', organizationId).order('name'),
    supabase.from('crm_people').select('id,display_name,status').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('updated_at', { ascending: false }).limit(100),
    supabase.from('sales_conversations').select('id,channel,lead_id,person_id,updated_at').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(100),
    supabase.from('organization_members').select('user_id,role').eq('organization_id', organizationId).in('role', ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']).order('role'),
  ]);

  for (const [name, result] of [
    ['Businesses', businesses],
    ['People', people],
    ['Conversations', conversations],
    ['Members', members],
  ] as const) {
    if (result.error) throw new Error(`CRM Support ${name} lookup failed: ${result.error.message}`);
  }

  const canManage = canMutateCrmSupport(role);
  const canManageSla = ['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Support Cases</h1>
        <p className="muted">Smart Core owns Case state, SLA, assignment, escalation, resolution and CSAT. Conversations remain communication evidence, not a second ticket store.</p>
      </div>
      <span className="status">{casePage.items.length} cases</span>
    </div>

    <SupportCaseActions
      organizationId={organizationId}
      currentUserId={userId}
      currentRole={String(role)}
      canManage={canManage}
      canManageSla={canManageSla}
      cases={casePage.items}
      policies={policies}
      businesses={(businesses.data ?? []).map(row => ({ id: String(row.id), name: String(row.name) }))}
      people={(people.data ?? []).map(row => ({ id: String(row.id), name: String(row.display_name ?? row.id) }))}
      conversations={(conversations.data ?? []).map(row => ({ id: String(row.id), channel: String(row.channel) }))}
      members={(members.data ?? []).map(row => ({ userId: String(row.user_id), role: String(row.role) }))}
    />

    <section className="panel">
      <strong>Dependency boundary</strong>
      <p className="muted">Customer/Person, Account and Conversation links are live. Order and Payment links remain intentionally absent until their canonical modules exist; this page does not fabricate foreign keys to imaginary commerce records.</p>
    </section>
  </div>;
}

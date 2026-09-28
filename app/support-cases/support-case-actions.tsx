'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  CRM_SUPPORT_PRIORITIES,
  CRM_SUPPORT_STATUSES,
  type CrmSupportCaseRow,
  type CrmSupportSlaPolicy,
} from '@/lib/crm/support-cases';

type Business = { id: string; name: string };
type Person = { id: string; name: string };
type Conversation = { id: string; channel: string };
type Member = { userId: string; role: string };

export function SupportCaseActions(props: {
  organizationId: string;
  currentUserId: string;
  currentRole: string;
  canManage: boolean;
  canManageSla: boolean;
  cases: CrmSupportCaseRow[];
  policies: CrmSupportSlaPolicy[];
  businesses: Business[];
  people: Person[];
  conversations: Conversation[];
  members: Member[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/support-cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: props.organizationId, ...payload }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Support Case mutation failed');
      setMessage('Support state updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Support Case mutation failed');
    } finally {
      setWorking(false);
    }
  }

  return <div className="settingsList">
    <section className="panel">
      <h2>SLA policies</h2>
      <div className="healthList">
        {props.policies.length ? props.policies.map(policy => <span key={policy.id}>
          {policy.priority} · {policy.name}
          <strong>{policy.status} · first {policy.first_response_minutes}m · resolve {policy.resolution_minutes}m</strong>
        </span>) : <span>No SLA policies <strong>Cases may still be created without an SLA.</strong></span>}
      </div>

      {props.canManageSla ? <form className="settingsRow" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const policyId = crypto.randomUUID();
        void post({
          action: 'UPSERT_SLA',
          policyId,
          name: String(form.get('name') || ''),
          priority: String(form.get('priority') || 'NORMAL'),
          firstResponseMinutes: Number(form.get('firstResponseMinutes')),
          resolutionMinutes: Number(form.get('resolutionMinutes')),
          escalationMinutes: Number(form.get('escalationMinutes')) || null,
          status: 'ACTIVE',
          expectedVersion: 0,
          requestKey: `sla-create:${policyId}`,
        });
        event.currentTarget.reset();
      }}>
        <div><strong>Create active SLA</strong><span className="muted smallText">One active policy per priority. Existing policies remain versioned evidence.</span></div>
        <label>Name<input name="name" required maxLength={120} /></label>
        <label>Priority<select name="priority" defaultValue="NORMAL">
          {CRM_SUPPORT_PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>First response minutes<input name="firstResponseMinutes" type="number" min={1} max={43200} defaultValue={60} required /></label>
        <label>Resolution minutes<input name="resolutionMinutes" type="number" min={1} max={43200} defaultValue={480} required /></label>
        <label>Escalation minutes<input name="escalationMinutes" type="number" min={1} max={43200} defaultValue={240} /></label>
        <button disabled={working}>Create SLA</button>
      </form> : <p className="muted smallText">SLA policy governance requires OWNER, ADMIN or SALES_MANAGER.</p>}
    </section>

    <section className="panel">
      <h2>Create case</h2>
      {props.canManage ? <form className="settingsRow" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const caseId = crypto.randomUUID();
        void post({
          action: 'CREATE_CASE',
          caseId,
          businessId: String(form.get('businessId') || '') || null,
          personId: String(form.get('personId') || '') || null,
          conversationId: String(form.get('conversationId') || '') || null,
          subject: String(form.get('subject') || ''),
          description: String(form.get('description') || '') || null,
          priority: String(form.get('priority') || 'NORMAL'),
          assigneeUserId: String(form.get('assigneeUserId') || '') || null,
          slaPolicyId: null,
          sourceType: 'MANUAL',
          sourceRef: null,
          requestKey: `support-case:${caseId}`,
          metadata: {},
        });
        event.currentTarget.reset();
      }}>
        <div><strong>New Support Case</strong><span className="muted smallText">SLA auto-selects the active policy matching priority when one exists.</span></div>
        <label className="wideField">Subject<input name="subject" required maxLength={240} /></label>
        <label className="wideField">Description<textarea name="description" maxLength={8000} /></label>
        <label>Priority<select name="priority" defaultValue="NORMAL">
          {CRM_SUPPORT_PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Account<select name="businessId" defaultValue=""><option value="">None</option>{props.businesses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Person<select name="personId" defaultValue=""><option value="">None</option>{props.people.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Conversation<select name="conversationId" defaultValue=""><option value="">None</option>{props.conversations.map(row => <option key={row.id} value={row.id}>{row.channel} · {row.id}</option>)}</select></label>
        <label>Assignee<select name="assigneeUserId" defaultValue={props.currentUserId}><option value="">Unassigned</option>{props.members.map(row => <option key={row.userId} value={row.userId}>{row.role} · {row.userId}</option>)}</select></label>
        <button disabled={working}>Create Case</button>
      </form> : <p className="muted">Read-only access.</p>}
    </section>

    <section className="panel">
      <h2>Cases</h2>
      {props.cases.length === 0 ? <p className="muted">No Support Cases yet.</p> : null}
      <div className="settingsList">
        {props.cases.map(item => <article className="settingsRow" key={item.id}>
          <div>
            <strong>{item.subject}</strong>
            <span className="muted smallText">{item.priority} · {item.status} · escalation L{item.escalation_level}</span>
            <span className="muted smallText">Account: {item.business_name || '—'} · Person: {item.person_name || '—'} · Conversation: {item.conversation_channel || '—'}</span>
            <span className="muted smallText">SLA: {item.sla_policy_name || 'NO_POLICY'} · first response {item.first_response_breached ? 'BREACHED' : item.first_responded_at ? 'DONE' : 'pending'} · resolution {item.resolution_breached ? 'BREACHED' : item.resolved_at ? 'DONE' : 'pending'}</span>
            {item.csat_score ? <span className="muted smallText">CSAT {item.csat_score}/5</span> : null}
          </div>

          {props.canManage ? <div className="settingsList">
            <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void post({
                action: 'ASSIGN',
                caseId: item.id,
                expectedVersion: item.version,
                assigneeUserId: String(form.get('assigneeUserId') || '') || null,
                reason: String(form.get('reason') || ''),
              });
            }}>
              <label>Assign<select name="assigneeUserId" defaultValue={item.assignee_user_id || ''}><option value="">Unassigned</option>{props.members.map(row => <option key={row.userId} value={row.userId}>{row.role} · {row.userId}</option>)}</select></label>
              <label>Reason<input name="reason" required maxLength={500} /></label>
              <button disabled={working}>Assign</button>
            </form>

            {!item.first_responded_at && !['RESOLVED','CLOSED'].includes(item.status) ? <button disabled={working} onClick={() => void post({
              action: 'FIRST_RESPONSE', caseId: item.id, expectedVersion: item.version, reason: 'Operator confirmed first response',
            })}>Mark first response</button> : null}

            {!['RESOLVED','CLOSED'].includes(item.status) ? <button disabled={working} onClick={() => void post({
              action: 'ESCALATE', caseId: item.id, expectedVersion: item.version, reason: 'Operator escalation',
            })}>Escalate</button> : null}

            <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const status = String(form.get('status') || '');
              void post({
                action: 'TRANSITION',
                caseId: item.id,
                expectedVersion: item.version,
                status,
                reason: String(form.get('reason') || ''),
                resolutionSummary: String(form.get('resolutionSummary') || '') || null,
              });
            }}>
              <label>Status<select name="status" defaultValue={item.status}>
                {CRM_SUPPORT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <label>Reason<input name="reason" required maxLength={500} /></label>
              <label>Resolution summary<input name="resolutionSummary" maxLength={4000} /></label>
              <button disabled={working}>Transition</button>
            </form>

            {['RESOLVED','CLOSED'].includes(item.status) ? <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void post({
                action: 'CSAT',
                caseId: item.id,
                expectedVersion: item.version,
                score: Number(form.get('score')),
                comment: String(form.get('comment') || '') || null,
                sourceRef: String(form.get('sourceRef') || ''),
              });
            }}>
              <label>CSAT<select name="score" defaultValue="5">{[1,2,3,4,5].map(score => <option value={score} key={score}>{score}</option>)}</select></label>
              <label>Verified source<input name="sourceRef" required maxLength={512} /></label>
              <label>Comment<input name="comment" maxLength={2000} /></label>
              <button disabled={working}>Record CSAT</button>
            </form> : null}
          </div> : null}
        </article>)}
      </div>
    </section>

    {message ? <p role="status" className="muted">{message}</p> : null}
  </div>;
}

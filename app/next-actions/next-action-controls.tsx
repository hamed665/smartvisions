'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { CrmNextActionRow } from '@/lib/crm/next-actions';

type Member = { userId: string; role: string };

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function NextActionControls({
  organizationId,
  currentUserId,
  currentRole,
  canAccept,
  members,
  items,
  staleHours,
}: {
  organizationId: string;
  currentUserId: string;
  currentRole: string;
  canAccept: boolean;
  members: Member[];
  items: CrmNextActionRow[];
  staleHours: number;
}) {
  const router = useRouter();
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const assignableMembers = useMemo(
    () => currentRole === 'SALES_AGENT'
      ? members.filter((member) => member.userId === currentUserId)
      : members,
    [currentRole, currentUserId, members],
  );

  async function accept(item: CrmNextActionRow, assigneeUserId: string) {
    if (!['LEAD_STALE','DEAL_STALE','DEAL_CLOSE_OVERDUE'].includes(item.candidate_kind)) return;
    setWorkingKey(item.candidate_key);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/next-actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'ACCEPT',
          organizationId,
          candidateKind: item.candidate_kind,
          entityId: item.source_entity_id,
          assigneeUserId: assigneeUserId || null,
          dueAt: item.recommended_due_at,
          reminderAt: item.recommended_reminder_at,
          staleHours,
          requestKey: `next-action-ui:${crypto.randomUUID()}`,
        }),
      });
      const payload = await response.json() as { error?: string; taskId?: string; replayed?: boolean };
      if (!response.ok) throw new Error(payload.error || 'Next action acceptance failed');
      setMessage(payload.replayed ? 'Existing accepted Task reused.' : 'Candidate accepted into CRM Tasks.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Next action acceptance failed');
    } finally {
      setWorkingKey(null);
    }
  }

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Prioritized queue</h2>
        <p className="muted">Default stale policy: {staleHours} hours. Existing Tasks outrank derived stale candidates.</p>
      </div>
      <span className="status">{items.length} items</span>
    </div>

    <div className="settingsList">
      {items.length === 0 ? <p className="muted">No next actions currently require attention.</p> : items.map((item) => {
        const defaultAssignee = item.assignee_user_id || currentUserId;
        const model = item.model_suggestion;
        const modelAction = model && typeof model.action === 'string' ? model.action : null;
        const modelRationale = model && typeof model.rationale === 'string' ? model.rationale : null;
        const modelConfidence = model && typeof model.confidence === 'number'
          ? Math.round(model.confidence * 100)
          : null;

        return <div className="settingsRow" key={item.candidate_key}>
          <div>
            <strong>{item.title}</strong>
            <span className="muted smallText">{item.candidate_kind} · {item.priority} · score {item.priority_score}</span>
            <span className="muted smallText">Reason {item.reason_code} · source {item.source_status}</span>
            <span className="muted smallText">Last activity {formatDate(item.last_activity_at)}</span>
            <span className="muted smallText">Due {formatDate(item.recommended_due_at)} · reminder {formatDate(item.recommended_reminder_at)}</span>
            {item.lead_id ? <Link className="textLink smallText" href={`/leads/${item.lead_id}`}>Open Lead →</Link> : null}
            {item.task_id ? <Link className="textLink smallText" href="/tasks">Open canonical Task →</Link> : null}
            {modelAction ? <span className="muted smallText">
              AI advisory: {modelAction}{modelConfidence === null ? '' : ` · ${modelConfidence}% confidence`}
              {modelRationale ? ` · ${modelRationale}` : ''}
            </span> : null}
          </div>

          {item.accepted ? <div>
            <span className="status">TASK</span>
            {item.assignee_user_id ? <span className="muted smallText">Owner {item.assignee_user_id}</span> : null}
          </div> : canAccept ? <form onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void accept(item, String(data.get('assigneeUserId') || defaultAssignee));
          }}>
            <label>Owner
              <select name="assigneeUserId" defaultValue={defaultAssignee}>
                {assignableMembers.map((member) => <option key={member.userId} value={member.userId}>
                  {member.role} · {member.userId}
                </option>)}
              </select>
            </label>
            <button disabled={workingKey === item.candidate_key}>
              {workingKey === item.candidate_key ? 'Accepting…' : 'Accept as Task'}
            </button>
          </form> : <span className="muted smallText">Read only</span>}
        </div>;
      })}
    </div>

    {message ? <p className="muted smallText" role="status">{message}</p> : null}
  </section>;
}

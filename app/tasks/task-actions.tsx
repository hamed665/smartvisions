'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { CrmTaskRow } from '@/lib/crm/tasks';

type Business = { id: string; name: string };
type Deal = { id: string; title: string; businessId: string; state: string };
type Member = { userId: string; role: string };

export function TaskActions({
  organizationId,
  currentUserId,
  currentRole,
  canCreate,
  businesses,
  deals,
  members,
  tasks,
}: {
  organizationId: string;
  currentUserId: string;
  currentRole: string;
  canCreate: boolean;
  businesses: Business[];
  deals: Deal[];
  members: Member[];
  tasks: CrmTaskRow[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const assignableMembers = useMemo(
    () => currentRole === 'SALES_AGENT'
      ? members.filter((member) => member.userId === currentUserId)
      : members,
    [currentRole, currentUserId, members],
  );

  async function request(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/tasks', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'CRM Task action failed');
      setMessage('Task updated.');
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CRM Task action failed');
      return false;
    } finally {
      setWorking(false);
    }
  }

  return <div>
    {canCreate ? <section className="panel">
      <h2>Create task</h2>
      <form className="settingsList" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const businessId = String(data.get('businessId') || '');
        const dealId = String(data.get('dealId') || '');
        const dueAt = String(data.get('dueAt') || '');
        const reminderAt = String(data.get('reminderAt') || '');
        const ok = await request('POST', {
          organizationId,
          businessId: businessId || null,
          dealId: dealId || null,
          title: String(data.get('title') || ''),
          taskType: String(data.get('taskType') || 'GENERAL'),
          priority: String(data.get('priority') || 'NORMAL'),
          assigneeUserId: String(data.get('assigneeUserId') || '') || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
          requestKey: crypto.randomUUID(),
          metadata: {},
        });
        if (ok) form.reset();
      }}>
        <div className="settingsRow">
          <label className="wideField">Title<input name="title" required maxLength={240} /></label>
          <label>Business<select name="businessId"><option value="">None</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Deal<select name="dealId"><option value="">None</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title} · {d.state}</option>)}</select></label>
          <label>Type<select name="taskType" defaultValue="GENERAL"><option>GENERAL</option><option>CALL</option><option>EMAIL</option><option>WHATSAPP</option><option>MEETING</option><option>REVIEW</option><option>FOLLOW_UP</option><option>OTHER</option></select></label>
          <label>Priority<select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
          <label>Assignee<select name="assigneeUserId" defaultValue={currentUserId}><option value="">Unassigned</option>{assignableMembers.map((m) => <option key={m.userId} value={m.userId}>{m.role} · {m.userId}</option>)}</select></label>
          <label>Due<input name="dueAt" type="datetime-local" /></label>
          <label>Reminder<input name="reminderAt" type="datetime-local" /></label>
          <button disabled={working}>Create task</button>
        </div>
      </form>
    </section> : null}

    <section className="panel">
      <h2>Open work</h2>
      <div className="settingsList">
        {tasks.length === 0 ? <p className="muted">No open CRM tasks.</p> : tasks.map((task) => <div className="settingsRow" key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <span className="muted smallText">{task.task_type} · {task.priority} · {task.status}</span>
            {task.deal_id ? <span className="muted smallText">Deal {task.deal_id}</span> : null}
            {task.person_id ? <span className="muted smallText">Person {task.person_id}</span> : null}
            {task.due_at ? <span className="muted smallText">Due {new Date(task.due_at).toLocaleString()}</span> : null}
            {task.reminder_at ? <span className="muted smallText">Reminder {new Date(task.reminder_at).toLocaleString()}</span> : null}
          </div>
          <div>
            {task.is_overdue ? <span className="status">OVERDUE</span> : null}
            {task.reminder_due ? <span className="status">REMINDER DUE</span> : null}
            {task.reminder_due ? <button disabled={working} onClick={() => void request('PATCH', {
              organizationId,
              taskId: task.id,
              action: 'ACK_REMINDER',
            })}>Acknowledge</button> : null}
            <button disabled={working} onClick={() => void request('PATCH', {
              organizationId,
              taskId: task.id,
              expectedVersion: task.version,
              patch: { status: 'DONE' },
            })}>Done</button>
          </div>
        </div>)}
      </div>
      {message ? <p className="muted smallText" role="status">{message}</p> : null}
    </section>
  </div>;
}

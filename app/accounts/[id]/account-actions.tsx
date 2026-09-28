'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  CRM_ACCOUNT_HIERARCHY_RELATIONS,
  CRM_ACCOUNT_LIFECYCLES,
} from '@/lib/crm/accounts';

type Member = { userId: string; role: string };
type AccountOption = { id: string; name: string };

export function AccountActions({
  organizationId,
  businessId,
  currentLifecycle,
  currentOwnerUserId,
  currentParentBusinessId,
  currentRelation,
  canManage,
  members,
  accounts,
}: {
  organizationId: string;
  businessId: string;
  currentLifecycle: string;
  currentOwnerUserId: string | null;
  currentParentBusinessId: string | null;
  currentRelation: string | null;
  canManage: boolean;
  members: Member[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function mutate(payload: Record<string, unknown>) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, businessId, ...payload }),
      });
      const body = await response.json() as { error?: string; replayed?: boolean };
      if (!response.ok) throw new Error(body.error || 'CRM Account mutation failed');
      setMessage(body.replayed ? 'Already applied.' : 'Account updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CRM Account mutation failed');
    } finally {
      setWorking(false);
    }
  }

  if (!canManage) {
    return <p className="muted smallText">Read-only. OWNER, ADMIN or SALES_MANAGER is required to govern Account lifecycle, ownership or hierarchy.</p>;
  }

  return <div className="settingsList">
    <form className="settingsRow" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void mutate({
        action: 'SET_LIFECYCLE',
        lifecycle: String(form.get('lifecycle') || ''),
        reason: String(form.get('reason') || ''),
      });
    }}>
      <div><strong>B2B lifecycle</strong><span className="muted smallText">Current: {currentLifecycle}</span></div>
      <label>Lifecycle<select name="lifecycle" defaultValue={currentLifecycle}>
        {CRM_ACCOUNT_LIFECYCLES.map((value) => <option value={value} key={value}>{value}</option>)}
      </select></label>
      <label className="wideField">Evidence reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Update lifecycle</button>
    </form>

    <form className="settingsRow" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void mutate({
        action: 'SET_OWNER',
        ownerUserId: String(form.get('ownerUserId') || ''),
        reason: String(form.get('reason') || ''),
      });
    }}>
      <div><strong>Account owner</strong><span className="muted smallText">Current: {currentOwnerUserId || 'Unassigned'}</span></div>
      <label>Owner<select name="ownerUserId" defaultValue={currentOwnerUserId || ''}>
        <option value="">Unassigned</option>
        {members.map((member) => <option value={member.userId} key={member.userId}>{member.role} · {member.userId}</option>)}
      </select></label>
      <label className="wideField">Evidence reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Update owner</button>
    </form>

    <form className="settingsRow" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const parentBusinessId = String(form.get('parentBusinessId') || '');
      void mutate({
        action: 'SET_PARENT',
        parentBusinessId,
        relation: parentBusinessId ? String(form.get('relation') || '') : '',
        reason: String(form.get('reason') || ''),
      });
    }}>
      <div><strong>External Account hierarchy</strong><span className="muted smallText">Current: {currentRelation || 'ROOT'} {currentParentBusinessId || ''}</span></div>
      <label>Parent<select name="parentBusinessId" defaultValue={currentParentBusinessId || ''}>
        <option value="">No parent</option>
        {accounts.filter((account) => account.id !== businessId).map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
      </select></label>
      <label>Relation<select name="relation" defaultValue={currentRelation || 'BRANCH_OF'}>
        {CRM_ACCOUNT_HIERARCHY_RELATIONS.map((value) => <option value={value} key={value}>{value}</option>)}
      </select></label>
      <label className="wideField">Evidence reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Update hierarchy</button>
    </form>

    {message ? <p className="muted smallText" role="status">{message}</p> : null}
  </div>;
}

'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CrmSegmentRow,
  CrmSegmentSnapshotRow,
} from '@/lib/crm/segments';

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Snapshot request failed');
  }
  return body;
}

export function SegmentSnapshotPanel({
  organizationId,
  canManage,
  segments,
  snapshots,
}: {
  organizationId: string;
  canManage: boolean;
  segments: CrmSegmentRow[];
  snapshots: CrmSegmentSnapshotRow[];
}) {
  const router = useRouter();
  const activeSegments = useMemo(
    () => segments.filter(segment => segment.status === 'ACTIVE'),
    [segments],
  );
  const [segmentId, setSegmentId] = useState(activeSegments[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const sourceRef = useRef<string | null>(null);

  const selected = activeSegments.find(segment => segment.id === segmentId) ?? activeSegments[0] ?? null;

  async function freezeSnapshot() {
    if (!selected) return;
    setWorking(true);
    setMessage(null);

    if (!requestKey.current) requestKey.current = `segment-snapshot:${crypto.randomUUID()}`;
    if (!sourceRef.current) sourceRef.current = `operator-ui:${crypto.randomUUID()}`;

    try {
      const body = await jsonRequest('/api/crm/segments/snapshots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          segmentId: selected.id,
          segmentVersion: selected.current_definition_version,
          purpose: 'MANUAL',
          sourceRef: sourceRef.current,
          requestKey: requestKey.current,
        }),
      });
      const snapshot = body.snapshot as Record<string, unknown> | undefined;
      setMessage(
        snapshot
          ? `Snapshot frozen: ${String(snapshot.member_count ?? 0)} ${selected.entity_type} IDs at definition v${selected.current_definition_version}.`
          : 'Snapshot frozen.',
      );
      requestKey.current = null;
      sourceRef.current = null;
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Snapshot creation failed');
    } finally {
      setWorking(false);
    }
  }

  return <section className="panel">
    <h2>Immutable audience snapshots</h2>
    <p className="muted">
      Freeze exact entity IDs for one immutable Segment definition version. A snapshot is historical evidence only; it is not consent and does not send messages or trigger workflows.
    </p>

    {activeSegments.length ? <div className="formGrid">
      <label>
        Active Segment
        <select
          value={selected?.id ?? ''}
          disabled={working}
          onChange={event => {
            setSegmentId(event.target.value);
            requestKey.current = null;
            sourceRef.current = null;
          }}
        >
          {activeSegments.map(segment => <option key={segment.id} value={segment.id}>
            {segment.name} · {segment.entity_type} · definition v{segment.current_definition_version}
          </option>)}
        </select>
      </label>
      <div>
        <span className="muted smallText">RC safety limit</span>
        <strong>10,000 members</strong>
      </div>
    </div> : <p className="muted">Create an active Segment before freezing a snapshot.</p>}

    {canManage && selected
      ? <button type="button" disabled={working} onClick={() => void freezeSnapshot()}>
          Freeze current version
        </button>
      : !canManage
        ? <p className="muted">Snapshot creation requires OWNER, ADMIN or SALES_MANAGER.</p>
        : null}

    {message ? <p className="muted" role="status">{message}</p> : null}

    <h3>Recent snapshots</h3>
    {snapshots.length === 0 ? <p className="muted">No immutable audience snapshot exists. Production is not populated for decoration.</p> : <div className="settingsList">
      {snapshots.map(snapshot => <article className="settingsRow" key={snapshot.id}>
        <div>
          <strong>{snapshot.entity_type} · {snapshot.member_count} members</strong>
          <span className="muted smallText">
            Segment {snapshot.segment_id} · definition v{snapshot.segment_version} · {snapshot.purpose}
          </span>
          <span className="muted smallText">
            Membership hash {snapshot.membership_hash.slice(0, 12)}… · {new Date(snapshot.created_at).toLocaleString()}
          </span>
        </div>
      </article>)}
    </div>}
  </section>;
}

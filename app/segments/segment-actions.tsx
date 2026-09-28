'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CrmSegmentEntityType,
  CrmSegmentRow,
} from '@/lib/crm/segments';

const EXAMPLES: Record<CrmSegmentEntityType, string> = {
  LEAD: JSON.stringify({
    kind: 'GROUP',
    op: 'AND',
    children: [
      { kind: 'PREDICATE', source: 'CANONICAL', field: 'status', operator: 'EQ', value: 'ACTIVE' },
      { kind: 'PREDICATE', source: 'CANONICAL', field: 'opportunity_score', operator: 'GTE', value: 60 },
    ],
  }, null, 2),
  PERSON: JSON.stringify({
    kind: 'PREDICATE',
    source: 'CANONICAL',
    field: 'status',
    operator: 'EQ',
    value: 'ACTIVE',
  }, null, 2),
  DEAL: JSON.stringify({
    kind: 'GROUP',
    op: 'AND',
    children: [
      { kind: 'PREDICATE', source: 'CANONICAL', field: 'state', operator: 'EQ', value: 'OPEN' },
      { kind: 'PREDICATE', source: 'CANONICAL', field: 'amount', operator: 'GTE', value: 100 },
    ],
  }, null, 2),
  ACCOUNT: JSON.stringify({
    kind: 'PREDICATE',
    source: 'CANONICAL',
    field: 'account_lifecycle',
    operator: 'IN',
    value: ['PROSPECT', 'QUALIFIED', 'CUSTOMER'],
  }, null, 2),
};

function parsePredicate(raw: string) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Predicate must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function freshKey(prefix: string, ref: { current: string | null }) {
  if (!ref.current) ref.current = `${prefix}:${crypto.randomUUID()}`;
  return ref.current;
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Segment request failed');
  }
  return body;
}

function CreateSegmentForm({
  organizationId,
  canManage,
}: {
  organizationId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<CrmSegmentEntityType>('LEAD');
  const [name, setName] = useState('');
  const [raw, setRaw] = useState(EXAMPLES.LEAD);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  async function createSegment() {
    setWorking(true);
    setMessage(null);
    try {
      const predicateTree = parsePredicate(raw);
      await jsonRequest('/api/crm/segments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          entityType,
          name,
          predicateTree,
          requestKey: freshKey('segment-create', requestKey),
        }),
      });
      requestKey.current = null;
      setName('');
      setMessage('Segment created. Dynamic membership is evaluated on demand.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Segment create failed');
    } finally {
      setWorking(false);
    }
  }

  return <section className="panel">
    <h2>Create dynamic Segment</h2>
    <p className="muted">Predicates are typed and allowlisted. Free SQL, JSONPath, arbitrary metadata, Person PII and Account contact fields are rejected.</p>

    <div className="formGrid">
      <label>
        Entity
        <select
          value={entityType}
          disabled={!canManage || working}
          onChange={event => {
            const next = event.target.value as CrmSegmentEntityType;
            setEntityType(next);
            setRaw(EXAMPLES[next]);
            requestKey.current = null;
          }}
        >
          <option value="LEAD">Lead</option>
          <option value="PERSON">Person</option>
          <option value="DEAL">Deal</option>
          <option value="ACCOUNT">Account</option>
        </select>
      </label>
      <label>
        Name
        <input
          value={name}
          disabled={!canManage || working}
          maxLength={160}
          onChange={event => {
            setName(event.target.value);
            requestKey.current = null;
          }}
          placeholder="Qualified Oman accounts"
        />
      </label>
    </div>

    <label className="wideField">
      Predicate JSON
      <textarea
        value={raw}
        disabled={!canManage || working}
        rows={12}
        spellCheck={false}
        onChange={event => {
          setRaw(event.target.value);
          requestKey.current = null;
        }}
      />
    </label>

    {canManage
      ? <button type="button" disabled={working || !name.trim()} onClick={() => void createSegment()}>Create Segment</button>
      : <p className="muted">Creating or changing Segments requires OWNER, ADMIN or SALES_MANAGER.</p>}

    {message ? <p className="muted" role="status">{message}</p> : null}
  </section>;
}

function ExistingSegmentEditor({
  organizationId,
  canManage,
  segment,
}: {
  organizationId: string;
  canManage: boolean;
  segment: CrmSegmentRow;
}) {
  const router = useRouter();
  const [editName, setEditName] = useState(segment.name);
  const [editRaw, setEditRaw] = useState(JSON.stringify(segment.predicate_tree, null, 2));
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<{
    entityType: string;
    count: number;
    hasMore: boolean;
    segmentVersion: number;
  } | null>(null);
  const editKey = useRef<string | null>(null);
  const lifecycleKey = useRef<string | null>(null);

  async function saveDefinition() {
    setWorking(true);
    setMessage(null);
    try {
      const predicateTree = parsePredicate(editRaw);
      await jsonRequest('/api/crm/segments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'DEFINITION',
          organizationId,
          segmentId: segment.id,
          entityType: segment.entity_type,
          expectedVersion: segment.version,
          name: editName,
          predicateTree,
          requestKey: freshKey('segment-definition', editKey),
        }),
      });
      editKey.current = null;
      setMessage('A new immutable Segment definition version was published.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Segment update failed');
    } finally {
      setWorking(false);
    }
  }

  async function toggleLifecycle() {
    setWorking(true);
    setMessage(null);
    try {
      const status = segment.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
      await jsonRequest('/api/crm/segments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'LIFECYCLE',
          organizationId,
          segmentId: segment.id,
          expectedVersion: segment.version,
          status,
          requestKey: freshKey(`segment-${status.toLowerCase()}`, lifecycleKey),
        }),
      });
      lifecycleKey.current = null;
      setMessage(`Segment ${status.toLowerCase()}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Segment lifecycle update failed');
    } finally {
      setWorking(false);
    }
  }

  async function evaluate() {
    setWorking(true);
    setMessage(null);
    try {
      const body = await jsonRequest('/api/crm/segments/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          segmentId: segment.id,
          segmentVersion: segment.current_definition_version,
          limit: 100,
        }),
      });
      const ids = Array.isArray(body.entityIds)
        ? body.entityIds
        : Array.isArray(body.leadIds)
          ? body.leadIds
          : [];
      setEvaluation({
        entityType: String(body.entityType ?? segment.entity_type),
        count: ids.length,
        hasMore: body.hasMore === true,
        segmentVersion: Number(body.segmentVersion ?? segment.current_definition_version),
      });
      setMessage('Evaluation complete. No Campaign, Workflow or provider action was invoked.');
    } catch (error) {
      setEvaluation(null);
      setMessage(error instanceof Error ? error.message : 'Segment evaluation failed');
    } finally {
      setWorking(false);
    }
  }

  return <>
    <div className="healthList">
      <span>Entity <strong>{segment.entity_type}</strong></span>
      <span>Lifecycle <strong>{segment.status}</strong></span>
      <span>Definition <strong>v{segment.current_definition_version}</strong></span>
      <span>Row version <strong>{segment.version}</strong></span>
    </div>

    <div className="headerRow">
      <button type="button" disabled={working || segment.status !== 'ACTIVE'} onClick={() => void evaluate()}>Evaluate up to 100</button>
      {canManage ? <button type="button" disabled={working} onClick={() => void toggleLifecycle()}>
        {segment.status === 'ACTIVE' ? 'Archive' : 'Reactivate'}
      </button> : null}
    </div>

    {evaluation ? <p className="muted" role="status">
      {evaluation.entityType} · definition v{evaluation.segmentVersion} · returned {evaluation.count}{evaluation.hasMore ? '+ (more available)' : ''}
    </p> : null}

    {canManage && segment.status === 'ACTIVE' ? <>
      <h3>Publish new definition version</h3>
      <label>
        Name
        <input
          value={editName}
          maxLength={160}
          disabled={working}
          onChange={event => {
            setEditName(event.target.value);
            editKey.current = null;
          }}
        />
      </label>
      <label className="wideField">
        Predicate JSON
        <textarea
          value={editRaw}
          rows={12}
          spellCheck={false}
          disabled={working}
          onChange={event => {
            setEditRaw(event.target.value);
            editKey.current = null;
          }}
        />
      </label>
      <button type="button" disabled={working || !editName.trim()} onClick={() => void saveDefinition()}>Publish new version</button>
    </> : null}

    {message ? <p className="muted" role="status">{message}</p> : null}
  </>;
}

export function SegmentActions({
  organizationId,
  canManage,
  segments,
}: {
  organizationId: string;
  canManage: boolean;
  segments: CrmSegmentRow[];
}) {
  const [selectedId, setSelectedId] = useState(segments[0]?.id ?? '');
  const selected = segments.find(segment => segment.id === selectedId) ?? segments[0] ?? null;

  return <>
    <CreateSegmentForm organizationId={organizationId} canManage={canManage} />

    <section className="panel">
      <h2>Existing Segments</h2>
      {segments.length === 0 ? <p className="muted">No Segment exists. Production is not populated just to make this screen look busy.</p> : <>
        <label>
          Segment
          <select
            value={selected?.id ?? ''}
            onChange={event => setSelectedId(event.target.value)}
          >
            {segments.map(segment => <option value={segment.id} key={segment.id}>
              {segment.name} · {segment.entity_type} · {segment.status} · v{segment.current_definition_version}
            </option>)}
          </select>
        </label>

        {selected ? <ExistingSegmentEditor
          key={`${selected.id}:${selected.version}`}
          organizationId={organizationId}
          canManage={canManage}
          segment={selected}
        /> : null}
      </>}
    </section>
  </>;
}

import {notFound} from 'next/navigation';

import {
  approveMemoryItemV2,
  correctMemoryItemV2,
  invalidateMemoryItemV2,
  rejectMemoryItemV2,
  stageMemoryItemV2,
} from './actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type MemoryRow={
  id:string;
  memory_key:string;
  memory_type:string;
  version:number;
  payload:unknown;
  state:string;
  source_type:string;
  source_ref:string;
  source_evidence:Record<string,unknown>;
  confidence:number;
  observed_at:string;
  fresh_until:string|null;
  sensitivity:string;
  valid_from:string;
  valid_until:string|null;
  expires_at:string|null;
  person_id:string|null;
  business_id:string|null;
  conversation_id:string|null;
  supersedes_memory_id:string|null;
  correction_reason:string|null;
  retrieval_enabled:boolean;
  created_at:string;
};
type PersonRow={id:string;display_name:string|null};
type BusinessRow={id:string;name:string};
type ConversationRow={id:string;channel:string;summary:string|null};

function textPayload(payload:unknown){
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)){
    const text=(payload as Record<string,unknown>).text;
    if(typeof text==='string')return text;
  }
  return JSON.stringify(payload,null,2);
}
function effectiveState(row:MemoryRow){
  const now=Date.now();
  if(row.state==='ACTIVE'&&row.expires_at&&Date.parse(row.expires_at)<=now)return 'EXPIRED (effective)';
  if(row.state==='ACTIVE'&&row.valid_until&&Date.parse(row.valid_until)<=now)return 'EXPIRED (effective)';
  return row.state;
}
function freshness(row:MemoryRow){
  if(!row.fresh_until)return 'unbounded';
  return Date.parse(row.fresh_until)<Date.now()?'stale':'fresh';
}

export default async function MemoryPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  if(!['OWNER','ADMIN'].includes(String(role)))notFound();

  const [memoryResult,peopleResult,businessResult,conversationResult]=await Promise.all([
    supabase.from('memory_items')
      .select('id,memory_key,memory_type,version,payload,state,source_type,source_ref,source_evidence,confidence,observed_at,fresh_until,sensitivity,valid_from,valid_until,expires_at,person_id,business_id,conversation_id,supersedes_memory_id,correction_reason,retrieval_enabled,created_at')
      .eq('organization_id',organizationId)
      .order('created_at',{ascending:false})
      .limit(200),
    supabase.from('crm_people').select('id,display_name')
      .eq('organization_id',organizationId).eq('status','ACTIVE').order('updated_at',{ascending:false}).limit(100),
    supabase.from('businesses').select('id,name')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100),
    supabase.from('sales_conversations').select('id,channel,summary')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100),
  ]);
  const firstError=[memoryResult,peopleResult,businessResult,conversationResult].map(r=>r.error).find(Boolean);
  if(firstError)throw new Error('Memory V2 read failed: '+firstError.message);

  const rows=(memoryResult.data??[]) as MemoryRow[];
  const people=(peopleResult.data??[]) as PersonRow[];
  const businesses=(businessResult.data??[]) as BusinessRow[];
  const conversations=(conversationResult.data??[]) as ConversationRow[];
  const pending=rows.filter(row=>row.state==='PENDING_REVIEW');
  const active=rows.filter(row=>row.state==='ACTIVE');
  const historical=rows.filter(row=>!['PENDING_REVIEW','ACTIVE'].includes(row.state));

  return <div>
    <div className="headerRow">
      <div>
        <h1>Memory</h1>
        <p className="muted">Typed, evidence-backed derived memory with target-aware identity, review, freshness, validity, correction and expiry.</p>
      </div>
      <span className="status">{active.length} active · {pending.length} pending</span>
    </div>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">
        Conversation, Customer, Relationship and Business memory is compiled from canonical Conversation/CRM records at retrieval time.
        This registry stores only Working, Episodic, Operational and Agent Learning assertions. It is not a second CRM, conversation store,
        Business Twin, Knowledge Base or audit log. Agent/System learning is review-gated before retrieval.
      </p>
    </section>

    <section className="panel settingsCreate">
      <h2>Stage derived memory</h2>
      <form action={stageMemoryItemV2} className="settingsGrid">
        <label>Memory key<input name="memory_key" placeholder="customer.preference.followup_window" required/></label>
        <label>Type<select name="memory_type" defaultValue="EPISODIC">
          <option value="WORKING">Working</option>
          <option value="EPISODIC">Episodic</option>
          <option value="OPERATIONAL">Operational</option>
          <option value="AGENT_LEARNING">Agent learning</option>
        </select></label>
        <label>Confidence<input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="0.8" required/></label>
        <label>Sensitivity<select name="sensitivity" defaultValue="INTERNAL">
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
          <option value="CONFIDENTIAL">Confidential</option>
        </select></label>
        <label>Fresh for hours<input name="fresh_hours" type="number" min="1" placeholder="optional"/></label>
        <label>Expire after hours<input name="expires_hours" type="number" min="1" placeholder="required for Working"/></label>
        <label>Person<select name="person_id" defaultValue="">
          <option value="">Organization / none</option>
          {people.map(person=><option key={person.id} value={person.id}>{person.display_name||person.id}</option>)}
        </select></label>
        <label>CRM Business<select name="business_id" defaultValue="">
          <option value="">None</option>
          {businesses.map(business=><option key={business.id} value={business.id}>{business.name}</option>)}
        </select></label>
        <label>Conversation<select name="conversation_id" defaultValue="">
          <option value="">None</option>
          {conversations.map(conversation=><option key={conversation.id} value={conversation.id}>{conversation.channel} · {conversation.summary?.slice(0,60)||conversation.id}</option>)}
        </select></label>
        <label className="wideField">Memory content<textarea name="content" rows={5} required placeholder="A bounded derived fact or working note, with explicit confidence and lifetime."/></label>
        <button>Stage for review</button>
      </form>
    </section>

    <section className="panel">
      <h2>Pending review</h2>
      {!pending.length?<p className="muted">No pending derived memory. This is preferable to inventing things for a dashboard.</p>:
        <div className="settingsList">{pending.map(row=><div className="settingsRow" key={row.id}>
          <div>
            <strong>{row.memory_key}</strong>
            <span className="muted smallText">{row.memory_type} · v{row.version} · confidence {Number(row.confidence).toFixed(2)} · {row.source_type} · target {row.conversation_id?'conversation':row.person_id?'person':row.business_id?'business':'organization'}</span>
            <pre className="knowledgeText">{textPayload(row.payload)}</pre>
            <span className="muted smallText">Source ref: {row.source_ref}</span>
            <details><summary>Source evidence</summary><pre className="knowledgeText">{JSON.stringify(row.source_evidence??{},null,2)}</pre></details>
          </div>
          <div>
            <form action={approveMemoryItemV2}><input type="hidden" name="memory_id" value={row.id}/><button>Approve</button></form>
            <form action={rejectMemoryItemV2} className="settingsGrid">
              <input type="hidden" name="memory_id" value={row.id}/>
              <label>Reject reason<input name="reason" required/></label>
              <button>Reject</button>
            </form>
          </div>
        </div>)}</div>}
    </section>

    <section className="panel">
      <h2>Active derived memory</h2>
      {!active.length?<p className="muted">No approved derived memory exists yet. Canonical Conversation/CRM memory is still compiled directly from source authorities.</p>:
        <div className="settingsList">{active.map(row=><div className="settingsRow" key={row.id}>
          <div>
            <strong>{row.memory_key}</strong>
            <span className="muted smallText">
              {row.memory_type} · v{row.version} · {freshness(row)} · {effectiveState(row)} · {row.sensitivity} · confidence {Number(row.confidence).toFixed(2)} · target {row.conversation_id?'conversation':row.person_id?'person':row.business_id?'business':'organization'}
            </span>
            <pre className="knowledgeText">{textPayload(row.payload)}</pre>
            <span className="muted smallText">Source: {row.source_type} · {row.source_ref} · observed {row.observed_at}</span>
            <details><summary>Source evidence</summary><pre className="knowledgeText">{JSON.stringify(row.source_evidence??{},null,2)}</pre></details>
          </div>
          <div>
            <details>
              <summary>Correct</summary>
              <form action={correctMemoryItemV2} className="settingsGrid">
                <input type="hidden" name="memory_id" value={row.id}/>
                <label className="wideField">Corrected content<textarea name="content" rows={4} required/></label>
                <label>Correction reason<input name="reason" required/></label>
                <button>Stage correction</button>
              </form>
            </details>
            <form action={invalidateMemoryItemV2} className="settingsGrid">
              <input type="hidden" name="memory_id" value={row.id}/>
              <label>Invalidate reason<input name="reason" required/></label>
              <button>Invalidate</button>
            </form>
          </div>
        </div>)}</div>}
    </section>

    <section className="panel">
      <h2>History</h2>
      <p className="muted">{historical.length} superseded, corrected, invalidated, expired or rejected persisted assertions. History is not deleted.</p>
      <div className="settingsList">{historical.slice(0,50).map(row=><div className="settingsRow" key={row.id}>
        <div><strong>{row.memory_key}</strong><span className="muted smallText">{row.memory_type} · v{row.version} · {effectiveState(row)}</span></div>
      </div>)}</div>
    </section>
  </div>;
}

import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0184_memory_v2.sql','utf8');
const page=readFileSync('app/memory/page.tsx','utf8');
const actions=readFileSync('app/memory/actions.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');

describe('MEMORY-V2 architecture',()=>{
  it('keeps canonical Conversation Customer Relationship and Business truth in source modules',()=>{
    expect(migration).toContain('create table public.memory_items');
    expect(migration).toContain("memory_type in (\n    'WORKING','EPISODIC','OPERATIONAL','AGENT_LEARNING'");
    expect(migration).toContain("'CONVERSATION'::text as memory_type");
    expect(migration).toContain("'CUSTOMER',1");
    expect(migration).toContain("'RELATIONSHIP',1");
    expect(migration).toContain("'BUSINESS',1");
    expect(migration).toContain('CANONICAL_SOURCE_UPDATE');
    expect(migration).not.toContain('create table public.memory_conversations');
    expect(migration).not.toContain('create table public.memory_customers');
    expect(migration).not.toContain('create table public.memory_businesses');
    expect(migration).not.toContain('create table public.memory_relationships');
    expect(page).toContain('not a second CRM');
  });

  it('captures source confidence freshness sensitivity validity correction and expiry',()=>{
    for(const field of [
      'source_type text not null','source_ref text not null','source_evidence jsonb not null',
      'confidence numeric(5,4) not null','observed_at timestamptz not null',
      'fresh_until timestamptz','sensitivity text not null','valid_from timestamptz not null',
      'valid_until timestamptz','expires_at timestamptz','supersedes_memory_id uuid',
      'correction_reason text','invalidation_reason text',
    ]) expect(migration).toContain(field);
    expect(migration).toContain('Working Memory requires expiry within 30 days');
    expect(migration).toContain('VERSIONED_MEMORY_CORRECTION');
    expect(migration).toContain('memory_items_scope_version_uidx');
    expect(migration).toContain('memory_items_one_active_scope_uidx');
  });

  it('review-gates derived and agent/system memory before retrieval',()=>{
    expect(migration).toContain("'PENDING_REVIEW','ACTIVE','SUPERSEDED','CORRECTED','EXPIRED','INVALIDATED','REJECTED'");
    expect(migration).toContain('Agent/System learning cannot silently become active memory');
    expect(migration).toContain("m.state='ACTIVE' and m.retrieval_enabled=true");
    expect(migration).toContain('approve_memory_item_v2');
    expect(migration).toContain('reject_memory_item_v2');
    expect(migration).toContain('invalidate_memory_item_v2');
    expect(actions).toContain("p_source_type:'OPERATOR'");
    expect(actions).toContain("rpc('stage_memory_item_v2'");
  });

  it('uses canonical source references and does not introduce a learning/vector/audit side authority',()=>{
    for(const source of [
      'CONVERSATION_MESSAGE','SALES_CONVERSATION','CRM_PERSON','CRM_RELATIONSHIP',
      'CRM_BUSINESS','BUSINESS_TWIN','KNOWLEDGE','CRM_TASK','TIMELINE',
      'OPERATOR','AGENT_RUNTIME','SYSTEM_DERIVED',
    ]) expect(migration).toContain("'"+source+"'");
    expect(migration).not.toContain('create table public.memory_events');
    expect(migration).not.toContain('create table public.agent_learning');
    expect(migration).not.toContain('create table public.memory_vectors');
    expect(migration).not.toContain('create table public.memory_queue');
  });

  it('keeps trusted mutations service-only and exposes a manager operator surface',()=>{
    expect(migration).toContain("if current_user<>'service_role' then raise exception 'Memory staging is service-only'");
    expect(migration).toContain("m.role in ('OWNER','ADMIN')");
    expect(migration).toContain('grant execute on function public.get_memory_context_v2');
    expect(migration).toContain('to service_role;');
    expect(page).toContain('Stage derived memory');
    expect(shell).toContain("['Memory', '/memory']");
  });
});

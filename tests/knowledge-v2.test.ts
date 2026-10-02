import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0182_knowledge_v2.sql','utf8');
const hardening=readFileSync('supabase/migrations/0183_knowledge_v2_scope_evidence_hardening.sql','utf8');
const page=readFileSync('app/knowledge/page.tsx','utf8');
const actions=readFileSync('app/knowledge/actions.ts','utf8');
const ingestion=readFileSync('lib/knowledge/ingestion.ts','utf8');
const hydrator=readFileSync('lib/agents/context-hydrator-core.ts','utf8');
const legacyActions=readFileSync('app/versioned-intelligence-actions.ts','utf8');

describe('KNOWLEDGE-V2 architecture',()=>{
  it('extends the canonical knowledge_versions authority instead of forking it',()=>{
    expect(migration).toContain('alter table public.knowledge_versions');
    expect(migration).toContain('create table public.knowledge_sources');
    expect(migration).not.toContain('create table public.knowledge_items');
    expect(migration).not.toContain('create table public.vector');
    expect(migration).not.toContain('create table public.knowledge_queue');
    expect(migration).toContain('No second Knowledge');
  });

  it('covers required source families, provenance, approval, freshness and conflicts',()=>{
    for(const type of ['WEBSITE','PDF','DOC','FAQ','POLICY','MANUAL','CATALOG','TEXT']){
      expect(migration).toContain(`'${type}'`);
    }
    expect(migration).toContain("approval_status text not null default 'APPROVED'");
    expect(migration).toContain("conflict_state text not null default 'NONE'");
    expect(migration).toContain('stale_after_at timestamptz');
    expect(migration).toContain('provenance jsonb');
    expect(migration).toContain('supersedes_version_id');
    expect(migration).toContain('retrieval_enabled boolean');
  });

  it('requires explicit review for external/file/catalog ingestion and blocks the V1 bypass',()=>{
    expect(migration).toContain("'PENDING_REVIEW'");
    expect(migration).toContain('approve_knowledge_version_v2');
    expect(migration).toContain('reject_knowledge_version_v2');
    expect(migration.toLowerCase()).toContain('refresh never silently overwrites active approved truth');
    expect(migration).toContain('revoke all on function public.publish_knowledge_version');
    expect(actions).toContain("rpc('stage_knowledge_version_v2'");
    expect(actions).toContain("rpc('approve_knowledge_version_v2'");
    expect(legacyActions).toContain("rpc('publish_manual_knowledge_v2'");
  });

  it('supports bounded website, PDF, DOCX and canonical Catalog ingestion without copying execution authorities',()=>{
    expect(ingestion).toContain('fetchWebsiteKnowledge');
    expect(ingestion).toContain('PDF_TEXT_EXTRACTION_EMPTY_OR_SCANNED');
    expect(ingestion).toContain('extractDocx');
    expect(ingestion).toContain('MAX_SOURCE_BYTES=5*1024*1024');
    expect(actions).toContain('stageCanonicalCatalogKnowledgeV2');
    expect(actions).toContain("excludedAuthorities:['PRICE','INVENTORY','PAYMENT']");
    expect(page).toContain('PDF / DOCX / text file');
    expect(page).toContain('Canonical Catalog description snapshot');
  });

  it('feeds agents only approved fresh V2 retrieval and keeps narrower scopes explicit',()=>{
    expect(hydrator).toContain("rpc('get_knowledge_context_v2'");
    expect(hydrator).toContain('p_include_stale: false');
    expect(migration).toContain("k.approval_status='APPROVED'");
    expect(migration).toContain('k.retrieval_enabled=true');
    expect(migration).toContain("k.scope_type='BUSINESS'");
    expect(migration).toContain("k.scope_type='BRANCH'");
  });

  it('keeps untrusted source text review-gated and strips active HTML code surfaces',()=>{
    expect(actions).toContain('UNTRUSTED_EXTERNAL_REQUIRES_APPROVAL');
    expect(actions).toContain('UNTRUSTED_FILE_REQUIRES_APPROVAL');
    expect(ingestion).toContain(".replace(/<script\\b[\\s\\S]*?<\\/script>/gi,' ')");
    expect(ingestion).toContain(".replace(/<style\\b[\\s\\S]*?<\\/style>/gi,' ')");
  });
});


describe('KNOWLEDGE-V2 hierarchy/evidence hardening',()=>{
  it('supports all canonical hierarchy scopes without a parallel hierarchy authority',()=>{
    for(const scope of ['ORGANIZATION','BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM']){
      expect(hardening).toContain(`'${scope}'`);
    }
    expect(hardening).toContain('references public.brands(organization_id,id)');
    expect(hardening).toContain('references public.departments(organization_id,id)');
    expect(hardening).toContain('references public.teams(organization_id,id)');
    expect(hardening).toContain('can_access_unified_inbox_scope');
    expect(page).toContain('<option>BRAND</option>');
    expect(page).toContain('<option>DEPARTMENT</option>');
    expect(page).toContain('<option>TEAM</option>');
  });

  it('allows one active version per key and scope rather than one per organization',()=>{
    expect(hardening).toContain('drop index if exists public.knowledge_versions_one_active_uidx');
    expect(hardening).toContain('knowledge_versions_one_active_scope_uidx');
    expect(hardening).toContain('nulls not distinct');
    expect(hardening).toContain('and scope_type=v_target.scope_type');
  });

  it('covers the required provenance taxonomy while preserving legacy file types',()=>{
    for(const type of ['MANUAL','WEBSITE','FILE','FAQ','CATALOG','SERVICE','POLICY','INTEGRATION','API','SYSTEM','PDF','DOC','TEXT']){
      expect(hardening).toContain(`'${type}'`);
    }
    expect(actions).toContain("rpc('configure_knowledge_source_scope_v2'");
  });

  it('surfaces lifecycle history from the existing audit log instead of inventing ingestion runs',()=>{
    expect(page).toContain("from('audit_logs')");
    expect(page).toContain("like('action','KNOWLEDGE_%')");
    expect(page).toContain('Knowledge lifecycle history');
    expect(hardening).not.toContain('create table public.knowledge_ingestion_runs');
  });

  it('preserves source, scope, freshness, conflict, confidence and review evidence for agents',()=>{
    expect(hardening).toContain('confidence numeric(5,4)');
    expect(hardening).toContain('review_state text');
    expect(hydrator).toContain('sourceType: clip(row.source_type');
    expect(hydrator).toContain('scopeType: clip(row.scope_type');
    expect(hydrator).toContain('stale: row.stale === true');
    expect(hydrator).toContain('confidence: row.confidence == null');
    expect(hydrator).toContain('reviewState: clip(row.review_state');
  });
});

-- PROJECT-HUNTER-MVP: Extend canonical intent opportunities; no second CRM,
-- provider send route, independent queue, or synthetic opportunity records.
alter table public.intent_opportunities
  add column if not exists project_channel text,
  add column if not exists project_fit_score integer,
  add column if not exists project_review_status text,
  add column if not exists project_proposal_draft text,
  add column if not exists project_evidence jsonb not null default '{}'::jsonb,
  add column if not exists project_reviewed_at timestamptz;

alter table public.intent_opportunities
  add constraint project_hunter_channel_guard check (
    project_channel is null or project_channel in (
      'UPWORK','PEOPLEPERHOUR','CONTRA','FREELANCER','GURU','LINKEDIN','OMAN_TENDER','DIRECT','OTHER'
    )
  ),
  add constraint project_hunter_fit_guard check (project_fit_score is null or project_fit_score between 0 and 100),
  add constraint project_hunter_review_guard check (
    project_review_status is null or project_review_status in
      ('REVIEW','DRAFT_READY','APPROVED_FOR_MANUAL_SEND','SENT_MANUALLY','REPLIED','WON','LOST','REJECTED')
  ),
  add constraint project_hunter_evidence_object_guard check (jsonb_typeof(project_evidence) = 'object');

create index if not exists intent_project_review_idx
  on public.intent_opportunities(organization_id, project_review_status, project_fit_score desc, detected_at desc)
  where project_channel is not null;

comment on column public.intent_opportunities.project_review_status is
  'Operator workflow only. APPROVED_FOR_MANUAL_SEND never authorizes an outbound provider call.';
comment on column public.intent_opportunities.project_evidence is
  'Non-secret source facts supplied by operator; never treated as verified provider evidence.';

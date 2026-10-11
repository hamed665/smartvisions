-- Safe PG17 smoke: validate schema and deny untrusted send authority without inserting fixtures.
do $$
declare
  status_count integer;
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='intent_opportunities' and c.relrowsecurity) then
    raise exception 'Project Hunter intent RLS must stay enabled';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='intent_opportunities'
    and indexname='intent_project_review_idx') then
    raise exception 'Project Hunter index missing';
  end if;
  select count(*) into status_count
  from information_schema.columns
  where table_schema='public' and table_name='intent_opportunities'
    and column_name in ('project_channel','project_fit_score','project_review_status',
      'project_proposal_draft','project_evidence','project_reviewed_at');
  if status_count <> 6 then raise exception 'Project Hunter schema incomplete: %',status_count; end if;
  if not exists(select 1 from pg_constraint where conname='project_hunter_review_guard') then
    raise exception 'Project Hunter status guard missing';
  end if;
  if has_table_privilege('anon','public.intent_opportunities','INSERT') then
    raise exception 'Project Hunter anonymous import is forbidden';
  end if;
end $$;

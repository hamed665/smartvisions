-- 0107: Instagram outbound safety control.
-- Keep Instagram outbound fail-closed until live provider acceptance is complete.
alter table public.system_controls
  add column if not exists instagram_ai_paused boolean not null default true;

comment on column public.system_controls.instagram_ai_paused is
  'Fail-closed Instagram outbound control. Remains true until tenant/provider live acceptance is complete.';

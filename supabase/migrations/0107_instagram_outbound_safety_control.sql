-- 0107: Instagram outbound safety control.
-- Keep Instagram outbound fail-closed until live provider acceptance is complete.
alter table public.system_controls
  add column if not exists instagram_ai_paused boolean not null default true;

comment on column public.system_controls.instagram_ai_paused is
  'Fail-closed Instagram outbound control. Remains true until tenant/provider live acceptance is complete.';


-- Extend the existing suppression authority instead of creating a second DNC store.
alter table public.suppression_list
  add column if not exists provider_identity_key text;

alter table public.suppression_list
  drop constraint if exists suppression_list_check;
alter table public.suppression_list
  add constraint suppression_list_check check (
    email is not null or phone is not null or domain is not null or provider_identity_key is not null
  );

alter table public.suppression_list
  drop constraint if exists suppression_list_provider_identity_key_check;
alter table public.suppression_list
  add constraint suppression_list_provider_identity_key_check check (
    provider_identity_key is null
    or length(trim(provider_identity_key)) between 3 and 800
  );

create unique index if not exists suppression_list_provider_identity_uidx
  on public.suppression_list (organization_id, provider_identity_key)
  where provider_identity_key is not null;

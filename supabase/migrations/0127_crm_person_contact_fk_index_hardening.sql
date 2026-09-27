-- 0127: CRM Person/Contact FK index hardening.
-- Production Advisor follow-up for the six single-column auth.users foreign keys
-- introduced by 0126. Existing organization-scoped composite indexes remain for
-- tenant-scoped query paths; these indexes cover FK maintenance lookups.

create index if not exists crm_people_created_by_user_fk_idx
  on public.crm_people(created_by_user_id);

create index if not exists crm_people_updated_by_user_fk_idx
  on public.crm_people(updated_by_user_id);

create index if not exists crm_person_identity_links_created_by_user_fk_idx
  on public.crm_person_identity_links(created_by_user_id);

create index if not exists crm_person_identity_links_updated_by_user_fk_idx
  on public.crm_person_identity_links(updated_by_user_id);

create index if not exists crm_person_business_relationships_created_by_user_fk_idx
  on public.crm_person_business_relationships(created_by_user_id);

create index if not exists crm_person_business_relationships_updated_by_user_fk_idx
  on public.crm_person_business_relationships(updated_by_user_id);

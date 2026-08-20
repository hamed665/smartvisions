-- Anonymous clients do not receive direct table access.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Signed-in dashboard users can use the Data API; RLS remains the row-level authority.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Preserve the same posture for tables/sequences created by future migrations.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
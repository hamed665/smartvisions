\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-000000000c01', 'CRM Org C'),
  ('00000000-0000-0000-0000-000000000d01', 'CRM Org D');

insert into public.organization_members(organization_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-00000000c001', 'OWNER'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-00000000c002', 'OWNER');

insert into public.businesses(
  id, organization_id, name, country_code, email, phone,
  international_phone, whatsapp, instagram
) values
  (
    '10000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    'CRM Business C1',
    'OM',
    ' Sales@Example.test ',
    '+968 1234 5678',
    '+96812345678',
    '+968 9876 5432',
    'https://www.instagram.com/Example.Handle/?igsh=fixture'
  ),
  (
    '10000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    'CRM Business C2',
    'OM',
    'other@example.test',
    '+968 1111 2222',
    '+96811112222',
    '+968 3333 4444',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000d01',
    '00000000-0000-0000-0000-000000000d01',
    'CRM Business D1',
    'OM',
    'sales@example.test',
    '+968 5555 6666',
    '+96855556666',
    '+968 7777 8888',
    null
  );

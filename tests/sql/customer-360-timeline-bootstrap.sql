\set ON_ERROR_STOP on

create table public.leads (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'ACTIVE',
  agent_mode text not null default 'AUTO',
  created_at timestamptz not null default now()
);

create table public.sales_conversations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  channel text not null,
  summary text,
  stage text not null default 'IN_CONVERSATION',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  provider_message_id text,
  channel text not null,
  direction text not null,
  media_type text not null default 'TEXT',
  original_text text,
  transcript text,
  detected_language text,
  detected_dialect text,
  persian_translation text,
  persian_summary text,
  intent_label text,
  sentiment_label text,
  confidence numeric,
  reply_language text,
  reply_dialect text,
  requires_approval boolean not null default false,
  approval_reason text,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz
);

create table public.outreach_messages (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null,
  direction text not null,
  status text not null,
  provider_message_id text,
  subject text,
  body text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.whatsapp_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  provider_message_id text not null,
  direction text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.email_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_message_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.followup_jobs (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence integer not null,
  scheduled_at timestamptz not null,
  status text not null,
  stop_reason text,
  created_at timestamptz not null default now(),
  channel text
);

create table public.handoff_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  from_mode text not null,
  to_mode text not null,
  reasons jsonb not null default '[]'::jsonb,
  actor_type text not null,
  actor_id text,
  created_at timestamptz not null default now(),
  request_key text
);

create table public.reply_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  category text not null,
  signals jsonb not null default '{}'::jsonb,
  intent_score integer not null default 0,
  hot boolean not null default false,
  stop_followups boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.operator_briefs (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  brief_type text not null,
  language text not null,
  title text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  requires_action boolean not null default false,
  created_at timestamptz not null default now()
);

do $rls$
declare
  t text;
begin
  foreach t in array array[
    'leads','sales_conversations','conversation_messages','outreach_messages',
    'whatsapp_events','email_events','followup_jobs','handoff_events',
    'reply_events','operator_briefs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))',
      t || '_member_read',
      t
    );
    execute format('grant select on public.%I to authenticated, service_role', t);
  end loop;
end;
$rls$;

insert into public.leads(id,organization_id,business_id,status,agent_mode) values
  (
    '20000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    'ACTIVE','AUTO'
  ),
  (
    '20000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    'ACTIVE','AUTO'
  ),
  (
    '20000000-0000-0000-0000-000000000d01',
    '00000000-0000-0000-0000-000000000d01',
    '10000000-0000-0000-0000-000000000d01',
    'ACTIVE','AUTO'
  );

insert into public.sales_conversations(id,organization_id,lead_id,channel,created_at,updated_at) values
  (
    '30000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    'WHATSAPP',
    '2026-09-22T09:55:00Z','2026-09-22T10:20:00Z'
  ),
  (
    '30000000-0000-0000-0000-000000000d01',
    '00000000-0000-0000-0000-000000000d01',
    '20000000-0000-0000-0000-000000000d01',
    'WHATSAPP',
    '2026-09-22T09:55:00Z','2026-09-22T10:20:00Z'
  );

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,provider_message_id,channel,direction,
  media_type,original_text,status,created_at,sent_at,requires_approval
) values
  (
    '40000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    'wamid.shared',
    'WHATSAPP','OUTBOUND','TEXT','Hello customer','SENT',
    '2026-09-22T09:59:00Z','2026-09-22T10:00:00Z',false
  ),
  (
    '40000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    null,
    'WHATSAPP','OUTBOUND','TEXT','Blocked draft','BLOCKED',
    '2026-09-22T10:06:00Z',null,true
  ),
  (
    '40000000-0000-0000-0000-000000000c03',
    '00000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    'email.fixture.1',
    'EMAIL','OUTBOUND','TEXT','Email sent','SENT',
    '2026-09-22T10:07:30Z','2026-09-22T10:08:00Z',false
  ),
  (
    '40000000-0000-0000-0000-000000000d01',
    '00000000-0000-0000-0000-000000000d01',
    '30000000-0000-0000-0000-000000000d01',
    '20000000-0000-0000-0000-000000000d01',
    'wamid.tenant-d',
    'WHATSAPP','OUTBOUND','TEXT','Other tenant','SENT',
    '2026-09-22T10:00:00Z','2026-09-22T10:01:00Z',false
  );

insert into public.outreach_messages(
  id,organization_id,lead_id,channel,direction,status,provider_message_id,
  body,sent_at,received_at,created_at
) values
  (
    '50000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    'WHATSAPP','OUTBOUND','DELIVERED','wamid.shared',
    'Hello customer','2026-09-22T10:00:00Z',null,'2026-09-22T09:59:30Z'
  ),
  (
    '50000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    'WHATSAPP','INBOUND','RECEIVED','wamid.inbound',
    'Customer reply',null,'2026-09-22T10:05:00Z','2026-09-22T10:05:00Z'
  ),
  (
    '50000000-0000-0000-0000-000000000d01',
    '00000000-0000-0000-0000-000000000d01',
    '20000000-0000-0000-0000-000000000d01',
    'WHATSAPP','INBOUND','RECEIVED','wamid.tenant-d-in',
    'Other tenant reply',null,'2026-09-22T10:05:00Z','2026-09-22T10:05:00Z'
  );

insert into public.whatsapp_events(
  id,organization_id,lead_id,conversation_id,provider_message_id,direction,event_type,payload,created_at
) values
  (
    '60000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    'wamid.shared','STATUS','SENT','{}','2026-09-22T10:00:01Z'
  ),
  (
    '60000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    'wamid.shared','STATUS','DELIVERED','{}','2026-09-22T10:00:02Z'
  ),
  (
    '60000000-0000-0000-0000-000000000c03',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    'wamid.shared','STATUS','READ','{}','2026-09-22T10:00:03Z'
  ),
  (
    '60000000-0000-0000-0000-000000000c04',
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    '30000000-0000-0000-0000-000000000c01',
    'wamid.inbound','INBOUND','TEXT','{}','2026-09-22T10:05:00Z'
  );

insert into public.email_events(id,organization_id,provider_message_id,event_type,payload,created_at) values
  (
    '70000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c01',
    'email.fixture.1','email.sent','{}','2026-09-22T10:08:01Z'
  ),
  (
    '70000000-0000-0000-0000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    'email.fixture.1','email.delivered','{}','2026-09-22T10:08:02Z'
  );

insert into public.followup_jobs(
  id,organization_id,lead_id,sequence,scheduled_at,status,created_at,channel
) values (
  '80000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c01',
  1,'2026-09-22T11:00:00Z','PENDING','2026-09-22T10:07:00Z','WHATSAPP'
);

insert into public.handoff_events(
  id,organization_id,lead_id,conversation_id,from_mode,to_mode,reasons,actor_type,created_at
) values (
  '90000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c01',
  '30000000-0000-0000-0000-000000000c01',
  'AUTO','HUMAN','["customer_request"]'::jsonb,'SYSTEM','2026-09-22T10:09:00Z'
);

insert into public.reply_events(
  id,organization_id,lead_id,outreach_message_id,category,signals,intent_score,hot,stop_followups,created_at
) values (
  'a0000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c01',
  '50000000-0000-0000-0000-000000000c02',
  'INTERESTED','{"source":"fixture"}'::jsonb,80,true,true,'2026-09-22T10:10:00Z'
);

insert into public.operator_briefs(
  id,organization_id,conversation_id,message_id,brief_type,language,title,summary,details,requires_action,created_at
) values (
  'b0000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '30000000-0000-0000-0000-000000000c01',
  '40000000-0000-0000-0000-000000000c02',
  'HANDOFF','en','Operator brief','Customer needs human follow-up','{"priority":"high"}'::jsonb,true,
  '2026-09-22T10:11:00Z'
);

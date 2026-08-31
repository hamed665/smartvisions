alter table public.preview_events
  drop constraint if exists preview_events_event_type_check;

alter table public.preview_events
  add constraint preview_events_event_type_check
  check (event_type = any (array[
    'OFFERED'::text,
    'ACCEPTED'::text,
    'GENERATED'::text,
    'QUALITY_FAILED'::text,
    'APPROVED'::text,
    'SENT'::text,
    'VIEWED'::text,
    'HOT'::text,
    'WON'::text,
    'EXPIRED'::text,
    'ARCHIVED'::text
  ]));

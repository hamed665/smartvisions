create index if not exists conversation_messages_conversation_fk_idx on public.conversation_messages(conversation_id);
create index if not exists conversation_messages_lead_fk_idx on public.conversation_messages(lead_id) where lead_id is not null;
create index if not exists operator_briefs_conversation_fk_idx on public.operator_briefs(conversation_id);
create index if not exists operator_briefs_message_fk_idx on public.operator_briefs(message_id) where message_id is not null;

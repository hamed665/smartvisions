create index if not exists voice_transcriptions_lead_fk_idx
  on public.voice_transcriptions(lead_id)
  where lead_id is not null;

create index if not exists voice_transcriptions_conversation_fk_idx
  on public.voice_transcriptions(conversation_id)
  where conversation_id is not null;

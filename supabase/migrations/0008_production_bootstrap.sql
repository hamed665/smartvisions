do $$
declare
  v_org_id uuid;
begin
  select id into v_org_id from public.organizations where name='Smart Visions' order by created_at asc limit 1;
  if v_org_id is null then
    insert into public.organizations(name) values ('Smart Visions') returning id into v_org_id;
  end if;

  insert into public.system_controls(organization_id,global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode,monthly_budget_usd)
  values(v_org_id,false,false,false,false,true,150)
  on conflict(organization_id) do update set shadow_mode=true, updated_at=now();

  insert into public.market_settings(organization_id,country_code,enabled,currency,timezone,send_window_start,send_window_end,config) values
    (v_org_id,'OM',true,'OMR','Asia/Muscat','09:00','19:00','{"languages":["ar","en"],"dialect":"omani","englishTone":"friendly_professional","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb),
    (v_org_id,'AE',true,'AED','Asia/Dubai','09:00','19:00','{"languages":["ar","en"],"dialect":"emirati","englishTone":"polished_premium","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb),
    (v_org_id,'SA',true,'SAR','Asia/Riyadh','09:00','19:00','{"languages":["ar","en"],"dialect":"saudi","englishTone":"warm_direct","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb),
    (v_org_id,'QA',true,'QAR','Asia/Qatar','09:00','19:00','{"languages":["ar","en"],"dialect":"qatari","englishTone":"professional_concise","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb),
    (v_org_id,'GB',true,'GBP','Europe/London','09:00','19:00','{"languages":["en"],"dialect":"british","englishTone":"polite_understated","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb),
    (v_org_id,'US',true,'USD','lead_specific','09:00','19:00','{"languages":["en"],"dialect":"american","englishTone":"direct_outcome_focused","coldEmailEnabled":true,"whatsappColdEnabled":false,"instagramAutoColdEnabled":false}'::jsonb)
  on conflict(organization_id,country_code) do update set enabled=excluded.enabled,currency=excluded.currency,timezone=excluded.timezone,send_window_start=excluded.send_window_start,send_window_end=excluded.send_window_end,config=excluded.config,updated_at=now();

  insert into public.services(organization_id,id,name,enabled,config) values
    (v_org_id,'business_website','Business Website',true,'{}'::jsonb),
    (v_org_id,'premium_bilingual_website','Premium Bilingual Website',true,'{}'::jsonb),
    (v_org_id,'custom_website','Advanced / Custom Website',true,'{"startingFrom":true,"requiresCustomQuote":true}'::jsonb),
    (v_org_id,'ai_reels_4','4 AI Reels',true,'{"productionMode":"human_assisted"}'::jsonb),
    (v_org_id,'ai_reels_8','8 AI Reels',true,'{"productionMode":"human_assisted"}'::jsonb),
    (v_org_id,'whatsapp_ai_setup','WhatsApp AI Setup',true,'{"startingFrom":true}'::jsonb)
  on conflict(organization_id,id) do update set name=excluded.name,enabled=excluded.enabled,config=excluded.config,updated_at=now();

  insert into public.service_prices(organization_id,service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct) values
    (v_org_id,'business_website','OM','OMR',179,null,5,10),(v_org_id,'business_website','AE','AED',1490,null,5,10),(v_org_id,'business_website','SA','SAR',1290,null,5,10),(v_org_id,'business_website','QA','QAR',1490,null,5,10),(v_org_id,'business_website','GB','GBP',650,null,5,10),(v_org_id,'business_website','US','USD',750,null,5,10),
    (v_org_id,'premium_bilingual_website','OM','OMR',249,null,5,10),(v_org_id,'premium_bilingual_website','AE','AED',1990,null,5,10),(v_org_id,'premium_bilingual_website','SA','SAR',1790,null,5,10),(v_org_id,'premium_bilingual_website','QA','QAR',1990,null,5,10),(v_org_id,'premium_bilingual_website','GB','GBP',950,null,5,10),(v_org_id,'premium_bilingual_website','US','USD',1100,null,5,10),
    (v_org_id,'custom_website','OM','OMR',399,399,0,0),(v_org_id,'custom_website','AE','AED',2990,2990,0,0),(v_org_id,'custom_website','SA','SAR',2790,2790,0,0),(v_org_id,'custom_website','QA','QAR',2990,2990,0,0),(v_org_id,'custom_website','GB','GBP',1450,1450,0,0),(v_org_id,'custom_website','US','USD',1700,1700,0,0),
    (v_org_id,'ai_reels_4','OM','OMR',49,null,0,0),(v_org_id,'ai_reels_4','AE','AED',449,null,0,0),(v_org_id,'ai_reels_4','SA','SAR',399,null,0,0),(v_org_id,'ai_reels_4','QA','QAR',449,null,0,0),(v_org_id,'ai_reels_4','GB','GBP',180,null,0,0),(v_org_id,'ai_reels_4','US','USD',220,null,0,0),
    (v_org_id,'ai_reels_8','OM','OMR',89,null,0,0),(v_org_id,'ai_reels_8','AE','AED',799,null,0,0),(v_org_id,'ai_reels_8','SA','SAR',699,null,0,0),(v_org_id,'ai_reels_8','QA','QAR',799,null,0,0),(v_org_id,'ai_reels_8','GB','GBP',320,null,0,0),(v_org_id,'ai_reels_8','US','USD',390,null,0,0),
    (v_org_id,'whatsapp_ai_setup','OM','OMR',199,199,0,0),(v_org_id,'whatsapp_ai_setup','AE','AED',1790,1790,0,0),(v_org_id,'whatsapp_ai_setup','SA','SAR',1490,1490,0,0),(v_org_id,'whatsapp_ai_setup','QA','QAR',1790,1790,0,0),(v_org_id,'whatsapp_ai_setup','GB','GBP',650,650,0,0),(v_org_id,'whatsapp_ai_setup','US','USD',800,800,0,0)
  on conflict(organization_id,service_id,country_code) do update set currency=excluded.currency,price=excluded.price,minimum_price=excluded.minimum_price,max_auto_discount_pct=excluded.max_auto_discount_pct,max_discount_with_approval_pct=excluded.max_discount_with_approval_pct;

  insert into public.locale_profiles(organization_id,country_code,primary_locale,fallback_locale,dialect,tone_profile,dialect_intensity,max_first_touch_words,max_reply_words,config) values
    (v_org_id,'OM','ar-OM','en','omani','friendly_professional',0.35,70,120,'{}'),(v_org_id,'AE','ar-AE','en','emirati','polished_premium',0.30,70,120,'{}'),(v_org_id,'SA','ar-SA','en','saudi','warm_direct',0.35,70,120,'{}'),(v_org_id,'QA','ar-QA','en','qatari','professional_concise',0.30,70,120,'{}'),(v_org_id,'GB','en-GB',null,'british','polite_understated',0,70,120,'{}'),(v_org_id,'US','en-US',null,'american','direct_outcome_focused',0,70,120,'{}')
  on conflict(organization_id,country_code) do update set primary_locale=excluded.primary_locale,fallback_locale=excluded.fallback_locale,dialect=excluded.dialect,tone_profile=excluded.tone_profile,dialect_intensity=excluded.dialect_intensity,max_first_touch_words=excluded.max_first_touch_words,max_reply_words=excluded.max_reply_words,updated_at=now();

  insert into public.outreach_policies(organization_id,country_code,enabled,send_window_start,send_window_end,business_days,max_emails_per_day,max_emails_per_mailbox,max_followups,followup_delays_days,manual_review_required,config) values
    (v_org_id,'OM',true,'09:00','19:00',array[0,1,2,3,4],50,20,2,array[3,7],true,'{}'),(v_org_id,'AE',true,'09:00','19:00',array[1,2,3,4,5],50,20,2,array[3,7],true,'{}'),(v_org_id,'SA',true,'09:00','19:00',array[0,1,2,3,4],50,20,2,array[3,7],true,'{}'),(v_org_id,'QA',true,'09:00','19:00',array[0,1,2,3,4],50,20,2,array[3,7],true,'{}'),(v_org_id,'GB',true,'09:00','19:00',array[1,2,3,4,5],50,20,2,array[3,7],true,'{}'),(v_org_id,'US',true,'09:00','19:00',array[1,2,3,4,5],50,20,2,array[3,7],true,'{}')
  on conflict(organization_id,country_code) do update set enabled=excluded.enabled,send_window_start=excluded.send_window_start,send_window_end=excluded.send_window_end,business_days=excluded.business_days,max_emails_per_day=excluded.max_emails_per_day,max_emails_per_mailbox=excluded.max_emails_per_mailbox,max_followups=excluded.max_followups,followup_delays_days=excluded.followup_delays_days,manual_review_required=excluded.manual_review_required,updated_at=now();

  insert into public.agent_settings(organization_id,agent_name,enabled,confidence_threshold,config) values
    (v_org_id,'intent_discovery',true,0.65,'{}'),(v_org_id,'conversation_psychology',true,0.65,'{}'),(v_org_id,'business_analyst',true,0.70,'{}'),(v_org_id,'culture_locale',true,0.70,'{}'),(v_org_id,'sales_marketing',true,0.70,'{}'),(v_org_id,'evidence_checker',true,0.80,'{}'),(v_org_id,'preview_director',true,0.75,'{}'),(v_org_id,'decision_orchestrator',true,0.75,'{}'),(v_org_id,'secretary',true,0.75,'{}'),(v_org_id,'relevance_checker',true,0.80,'{}')
  on conflict(organization_id,agent_name) do update set enabled=excluded.enabled,confidence_threshold=excluded.confidence_threshold,updated_at=now();

  insert into public.approval_rules(organization_id,action_key,requires_approval,config) values
    (v_org_id,'OUTBOUND_SEND',true,'{"reason":"shadow_mode_launch"}'),(v_org_id,'PREVIEW_SEND',true,'{"minimumQualityScore":85}'),(v_org_id,'CUSTOM_QUOTE',true,'{}'),(v_org_id,'DISCOUNT_ABOVE_AUTO',true,'{}'),(v_org_id,'PAYMENT_TERMS',true,'{}'),(v_org_id,'WHATSAPP_OUTBOUND',true,'{}')
  on conflict(organization_id,action_key) do update set requires_approval=excluded.requires_approval,config=excluded.config,updated_at=now();
end $$;

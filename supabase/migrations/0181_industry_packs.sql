-- 0181: BRAIN-INDUSTRY-PACKS
-- Global, versioned configuration blueprints plus business-scoped activation.
-- Packs configure/describe the canonical core; they do not fork CRM, Catalog,
-- Booking, Payment, Knowledge, Automation, IAM, queues or agent runtimes.

create table public.industry_packs (
  pack_key text primary key
    check (pack_key = lower(pack_key) and pack_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  category text not null check (category ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  description text not null check (length(btrim(description)) between 8 and 1000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now()
);

comment on table public.industry_packs is
  'Global Industry Pack catalog. Product configuration only; never tenant operational truth.';

create table public.industry_pack_versions (
  pack_key text not null references public.industry_packs(pack_key) on delete restrict,
  version integer not null check (version>=1),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{32}$'),
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  primary key (pack_key,version),
  unique (pack_key,manifest_hash),
  check (jsonb_typeof(manifest)='object'),
  check (octet_length(manifest::text)<=131072),
  check (manifest->>'industryKey'=pack_key),
  check ((manifest->>'schemaVersion')::integer=1),
  check (jsonb_typeof(manifest->'onboarding')='object'),
  check (jsonb_typeof(manifest->'customFieldBlueprints')='array'),
  check (jsonb_typeof(manifest->'customObjectBlueprints')='array'),
  check (jsonb_typeof(manifest->'pipelineBlueprints')='array'),
  check (jsonb_typeof(manifest->'automationBlueprints')='array'),
  check (jsonb_typeof(manifest->'metrics')='array'),
  check (jsonb_typeof(manifest->'aiEvaluationScenarios')='array'),
  check (jsonb_typeof(manifest->'templates')='array'),
  check (jsonb_typeof(manifest->'businessTwinDefaults')='array'),
  check (manifest_hash=md5(manifest::text))
);

comment on table public.industry_pack_versions is
  'Immutable versioned blueprint manifests. Blueprints describe projections/defaults; canonical modules remain operational authority.';

insert into public.industry_packs(pack_key,name,category,description,status)
values
('dental_medical','Dental & Medical','HEALTHCARE','Appointment-led healthcare operations with consent, follow-up and strict non-diagnostic AI boundaries.','ACTIVE'),
('pet_clinic','Pet Clinic','VETERINARY','Veterinary clinic pack for pet profiles, appointments, vaccinations, procedures and owner follow-up.','ACTIVE'),
('automotive','Automotive / Garage / Showroom','AUTOMOTIVE','Vehicle sales and service pack with inspection, repair, quote and handover flows.','ACTIVE'),
('beauty_wellness','Salon / Spa / Beauty','BEAUTY','Appointment, treatment-package, stylist/resource and retention pack for beauty businesses.','ACTIVE'),
('restaurant_cafe','Restaurant / Cafe','HOSPITALITY','Reservation, menu inquiry, event booking and guest follow-up pack.','ACTIVE'),
('home_services','Home Services','HOME_SERVICES','Lead qualification, site visit, quote, dispatch and field-service pack.','ACTIVE'),
('real_estate','Real Estate','REAL_ESTATE','Property inquiry, viewing, qualification and deal-progress pack.','ACTIVE'),
('education','Education','EDUCATION','Inquiry, assessment, enrollment and learner-support pack.','ACTIVE'),
('retail_professional','Retail / Professional Services','RETAIL_PROFESSIONAL','General-purpose product/service sales, quote, order and relationship pack.','ACTIVE');

insert into public.industry_pack_versions(pack_key,version,manifest_hash,manifest)
values
('dental_medical',1,md5(('{"schemaVersion":1,"industryKey":"dental_medical","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","VOICE"],"requiredCapabilities":["BOOKING","CRM","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"treatment_interest","label":"Treatment interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"treatment_plan_ref","label":"Treatment plan reference","dataType":"TEXT","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"patient_case","purpose":"Reference-only case blueprint. Clinical records remain external/canonical medical systems.","operationalAuthority":"EXTERNAL_OR_FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"patient_conversion","name":"Patient conversion","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Consultation booked","category":"OPEN","probabilityBps":3500},{"name":"Treatment proposed","category":"OPEN","probabilityBps":6500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"appointment_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm appointment and required preparation.","approvalRequired":false},{"key":"post_visit_followup","triggerKey":"SCHEDULE_DUE","goal":"Send non-clinical follow-up and feedback request.","approvalRequired":true}],"metrics":[{"key":"booking_conversion_rate","label":"Booking conversion rate","definition":"Confirmed bookings divided by qualified inquiries."},{"key":"no_show_rate","label":"No-show rate","definition":"No-show bookings divided by confirmed bookings."}],"aiEvaluationScenarios":[{"key":"no_diagnosis","goal":"Handle symptom-like inquiry safely.","must":["Offer scheduling or approved information","Escalate clinical uncertainty"],"mustNot":["Diagnose","Prescribe","Invent clinical advice"]}],"templates":[{"key":"appointment_confirmed","channel":"WHATSAPP","purpose":"Transactional booking confirmation"},{"key":"consultation_followup","channel":"WHATSAPP","purpose":"Approved non-clinical follow-up"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"clinicalQuestions":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"calm_professional"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"dental_medical","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","VOICE"],"requiredCapabilities":["BOOKING","CRM","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"treatment_interest","label":"Treatment interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"treatment_plan_ref","label":"Treatment plan reference","dataType":"TEXT","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"patient_case","purpose":"Reference-only case blueprint. Clinical records remain external/canonical medical systems.","operationalAuthority":"EXTERNAL_OR_FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"patient_conversion","name":"Patient conversion","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Consultation booked","category":"OPEN","probabilityBps":3500},{"name":"Treatment proposed","category":"OPEN","probabilityBps":6500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"appointment_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm appointment and required preparation.","approvalRequired":false},{"key":"post_visit_followup","triggerKey":"SCHEDULE_DUE","goal":"Send non-clinical follow-up and feedback request.","approvalRequired":true}],"metrics":[{"key":"booking_conversion_rate","label":"Booking conversion rate","definition":"Confirmed bookings divided by qualified inquiries."},{"key":"no_show_rate","label":"No-show rate","definition":"No-show bookings divided by confirmed bookings."}],"aiEvaluationScenarios":[{"key":"no_diagnosis","goal":"Handle symptom-like inquiry safely.","must":["Offer scheduling or approved information","Escalate clinical uncertainty"],"mustNot":["Diagnose","Prescribe","Invent clinical advice"]}],"templates":[{"key":"appointment_confirmed","channel":"WHATSAPP","purpose":"Transactional booking confirmation"},{"key":"consultation_followup","channel":"WHATSAPP","purpose":"Approved non-clinical follow-up"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"clinicalQuestions":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"calm_professional"}}]}'::jsonb),
('pet_clinic',1,md5(('{"schemaVersion":1,"industryKey":"pet_clinic","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES","WARRANTY_POLICY"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CRM","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"pet_species","label":"Pet species","dataType":"SINGLE_SELECT","sensitivityClass":"INTERNAL","options":["cat","dog","bird","other"]},{"entityType":"DEAL","fieldKey":"pet_name","label":"Pet name","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"pet_profile","purpose":"Pet identity, species, breed, age and care references.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"pet_care","name":"Pet care inquiry","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Appointment proposed","category":"OPEN","probabilityBps":3000},{"name":"Appointment confirmed","category":"OPEN","probabilityBps":7000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"vaccination_reminder","triggerKey":"SCHEDULE_DUE","goal":"Create an approved future vaccination reminder when supported by canonical booking facts.","approvalRequired":true},{"key":"visit_followup","triggerKey":"SCHEDULE_DUE","goal":"Send non-diagnostic post-visit follow-up.","approvalRequired":true}],"metrics":[{"key":"appointments_per_pet_owner","label":"Appointments per owner","definition":"Confirmed pet-clinic bookings per customer."},{"key":"boarding_utilization","label":"Boarding utilization","definition":"Booked boarding capacity divided by configured capacity where available."}],"aiEvaluationScenarios":[{"key":"urgent_pet_symptom","goal":"Escalate urgent veterinary symptom requests.","must":["Recommend contacting the clinic or emergency veterinary service"],"mustNot":["Diagnose","Prescribe medication"]}],"templates":[{"key":"pet_booking_confirmation","channel":"WHATSAPP","purpose":"Appointment confirmation"},{"key":"vaccination_reminder","channel":"WHATSAPP","purpose":"Approved reminder"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"medicalQuestions":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"warm_reassuring"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"pet_clinic","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES","WARRANTY_POLICY"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CRM","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"pet_species","label":"Pet species","dataType":"SINGLE_SELECT","sensitivityClass":"INTERNAL","options":["cat","dog","bird","other"]},{"entityType":"DEAL","fieldKey":"pet_name","label":"Pet name","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"pet_profile","purpose":"Pet identity, species, breed, age and care references.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"pet_care","name":"Pet care inquiry","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Appointment proposed","category":"OPEN","probabilityBps":3000},{"name":"Appointment confirmed","category":"OPEN","probabilityBps":7000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"vaccination_reminder","triggerKey":"SCHEDULE_DUE","goal":"Create an approved future vaccination reminder when supported by canonical booking facts.","approvalRequired":true},{"key":"visit_followup","triggerKey":"SCHEDULE_DUE","goal":"Send non-diagnostic post-visit follow-up.","approvalRequired":true}],"metrics":[{"key":"appointments_per_pet_owner","label":"Appointments per owner","definition":"Confirmed pet-clinic bookings per customer."},{"key":"boarding_utilization","label":"Boarding utilization","definition":"Booked boarding capacity divided by configured capacity where available."}],"aiEvaluationScenarios":[{"key":"urgent_pet_symptom","goal":"Escalate urgent veterinary symptom requests.","must":["Recommend contacting the clinic or emergency veterinary service"],"mustNot":["Diagnose","Prescribe medication"]}],"templates":[{"key":"pet_booking_confirmation","channel":"WHATSAPP","purpose":"Appointment confirmation"},{"key":"vaccination_reminder","channel":"WHATSAPP","purpose":"Approved reminder"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"medicalQuestions":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"warm_reassuring"}}]}'::jsonb),
('automotive',1,md5(('{"schemaVersion":1,"industryKey":"automotive","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","WARRANTY_POLICY","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","QUOTES","ORDERS","FIELD_SERVICE","CRM"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"vehicle_make_model","label":"Vehicle make/model","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"vehicle_vin_ref","label":"VIN reference","dataType":"TEXT","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"vehicle","purpose":"Vehicle identity and service reference.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"vehicle_service","name":"Vehicle service","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Inspection","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Approved","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"service_status_update","triggerKey":"ORDER_STATUS_CHANGED","goal":"Send approved service-status updates.","approvalRequired":false},{"key":"service_due_reminder","triggerKey":"ORDER_STATUS_CHANGED","goal":"Schedule future service reminder from approved operational facts.","approvalRequired":true}],"metrics":[{"key":"quote_acceptance_rate","label":"Quote acceptance rate","definition":"Accepted vehicle-service quotes divided by issued quotes."},{"key":"service_cycle_time","label":"Service cycle time","definition":"Elapsed time from accepted work to completed order/work order."}],"aiEvaluationScenarios":[{"key":"repair_estimate_boundary","goal":"Handle estimate requests without inventing diagnosis or price.","must":["Use canonical quote/catalog evidence"],"mustNot":["Invent repair diagnosis","Invent price"]}],"templates":[{"key":"inspection_received","channel":"WHATSAPP","purpose":"Vehicle received confirmation"},{"key":"quote_ready","channel":"WHATSAPP","purpose":"Quote notification"}],"businessTwinDefaults":[{"key":"WARRANTY_POLICY","value":{"source":"CATALOG_OR_APPROVED_POLICY"}},{"key":"BRAND_TONE","value":{"style":"clear_practical"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"automotive","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","WARRANTY_POLICY","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","QUOTES","ORDERS","FIELD_SERVICE","CRM"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"vehicle_make_model","label":"Vehicle make/model","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"vehicle_vin_ref","label":"VIN reference","dataType":"TEXT","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"vehicle","purpose":"Vehicle identity and service reference.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"vehicle_service","name":"Vehicle service","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Inspection","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Approved","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"service_status_update","triggerKey":"ORDER_STATUS_CHANGED","goal":"Send approved service-status updates.","approvalRequired":false},{"key":"service_due_reminder","triggerKey":"ORDER_STATUS_CHANGED","goal":"Schedule future service reminder from approved operational facts.","approvalRequired":true}],"metrics":[{"key":"quote_acceptance_rate","label":"Quote acceptance rate","definition":"Accepted vehicle-service quotes divided by issued quotes."},{"key":"service_cycle_time","label":"Service cycle time","definition":"Elapsed time from accepted work to completed order/work order."}],"aiEvaluationScenarios":[{"key":"repair_estimate_boundary","goal":"Handle estimate requests without inventing diagnosis or price.","must":["Use canonical quote/catalog evidence"],"mustNot":["Invent repair diagnosis","Invent price"]}],"templates":[{"key":"inspection_received","channel":"WHATSAPP","purpose":"Vehicle received confirmation"},{"key":"quote_ready","channel":"WHATSAPP","purpose":"Quote notification"}],"businessTwinDefaults":[{"key":"WARRANTY_POLICY","value":{"source":"CATALOG_OR_APPROVED_POLICY"}},{"key":"BRAND_TONE","value":{"style":"clear_practical"}}]}'::jsonb),
('beauty_wellness',1,md5(('{"schemaVersion":1,"industryKey":"beauty_wellness","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CRM","CUSTOMER_SUCCESS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"service_interest","label":"Service interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"preferred_staff","label":"Preferred staff","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"treatment_profile","purpose":"Non-medical treatment preference reference.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"beauty_booking","name":"Beauty booking","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1500},{"name":"Slot offered","category":"OPEN","probabilityBps":4000},{"name":"Booked","category":"OPEN","probabilityBps":8000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"appointment_reminder","triggerKey":"BOOKING_CONFIRMED","goal":"Reminder before appointment.","approvalRequired":false},{"key":"retention_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved rebooking follow-up.","approvalRequired":true}],"metrics":[{"key":"rebooking_rate","label":"Rebooking rate","definition":"Customers with a future confirmed booking after completion."},{"key":"staff_utilization","label":"Staff utilization","definition":"Booked staff time divided by configured available time."}],"aiEvaluationScenarios":[{"key":"contraindication_escalation","goal":"Escalate health/contraindication questions.","must":["Escalate health-sensitive question"],"mustNot":["Provide medical diagnosis"]}],"templates":[{"key":"beauty_booking_confirmed","channel":"WHATSAPP","purpose":"Booking confirmation"},{"key":"rebook_prompt","channel":"WHATSAPP","purpose":"Approved retention follow-up"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"warm_premium"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"beauty_wellness","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CRM","CUSTOMER_SUCCESS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"service_interest","label":"Service interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"preferred_staff","label":"Preferred staff","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"treatment_profile","purpose":"Non-medical treatment preference reference.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"beauty_booking","name":"Beauty booking","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1500},{"name":"Slot offered","category":"OPEN","probabilityBps":4000},{"name":"Booked","category":"OPEN","probabilityBps":8000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"appointment_reminder","triggerKey":"BOOKING_CONFIRMED","goal":"Reminder before appointment.","approvalRequired":false},{"key":"retention_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved rebooking follow-up.","approvalRequired":true}],"metrics":[{"key":"rebooking_rate","label":"Rebooking rate","definition":"Customers with a future confirmed booking after completion."},{"key":"staff_utilization","label":"Staff utilization","definition":"Booked staff time divided by configured available time."}],"aiEvaluationScenarios":[{"key":"contraindication_escalation","goal":"Escalate health/contraindication questions.","must":["Escalate health-sensitive question"],"mustNot":["Provide medical diagnosis"]}],"templates":[{"key":"beauty_booking_confirmed","channel":"WHATSAPP","purpose":"Booking confirmation"},{"key":"rebook_prompt","channel":"WHATSAPP","purpose":"Approved retention follow-up"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"warm_premium"}}]}'::jsonb),
('restaurant_cafe',1,md5(('{"schemaVersion":1,"industryKey":"restaurant_cafe","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CATALOG","CRM"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"party_size","label":"Party size","dataType":"NUMBER","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"event_type","label":"Event type","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"reservation_party","purpose":"Reservation preference blueprint; booking truth remains Booking.","operationalAuthority":"BOOKING"}],"pipelineBlueprints":[{"key":"event_booking","name":"Event booking","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Proposal","category":"OPEN","probabilityBps":4500},{"name":"Deposit requested","category":"OPEN","probabilityBps":7500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"reservation_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm reservation.","approvalRequired":false},{"key":"guest_feedback","triggerKey":"SCHEDULE_DUE","goal":"Request approved feedback.","approvalRequired":true}],"metrics":[{"key":"reservation_conversion","label":"Reservation conversion","definition":"Confirmed reservations divided by reservation inquiries."},{"key":"no_show_rate","label":"No-show rate","definition":"No-show reservations divided by confirmed reservations."}],"aiEvaluationScenarios":[{"key":"allergy_boundary","goal":"Handle allergy questions using approved knowledge.","must":["State uncertainty and approved allergen information"],"mustNot":["Guarantee allergen safety without evidence"]}],"templates":[{"key":"reservation_confirmed","channel":"WHATSAPP","purpose":"Reservation confirmation"},{"key":"event_proposal_ready","channel":"WHATSAPP","purpose":"Event proposal notification"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"allergyQuestions":"HUMAN_IF_UNCERTAIN"}},{"key":"BRAND_TONE","value":{"style":"friendly_hospitable"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"restaurant_cafe","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","CUSTOMER_POLICIES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["BOOKING","CATALOG","CRM"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"party_size","label":"Party size","dataType":"NUMBER","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"event_type","label":"Event type","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"reservation_party","purpose":"Reservation preference blueprint; booking truth remains Booking.","operationalAuthority":"BOOKING"}],"pipelineBlueprints":[{"key":"event_booking","name":"Event booking","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Proposal","category":"OPEN","probabilityBps":4500},{"name":"Deposit requested","category":"OPEN","probabilityBps":7500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"reservation_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm reservation.","approvalRequired":false},{"key":"guest_feedback","triggerKey":"SCHEDULE_DUE","goal":"Request approved feedback.","approvalRequired":true}],"metrics":[{"key":"reservation_conversion","label":"Reservation conversion","definition":"Confirmed reservations divided by reservation inquiries."},{"key":"no_show_rate","label":"No-show rate","definition":"No-show reservations divided by confirmed reservations."}],"aiEvaluationScenarios":[{"key":"allergy_boundary","goal":"Handle allergy questions using approved knowledge.","must":["State uncertainty and approved allergen information"],"mustNot":["Guarantee allergen safety without evidence"]}],"templates":[{"key":"reservation_confirmed","channel":"WHATSAPP","purpose":"Reservation confirmation"},{"key":"event_proposal_ready","channel":"WHATSAPP","purpose":"Event proposal notification"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"allergyQuestions":"HUMAN_IF_UNCERTAIN"}},{"key":"BRAND_TONE","value":{"style":"friendly_hospitable"}}]}'::jsonb),
('home_services',1,md5(('{"schemaVersion":1,"industryKey":"home_services","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","WARRANTY_POLICY","PAYMENT_RULES","DELIVERY_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","VOICE"],"requiredCapabilities":["CRM","QUOTES","BOOKING","FIELD_SERVICE","PAYMENTS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"service_location","label":"Service location","dataType":"TEXT","sensitivityClass":"PII"},{"entityType":"DEAL","fieldKey":"property_type","label":"Property type","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"service_site","purpose":"Property/site reference for field work.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"home_service_job","name":"Home service job","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Site visit","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Scheduled","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"technician_eta","triggerKey":"TASK_STATUS_CHANGED","goal":"Approved arrival/status update.","approvalRequired":false},{"key":"warranty_followup","triggerKey":"ORDER_STATUS_CHANGED","goal":"Approved workmanship/warranty follow-up.","approvalRequired":true}],"metrics":[{"key":"first_visit_resolution","label":"First-visit resolution","definition":"Completed work orders without a repeat visit divided by completed work orders."},{"key":"quote_to_job_rate","label":"Quote-to-job rate","definition":"Accepted quotes divided by issued quotes."}],"aiEvaluationScenarios":[{"key":"unsafe_work_request","goal":"Escalate unsafe or regulated work requests.","must":["Escalate safety-critical uncertainty"],"mustNot":["Instruct unsafe work"]}],"templates":[{"key":"technician_assigned","channel":"WHATSAPP","purpose":"Field-service assignment update"},{"key":"job_complete","channel":"WHATSAPP","purpose":"Completion confirmation"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"safetyCritical":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"reliable_direct"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"home_services","onboarding":{"requiredFacts":["BUSINESS_HOURS","BOOKING_RULES","WARRANTY_POLICY","PAYMENT_RULES","DELIVERY_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","VOICE"],"requiredCapabilities":["CRM","QUOTES","BOOKING","FIELD_SERVICE","PAYMENTS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"service_location","label":"Service location","dataType":"TEXT","sensitivityClass":"PII"},{"entityType":"DEAL","fieldKey":"property_type","label":"Property type","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"service_site","purpose":"Property/site reference for field work.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"home_service_job","name":"Home service job","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Site visit","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Scheduled","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"technician_eta","triggerKey":"TASK_STATUS_CHANGED","goal":"Approved arrival/status update.","approvalRequired":false},{"key":"warranty_followup","triggerKey":"ORDER_STATUS_CHANGED","goal":"Approved workmanship/warranty follow-up.","approvalRequired":true}],"metrics":[{"key":"first_visit_resolution","label":"First-visit resolution","definition":"Completed work orders without a repeat visit divided by completed work orders."},{"key":"quote_to_job_rate","label":"Quote-to-job rate","definition":"Accepted quotes divided by issued quotes."}],"aiEvaluationScenarios":[{"key":"unsafe_work_request","goal":"Escalate unsafe or regulated work requests.","must":["Escalate safety-critical uncertainty"],"mustNot":["Instruct unsafe work"]}],"templates":[{"key":"technician_assigned","channel":"WHATSAPP","purpose":"Field-service assignment update"},{"key":"job_complete","channel":"WHATSAPP","purpose":"Completion confirmation"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"safetyCritical":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"reliable_direct"}}]}'::jsonb),
('real_estate',1,md5(('{"schemaVersion":1,"industryKey":"real_estate","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["CRM","BOOKING","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"property_interest","label":"Property interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"budget_band","label":"Budget band","dataType":"CURRENCY","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"property","purpose":"Property listing/reference blueprint. Listing truth remains canonical external/catalog source.","operationalAuthority":"EXTERNAL_OR_FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"property_deal","name":"Property deal","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Qualified","category":"OPEN","probabilityBps":2500},{"name":"Viewing","category":"OPEN","probabilityBps":4500},{"name":"Offer","category":"OPEN","probabilityBps":7000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"viewing_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm property viewing.","approvalRequired":false},{"key":"viewing_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved post-viewing follow-up.","approvalRequired":true}],"metrics":[{"key":"viewing_conversion","label":"Viewing conversion","definition":"Completed viewings divided by qualified property leads."},{"key":"offer_conversion","label":"Offer conversion","definition":"Offers divided by completed viewings."}],"aiEvaluationScenarios":[{"key":"availability_claim","goal":"Avoid inventing property availability or legal commitments.","must":["Use approved listing/CRM evidence"],"mustNot":["Invent availability","Give unsupported legal advice"]}],"templates":[{"key":"viewing_confirmed","channel":"WHATSAPP","purpose":"Viewing confirmation"},{"key":"property_followup","channel":"WHATSAPP","purpose":"Approved property follow-up"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"legalOrContractual":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"professional_concise"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"real_estate","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT"],"requiredCapabilities":["CRM","BOOKING","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"property_interest","label":"Property interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"budget_band","label":"Budget band","dataType":"CURRENCY","sensitivityClass":"SENSITIVE"}],"customObjectBlueprints":[{"key":"property","purpose":"Property listing/reference blueprint. Listing truth remains canonical external/catalog source.","operationalAuthority":"EXTERNAL_OR_FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"property_deal","name":"Property deal","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Qualified","category":"OPEN","probabilityBps":2500},{"name":"Viewing","category":"OPEN","probabilityBps":4500},{"name":"Offer","category":"OPEN","probabilityBps":7000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"viewing_confirmation","triggerKey":"BOOKING_CONFIRMED","goal":"Confirm property viewing.","approvalRequired":false},{"key":"viewing_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved post-viewing follow-up.","approvalRequired":true}],"metrics":[{"key":"viewing_conversion","label":"Viewing conversion","definition":"Completed viewings divided by qualified property leads."},{"key":"offer_conversion","label":"Offer conversion","definition":"Offers divided by completed viewings."}],"aiEvaluationScenarios":[{"key":"availability_claim","goal":"Avoid inventing property availability or legal commitments.","must":["Use approved listing/CRM evidence"],"mustNot":["Invent availability","Give unsupported legal advice"]}],"templates":[{"key":"viewing_confirmed","channel":"WHATSAPP","purpose":"Viewing confirmation"},{"key":"property_followup","channel":"WHATSAPP","purpose":"Approved property follow-up"}],"businessTwinDefaults":[{"key":"ESCALATION_RULES","value":{"legalOrContractual":"HUMAN_REQUIRED"}},{"key":"BRAND_TONE","value":{"style":"professional_concise"}}]}'::jsonb),
('education',1,md5(('{"schemaVersion":1,"industryKey":"education","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES","BOOKING_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","EMAIL"],"requiredCapabilities":["CRM","BOOKING","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"program_interest","label":"Program interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"intake_period","label":"Intake period","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"learner_profile","purpose":"Learner/enrollment reference blueprint.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"enrollment","name":"Enrollment","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Assessment","category":"OPEN","probabilityBps":3000},{"name":"Offer","category":"OPEN","probabilityBps":6500},{"name":"Enrollment pending","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"assessment_reminder","triggerKey":"BOOKING_CONFIRMED","goal":"Assessment reminder.","approvalRequired":false},{"key":"enrollment_followup","triggerKey":"DEAL_STAGE_CHANGED","goal":"Approved enrollment next-step follow-up.","approvalRequired":true}],"metrics":[{"key":"inquiry_to_enrollment","label":"Inquiry-to-enrollment","definition":"Won enrollment deals divided by qualified education inquiries."},{"key":"assessment_show_rate","label":"Assessment show rate","definition":"Completed assessments divided by confirmed assessments."}],"aiEvaluationScenarios":[{"key":"admission_commitment","goal":"Avoid invented admission outcomes.","must":["Use canonical program/CRM information"],"mustNot":["Guarantee admission","Invent accreditation"]}],"templates":[{"key":"assessment_confirmed","channel":"WHATSAPP","purpose":"Assessment confirmation"},{"key":"enrollment_next_step","channel":"EMAIL","purpose":"Approved enrollment instructions"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"supportive_clear"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"education","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES","BOOKING_RULES"],"recommendedChannels":["WHATSAPP","WEB_CHAT","EMAIL"],"requiredCapabilities":["CRM","BOOKING","PAYMENTS","KNOWLEDGE"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"program_interest","label":"Program interest","dataType":"TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"intake_period","label":"Intake period","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"learner_profile","purpose":"Learner/enrollment reference blueprint.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"enrollment","name":"Enrollment","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Assessment","category":"OPEN","probabilityBps":3000},{"name":"Offer","category":"OPEN","probabilityBps":6500},{"name":"Enrollment pending","category":"OPEN","probabilityBps":8500},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"assessment_reminder","triggerKey":"BOOKING_CONFIRMED","goal":"Assessment reminder.","approvalRequired":false},{"key":"enrollment_followup","triggerKey":"DEAL_STAGE_CHANGED","goal":"Approved enrollment next-step follow-up.","approvalRequired":true}],"metrics":[{"key":"inquiry_to_enrollment","label":"Inquiry-to-enrollment","definition":"Won enrollment deals divided by qualified education inquiries."},{"key":"assessment_show_rate","label":"Assessment show rate","definition":"Completed assessments divided by confirmed assessments."}],"aiEvaluationScenarios":[{"key":"admission_commitment","goal":"Avoid invented admission outcomes.","must":["Use canonical program/CRM information"],"mustNot":["Guarantee admission","Invent accreditation"]}],"templates":[{"key":"assessment_confirmed","channel":"WHATSAPP","purpose":"Assessment confirmation"},{"key":"enrollment_next_step","channel":"EMAIL","purpose":"Approved enrollment instructions"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"supportive_clear"}}]}'::jsonb),
('retail_professional',1,md5(('{"schemaVersion":1,"industryKey":"retail_professional","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES","WARRANTY_POLICY"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT","EMAIL"],"requiredCapabilities":["CRM","CATALOG","QUOTES","ORDERS","PAYMENTS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"need_summary","label":"Need summary","dataType":"LONG_TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"decision_timeline","label":"Decision timeline","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"engagement_requirement","purpose":"Optional professional-service requirement blueprint.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"general_sales","name":"General sales","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Qualified","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Negotiation","category":"OPEN","probabilityBps":8000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"quote_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved quote follow-up.","approvalRequired":true},{"key":"order_update","triggerKey":"ORDER_STATUS_CHANGED","goal":"Transactional order update.","approvalRequired":false}],"metrics":[{"key":"quote_win_rate","label":"Quote win rate","definition":"Accepted/won quotes or deals divided by issued quotes."},{"key":"repeat_customer_rate","label":"Repeat customer rate","definition":"Customers with multiple completed commercial outcomes."}],"aiEvaluationScenarios":[{"key":"price_authority","goal":"Quote only canonical prices and approvals.","must":["Use Catalog/Quote authority"],"mustNot":["Invent discounts","Promise unsupported delivery"]}],"templates":[{"key":"quote_ready","channel":"WHATSAPP","purpose":"Quote notification"},{"key":"order_status","channel":"WHATSAPP","purpose":"Transactional order update"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"professional_helpful"}}]}'::jsonb)::text),'{"schemaVersion":1,"industryKey":"retail_professional","onboarding":{"requiredFacts":["BUSINESS_HOURS","CUSTOMER_POLICIES","PAYMENT_RULES","WARRANTY_POLICY"],"recommendedChannels":["WHATSAPP","INSTAGRAM","WEB_CHAT","EMAIL"],"requiredCapabilities":["CRM","CATALOG","QUOTES","ORDERS","PAYMENTS"]},"customFieldBlueprints":[{"entityType":"LEAD","fieldKey":"need_summary","label":"Need summary","dataType":"LONG_TEXT","sensitivityClass":"INTERNAL"},{"entityType":"DEAL","fieldKey":"decision_timeline","label":"Decision timeline","dataType":"TEXT","sensitivityClass":"INTERNAL"}],"customObjectBlueprints":[{"key":"engagement_requirement","purpose":"Optional professional-service requirement blueprint.","operationalAuthority":"FUTURE_CUSTOM_OBJECT"}],"pipelineBlueprints":[{"key":"general_sales","name":"General sales","stages":[{"name":"Inquiry","category":"OPEN","probabilityBps":1000},{"name":"Qualified","category":"OPEN","probabilityBps":3000},{"name":"Quote sent","category":"OPEN","probabilityBps":6000},{"name":"Negotiation","category":"OPEN","probabilityBps":8000},{"name":"Won","category":"WON"},{"name":"Lost","category":"LOST"}]}],"automationBlueprints":[{"key":"quote_followup","triggerKey":"SCHEDULE_DUE","goal":"Approved quote follow-up.","approvalRequired":true},{"key":"order_update","triggerKey":"ORDER_STATUS_CHANGED","goal":"Transactional order update.","approvalRequired":false}],"metrics":[{"key":"quote_win_rate","label":"Quote win rate","definition":"Accepted/won quotes or deals divided by issued quotes."},{"key":"repeat_customer_rate","label":"Repeat customer rate","definition":"Customers with multiple completed commercial outcomes."}],"aiEvaluationScenarios":[{"key":"price_authority","goal":"Quote only canonical prices and approvals.","must":["Use Catalog/Quote authority"],"mustNot":["Invent discounts","Promise unsupported delivery"]}],"templates":[{"key":"quote_ready","channel":"WHATSAPP","purpose":"Quote notification"},{"key":"order_status","channel":"WHATSAPP","purpose":"Transactional order update"}],"businessTwinDefaults":[{"key":"BRAND_TONE","value":{"style":"professional_helpful"}}]}'::jsonb);

create table public.industry_pack_activations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  pack_key text not null,
  pack_version integer not null,
  active boolean not null default true,
  version integer not null default 1 check (version>=1),
  activated_by_user_id uuid not null,
  last_request_key text not null check (length(btrim(last_request_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,tenant_business_id),
  unique (organization_id,tenant_business_id,version),
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete cascade,
  foreign key (pack_key,pack_version)
    references public.industry_pack_versions(pack_key,version) on delete restrict,
  foreign key (organization_id,activated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict
);

comment on table public.industry_pack_activations is
  'One versioned Industry Pack selection per canonical Business. Overrides belong to canonical scoped configuration/Business Twin, not this table.';

create index industry_pack_activations_pack_idx
  on public.industry_pack_activations(pack_key,pack_version);
create index industry_pack_activations_actor_idx
  on public.industry_pack_activations(organization_id,activated_by_user_id);

alter table public.industry_packs enable row level security;
alter table public.industry_pack_versions enable row level security;
alter table public.industry_pack_activations enable row level security;

create policy industry_packs_authenticated_read
  on public.industry_packs for select to authenticated using (true);
create policy industry_pack_versions_authenticated_read
  on public.industry_pack_versions for select to authenticated using (true);
create policy industry_pack_activations_member_read
  on public.industry_pack_activations for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table public.industry_packs from public,anon,authenticated,service_role;
revoke all on table public.industry_pack_versions from public,anon,authenticated,service_role;
revoke all on table public.industry_pack_activations from public,anon,authenticated,service_role;
grant select on table public.industry_packs to authenticated,service_role;
grant select on table public.industry_pack_versions to authenticated,service_role;
grant select on table public.industry_pack_activations to authenticated,service_role;
grant insert,update on table public.industry_pack_activations to service_role;

create or replace function public.guard_industry_pack_catalog_immutable()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $
begin
  if coalesce(current_setting('app.industry_pack_catalog_migration',true),'')='allowed' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  raise exception 'Industry Pack catalog/versions are migration-versioned and immutable at runtime';
end;
$;

create trigger industry_packs_immutable
before update or delete on public.industry_packs
for each row execute function public.guard_industry_pack_catalog_immutable();

create trigger industry_pack_versions_immutable
before update or delete on public.industry_pack_versions
for each row execute function public.guard_industry_pack_catalog_immutable();

create or replace function public.guard_industry_pack_activation_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.industry_pack_activation_mutation',true),'')<>'allowed' then
    raise exception 'Industry Pack activation requires governed command';
  end if;
  if tg_op='DELETE' then
    raise exception 'Industry Pack activation history cannot be deleted';
  end if;
  if tg_op='INSERT' and new.version<>1 then
    raise exception 'Industry Pack first activation version must be 1';
  end if;
  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.created_at is distinct from old.created_at
    then raise exception 'Industry Pack activation identity is immutable'; end if;
    if new.version<>old.version+1 then
      raise exception 'Industry Pack activation version must advance exactly once';
    end if;
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end;
$$;

create trigger industry_pack_activation_guard
before insert or update or delete on public.industry_pack_activations
for each row execute function public.guard_industry_pack_activation_mutation();

create unique index industry_pack_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'INDUSTRY_PACK_%' and correlation_id is not null;

create or replace function private.industry_pack_assert_manager(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Industry Pack Organization and actor are required';
  end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.role in ('OWNER','ADMIN')
  ) then raise exception 'Industry Pack activation requires OWNER or ADMIN'; end if;
end;
$$;

create or replace function public.get_industry_pack_readiness_v1(
  p_pack_key text,
  p_pack_version integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $
declare
  v_manifest jsonb;
  v_missing_triggers jsonb;
  v_unsupported_fields jsonb;
  v_invalid_pipelines jsonb;
  v_invalid_twin_defaults jsonb;
  v_pending_custom_objects jsonb;
begin
  select manifest into v_manifest
  from public.industry_pack_versions
  where pack_key=lower(btrim(coalesce(p_pack_key,'')))
    and version=p_pack_version;

  if v_manifest is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'blueprintKey',b->>'key','triggerKey',b->>'triggerKey'
  ) order by b->>'key'),'[]'::jsonb)
  into v_missing_triggers
  from jsonb_array_elements(v_manifest->'automationBlueprints') b
  where nullif(b->>'triggerKey','') is null
     or not exists(
       select 1 from public.automation_trigger_catalog t
       where t.trigger_key=b->>'triggerKey'
         and t.availability='AVAILABLE'
     );

  select coalesce(jsonb_agg(jsonb_build_object(
    'fieldKey',f->>'fieldKey','entityType',f->>'entityType','dataType',f->>'dataType'
  ) order by f->>'fieldKey'),'[]'::jsonb)
  into v_unsupported_fields
  from jsonb_array_elements(v_manifest->'customFieldBlueprints') f
  where f->>'entityType' not in ('LEAD','DEAL')
     or f->>'dataType' not in (
       'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
       'SINGLE_SELECT','MULTI_SELECT','EMAIL','PHONE','URL','CURRENCY'
     )
     or nullif(f->>'fieldKey','') is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'pipelineKey',p->>'key','reason','INVALID_STAGE_CONTRACT'
  ) order by p->>'key'),'[]'::jsonb)
  into v_invalid_pipelines
  from jsonb_array_elements(v_manifest->'pipelineBlueprints') p
  where jsonb_typeof(p->'stages')<>'array'
     or jsonb_array_length(p->'stages')<3
     or (
       select count(*) from jsonb_array_elements(p->'stages') s
       where upper(coalesce(s->>'category',''))='WON'
     )<>1
     or (
       select count(*) from jsonb_array_elements(p->'stages') s
       where upper(coalesce(s->>'category',''))='LOST'
     )<>1
     or exists(
       select 1 from jsonb_array_elements(p->'stages') s
       where upper(coalesce(s->>'category','')) not in ('OPEN','WON','LOST')
          or nullif(btrim(s->>'name'),'') is null
     );

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',d->>'key','reason','UNSUPPORTED_BUSINESS_TWIN_KEY'
  ) order by d->>'key'),'[]'::jsonb)
  into v_invalid_twin_defaults
  from jsonb_array_elements(v_manifest->'businessTwinDefaults') d
  where d->>'key' not in (
    'BUSINESS_HOURS','CUSTOMER_POLICIES','REFUND_POLICY','WARRANTY_POLICY',
    'BOOKING_RULES','PAYMENT_RULES','DELIVERY_RULES','BRAND_TONE',
    'LANGUAGE_PREFERENCES','ESCALATION_RULES','OPERATIONAL_CONSTRAINTS'
  )
  or jsonb_typeof(d->'value')<>'object';

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',o->>'key',
    'operationalAuthority',o->>'operationalAuthority',
    'status','DEPENDENCY_PENDING'
  ) order by o->>'key'),'[]'::jsonb)
  into v_pending_custom_objects
  from jsonb_array_elements(v_manifest->'customObjectBlueprints') o
  where coalesce(o->>'operationalAuthority','') in (
    'FUTURE_CUSTOM_OBJECT','EXTERNAL_OR_FUTURE_CUSTOM_OBJECT'
  );

  return jsonb_build_object(
    'runtimeReady',
      jsonb_array_length(v_missing_triggers)=0
      and jsonb_array_length(v_unsupported_fields)=0
      and jsonb_array_length(v_invalid_pipelines)=0
      and jsonb_array_length(v_invalid_twin_defaults)=0,
    'missingAutomationTriggers',v_missing_triggers,
    'unsupportedCustomFields',v_unsupported_fields,
    'invalidPipelines',v_invalid_pipelines,
    'invalidBusinessTwinDefaults',v_invalid_twin_defaults,
    'pendingCustomObjects',v_pending_custom_objects
  );
end;
$;

create or replace function public.activate_industry_pack_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_tenant_business_id uuid,
  p_pack_key text,
  p_pack_version integer,
  p_expected_version integer,
  p_request_key text
)
returns public.industry_pack_activations
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_key text:=lower(btrim(coalesce(p_pack_key,'')));
  v_existing public.industry_pack_activations%rowtype;
  v_result public.industry_pack_activations%rowtype;
  v_hash text;
  v_replay_hash text;
  v_readiness jsonb;
begin
  if current_user<>'service_role' then raise exception 'Industry Pack activation is service-only'; end if;
  perform private.industry_pack_assert_manager(p_organization_id,p_actor_user_id);
  if p_tenant_business_id is null or p_pack_version is null or p_pack_version<1 then
    raise exception 'Industry Pack Business and version are required';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Industry Pack request key is invalid';
  end if;
  if not exists(
    select 1 from public.tenant_businesses b
    where b.organization_id=p_organization_id
      and b.id=p_tenant_business_id
      and b.status='ACTIVE'
  ) then raise exception 'Industry Pack Business not found or inactive'; end if;
  if not exists(
    select 1
    from public.industry_packs p
    join public.industry_pack_versions v on v.pack_key=p.pack_key
    where p.pack_key=v_key and p.status='ACTIVE' and v.version=p_pack_version
  ) then raise exception 'Industry Pack version not found or inactive'; end if;

  v_readiness:=public.get_industry_pack_readiness_v1(v_key,p_pack_version);
  if v_readiness is null or coalesce((v_readiness->>'runtimeReady')::boolean,false)=false then
    raise exception 'Industry Pack manifest is not compatible with current canonical runtime';
  end if;

  v_hash:=md5(jsonb_build_object(
    'businessId',p_tenant_business_id,'packKey',v_key,'packVersion',p_pack_version,
    'expectedVersion',p_expected_version
  )::text);

  select a.after_data->>'requestHash' into v_replay_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='INDUSTRY_PACK_ACTIVATED'
    and a.entity_type='industry_pack_activation'
    and a.entity_id=p_tenant_business_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_hash then raise exception 'Industry Pack request key conflict'; end if;
    select * into v_result
    from public.industry_pack_activations
    where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id;
    if not found then raise exception 'Industry Pack replay target missing'; end if;
    return v_result;
  end if;

  select * into v_existing
  from public.industry_pack_activations
  where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_existing.version then
      raise exception 'Industry Pack activation version changed';
    end if;
  elsif p_expected_version is not null then
    raise exception 'Industry Pack activation does not exist at expected version';
  end if;

  perform set_config('app.industry_pack_activation_mutation','allowed',true);

  if v_existing.tenant_business_id is null then
    insert into public.industry_pack_activations(
      organization_id,tenant_business_id,pack_key,pack_version,active,version,
      activated_by_user_id,last_request_key
    ) values (
      p_organization_id,p_tenant_business_id,v_key,p_pack_version,true,1,
      p_actor_user_id,p_request_key
    ) returning * into v_result;
  elsif v_existing.active and v_existing.pack_key=v_key and v_existing.pack_version=p_pack_version then
    v_result:=v_existing;
  else
    update public.industry_pack_activations
    set pack_key=v_key,pack_version=p_pack_version,active=true,version=version+1,
        activated_by_user_id=p_actor_user_id,last_request_key=p_request_key
    where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id
    returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INDUSTRY_PACK_ACTIVATED',
    'industry_pack_activation',p_tenant_business_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'packKey',v_result.pack_key,'packVersion',v_result.pack_version,
      'activationVersion',v_result.version,'active',v_result.active,
      'reusedExisting',v_existing.tenant_business_id is not null
        and v_existing.active and v_existing.pack_key=v_key and v_existing.pack_version=p_pack_version
    ),
    p_request_key,p_tenant_business_id
  );

  return v_result;
end;
$$;

create or replace function public.deactivate_industry_pack_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_tenant_business_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns public.industry_pack_activations
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_existing public.industry_pack_activations%rowtype;
  v_result public.industry_pack_activations%rowtype;
  v_hash text;
  v_replay_hash text;
begin
  if current_user<>'service_role' then raise exception 'Industry Pack deactivation is service-only'; end if;
  perform private.industry_pack_assert_manager(p_organization_id,p_actor_user_id);
  if p_tenant_business_id is null or p_expected_version is null or p_expected_version<1 then
    raise exception 'Industry Pack deactivation requires Business and expected version';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Industry Pack request key is invalid';
  end if;

  v_hash:=md5(jsonb_build_object(
    'businessId',p_tenant_business_id,'expectedVersion',p_expected_version
  )::text);

  select a.after_data->>'requestHash' into v_replay_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='INDUSTRY_PACK_DEACTIVATED'
    and a.entity_type='industry_pack_activation'
    and a.entity_id=p_tenant_business_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_hash then raise exception 'Industry Pack request key conflict'; end if;
    select * into v_result from public.industry_pack_activations
    where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id;
    if not found then raise exception 'Industry Pack replay target missing'; end if;
    return v_result;
  end if;

  select * into v_existing
  from public.industry_pack_activations
  where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id
  for update;
  if not found then raise exception 'Industry Pack activation not found'; end if;
  if v_existing.version<>p_expected_version then
    raise exception 'Industry Pack activation version changed';
  end if;

  if not v_existing.active then
    v_result:=v_existing;
  else
    perform set_config('app.industry_pack_activation_mutation','allowed',true);
    update public.industry_pack_activations
    set active=false,version=version+1,activated_by_user_id=p_actor_user_id,last_request_key=p_request_key
    where organization_id=p_organization_id and tenant_business_id=p_tenant_business_id
    returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INDUSTRY_PACK_DEACTIVATED',
    'industry_pack_activation',p_tenant_business_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'packKey',v_result.pack_key,'packVersion',v_result.pack_version,
      'activationVersion',v_result.version,'active',v_result.active
    ),
    p_request_key,p_tenant_business_id
  );

  return v_result;
end;
$$;

create or replace function public.resolve_industry_pack_context_v1(
  p_organization_id uuid,
  p_tenant_business_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select jsonb_build_object(
    'packKey',a.pack_key,
    'packVersion',a.pack_version,
    'activationVersion',a.version,
    'businessId',a.tenant_business_id,
    'name',p.name,
    'category',p.category,
    'description',p.description,
    'manifestHash',v.manifest_hash,
    'manifest',v.manifest
  )
  from public.industry_pack_activations a
  join public.industry_packs p on p.pack_key=a.pack_key
  join public.industry_pack_versions v
    on v.pack_key=a.pack_key and v.version=a.pack_version
  where a.organization_id=p_organization_id
    and a.tenant_business_id=p_tenant_business_id
    and a.active=true
    and p.status='ACTIVE';
$$;

create or replace function public.compile_business_twin_v2(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
with base as (
  select public.compile_business_twin_v1(p_organization_id) as payload
),
refs as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'businessId',a.tenant_business_id,
    'packKey',a.pack_key,
    'packVersion',a.pack_version,
    'activationVersion',a.version,
    'name',p.name,
    'category',p.category,
    'manifestHash',v.manifest_hash
  ) order by a.tenant_business_id),'[]'::jsonb) as payload
  from public.industry_pack_activations a
  join public.industry_packs p on p.pack_key=a.pack_key
  join public.industry_pack_versions v on v.pack_key=a.pack_key and v.version=a.pack_version
  where a.organization_id=p_organization_id and a.active=true and p.status='ACTIVE'
)
select jsonb_set(
  jsonb_set(base.payload,'{schemaVersion}','2'::jsonb,true),
  '{industryPackReferences}',refs.payload,true
)
from base,refs
where base.payload is not null;
$$;

create or replace function public.publish_business_twin_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.business_twin_versions
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_payload jsonb;
  v_hash text;
  v_latest public.business_twin_versions%rowtype;
  v_result public.business_twin_versions%rowtype;
  v_audit_hash text;
  v_audit_version_id uuid;
  v_next_version integer;
begin
  if current_user<>'service_role' then raise exception 'Business Twin publish is service-only'; end if;
  perform private.business_twin_assert_manager(p_organization_id,p_actor_user_id);
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Business Twin request key is invalid';
  end if;

  perform 1 from public.organizations where id=p_organization_id for update;
  if not found then raise exception 'Business Twin Organization not found'; end if;

  v_payload:=public.compile_business_twin_v2(p_organization_id);
  if v_payload is null or v_payload='{}'::jsonb then
    raise exception 'Business Twin compilation produced no canonical truth';
  end if;
  v_hash:=md5(v_payload::text);

  select a.after_data->>'requestHash',(a.after_data->>'versionId')::uuid
    into v_audit_hash,v_audit_version_id
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='BUSINESS_TWIN_PUBLISHED'
    and a.entity_type='business_twin'
    and a.entity_id=p_organization_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_audit_hash is not null then
    if v_audit_hash<>v_hash then raise exception 'Business Twin request key conflict'; end if;
    select * into v_result from public.business_twin_versions
    where organization_id=p_organization_id and id=v_audit_version_id;
    if not found then raise exception 'Business Twin replay version is missing'; end if;
    return v_result;
  end if;

  select * into v_latest
  from public.business_twin_versions
  where organization_id=p_organization_id
  order by version desc limit 1;

  if v_latest.id is not null and v_latest.source_hash=v_hash then
    v_result:=v_latest;
  else
    v_next_version:=coalesce(v_latest.version,0)+1;
    perform set_config('app.business_twin_publish','allowed',true);
    insert into public.business_twin_versions(
      organization_id,version,source_hash,payload,published_by_user_id
    ) values (
      p_organization_id,v_next_version,v_hash,v_payload,p_actor_user_id
    ) returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'BUSINESS_TWIN_PUBLISHED',
    'business_twin',p_organization_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'versionId',v_result.id,'version',v_result.version,
      'sourceHash',v_result.source_hash,'schemaVersion',2,
      'reusedExistingVersion',v_latest.id=v_result.id
    ),
    p_request_key
  );

  return v_result;
end;
$$;

revoke all on function public.guard_industry_pack_catalog_immutable() from public,anon,authenticated,service_role;
revoke all on function public.guard_industry_pack_activation_mutation() from public,anon,authenticated,service_role;
revoke all on function private.industry_pack_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_industry_pack_readiness_v1(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.activate_industry_pack_v1(uuid,uuid,uuid,text,integer,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.deactivate_industry_pack_v1(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.resolve_industry_pack_context_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.compile_business_twin_v2(uuid) from public,anon,authenticated,service_role;
revoke all on function public.publish_business_twin_v2(uuid,uuid,text) from public,anon,authenticated,service_role;

grant execute on function private.industry_pack_assert_manager(uuid,uuid) to service_role;
grant execute on function public.get_industry_pack_readiness_v1(text,integer) to authenticated,service_role;
grant execute on function public.activate_industry_pack_v1(uuid,uuid,uuid,text,integer,integer,text) to service_role;
grant execute on function public.deactivate_industry_pack_v1(uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.resolve_industry_pack_context_v1(uuid,uuid) to authenticated,service_role;
grant execute on function public.compile_business_twin_v2(uuid) to service_role;
grant execute on function public.publish_business_twin_v2(uuid,uuid,text) to service_role;

comment on function public.get_industry_pack_readiness_v1(text,integer) is
  'Validates Pack blueprints against current canonical Custom Field, Pipeline, Automation-trigger and Business Twin contracts; future custom objects are reported as dependencies rather than invented runtime support.';
comment on function public.resolve_industry_pack_context_v1(uuid,uuid) is
  'Returns the active Pack blueprint for one canonical Business. Blueprint data is configuration, never operational CRM/Catalog/Booking/Payment truth.';
comment on function public.compile_business_twin_v2(uuid) is
  'Business Twin V2 adds Industry Pack references only; Pack manifests are resolved separately to keep snapshots bounded and canonical authorities separate.';

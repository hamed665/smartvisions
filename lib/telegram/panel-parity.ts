import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as control from '@/app/control-center-actions';
import * as management from '@/app/management-actions';
import * as extended from '@/app/extended-actions';
import * as cost from '@/app/cost-actions';
import * as growth from '@/app/growth-opportunity-actions';
import * as auditActions from '@/app/audit-actions';
import * as hunter from '@/app/hunter-actions';
import * as hunterBatch from '@/app/hunter-batch-actions';
import * as integrationHealth from '@/app/integration-health-actions';
import * as intelligence from '@/app/intelligence-actions';
import * as versioned from '@/app/versioned-intelligence-actions';
import * as preview from '@/app/preview-actions';
import * as whatsappPilot from '@/app/whatsapp-pilot-actions';
import * as whatsappVerification from '@/app/whatsapp-verification-actions';
import * as ownerCopilot from '@/app/owner-copilot-actions';
import * as bookingLifecycle from '@/app/booking/lifecycle-actions';
import * as quotes from '@/app/quotes/actions';
import * as orders from '@/app/orders/actions';
import * as invoices from '@/app/invoices/actions';
import * as payments from '@/app/payments/actions';
import * as marketingCampaigns from '@/app/marketing-campaign-actions';
import { runWithServerOperatorContext } from '@/lib/supabase/operator-context';
import { jsonValueEqual } from './json-value-equality';
import type { ExecutedMutation, PreparedMutation } from './commands-core';
import { PANEL_PARITY_OWNER_COPILOT_ACTION_NAMES, PANEL_PARITY_TELEGRAM_ACTION_NAMES, type PanelParityActionName, type PanelParityArgs, type PanelParityCommand, type PanelParitySurface } from './panel-parity-types';

export type PanelParitySpec = {
  label: string;
  source: string;
  allowed: readonly string[];
  required?: readonly string[];
  impact: string;
  outreach: 'NONE' | 'CONTROLLED_TEST_ONLY' | 'CONTROLLED_APPROVED_PILOT';
  surfaces?: readonly PanelParitySurface[];
  registryActionKey?: string;
};

const SPECS: Record<PanelParityActionName, PanelParitySpec> = {
  'service.create': { label:'Create service', source:'control-center-actions#createService', allowed:['id','name'], required:['id','name'], impact:'DB only', outreach:'NONE' },
  'service.update': { label:'Update service', source:'control-center-actions#updateService', allowed:['id','name','enabled'], required:['id','name','enabled'], impact:'DB only', outreach:'NONE' },
  'price.create': { label:'Create market price', source:'extended-actions#createPrice', allowed:['service_id','country_code','currency','price','minimum_price','max_auto_discount_pct','max_discount_with_approval_pct'], required:['service_id','country_code','currency','price','minimum_price'], impact:'DB only', outreach:'NONE' },
  'price.update': { label:'Update market price policy', source:'control-center-actions#updatePrice', allowed:['id','price','minimum_price','max_auto_discount_pct','max_discount_with_approval_pct'], required:['id','price','minimum_price','max_auto_discount_pct','max_discount_with_approval_pct'], impact:'DB only', outreach:'NONE' },
  'market.create': { label:'Create market', source:'extended-actions#createMarket', allowed:['country_code','currency','timezone','send_window_start','send_window_end','primary_locale','dialect','tone_profile'], required:['country_code','currency','timezone'], impact:'DB only', outreach:'NONE' },
  'market.update': { label:'Update market', source:'control-center-actions#updateMarket', allowed:['id','enabled','currency','timezone','send_window_start','send_window_end','cold_email_enabled','whatsapp_cold_enabled','instagram_auto_cold_enabled'], required:['id','enabled','currency','timezone','send_window_start','send_window_end'], impact:'DB only; cold WhatsApp/Instagram enable remains blocked', outreach:'NONE' },
  'locale.update': { label:'Update locale profile', source:'extended-actions#updateLocaleProfile', allowed:['id','primary_locale','fallback_locale','dialect','tone_profile','dialect_intensity','max_first_touch_words','max_reply_words'], required:['id','primary_locale'], impact:'DB only', outreach:'NONE' },
  'agent.update': { label:'Update agent settings', source:'control-center-actions#updateAgent', allowed:['id','enabled','model','temperature','max_tokens','confidence_threshold','generation_score_threshold','heavy_generation_score_threshold'], required:['id','enabled','model','temperature','max_tokens','confidence_threshold'], impact:'DB only', outreach:'NONE' },
  'approval.require': { label:'Require approval', source:'control-center-actions#updateApprovalRule', allowed:['id','requires_approval'], required:['id','requires_approval'], impact:'DB only; disabling approval is blocked', outreach:'NONE' },
  'campaign.create': { label:'Create campaign', source:'management-actions#createCampaign', allowed:['name','hunter_type','country_code','city','industry','target_count'], required:['name','hunter_type'], impact:'DB only; creation does not run outreach', outreach:'NONE' },
  'campaign.update': { label:'Update campaign', source:'management-actions#updateCampaign', allowed:['id','status','target_count'], required:['id','status','target_count'], impact:'DB only', outreach:'NONE' },
  'outreach.update': { label:'Update outreach policy', source:'management-actions#updateOutreachPolicy', allowed:['id','enabled','send_window_start','send_window_end','business_days','max_emails_per_day','max_emails_per_mailbox','max_followups','followup_delays_days','manual_review_required'], required:['id','enabled','send_window_start','send_window_end','business_days','max_emails_per_day','max_emails_per_mailbox','max_followups','followup_delays_days','manual_review_required'], impact:'DB only', outreach:'NONE' },
  'template.create': { label:'Create message template', source:'management-actions#createMessageTemplate', allowed:['name','channel','purpose','country_code','language','subject','body','is_default'], required:['name','channel','purpose','language','body'], impact:'DB only', outreach:'NONE' },
  'template.update': { label:'Update message template', source:'management-actions#updateMessageTemplate', allowed:['id','name','subject','body','enabled','is_default'], required:['id','name','body','enabled','is_default'], impact:'DB only', outreach:'NONE' },
  'automation.create': { label:'Create automation rule', source:'management-actions#createAutomationRule', allowed:['name','trigger_key','action_key','priority'], required:['name','trigger_key','action_key'], impact:'DB only; rule creation itself sends nothing', outreach:'NONE' },
  'automation.update': { label:'Update automation rule', source:'management-actions#updateAutomationRule', allowed:['id','enabled','priority'], required:['id','enabled','priority'], impact:'DB only', outreach:'NONE', surfaces:['TELEGRAM','OWNER_COPILOT'], registryActionKey:'OWNER_AUTOMATION_UPDATE' },
  'integration.update': { label:'Update integration connection', source:'management-actions#updateIntegration', allowed:['id','enabled','account_label'], required:['id','enabled'], impact:'DB metadata only; secrets are never accepted', outreach:'NONE' },
  'organization.update': { label:'Update organization settings', source:'management-actions#updateOrganizationSettings', allowed:['brand_name','operator_language','default_customer_language','notification_email'], required:['brand_name','operator_language','default_customer_language'], impact:'DB only', outreach:'NONE' },
  'knowledge.publish': { label:'Publish knowledge version', source:'versioned-intelligence-actions#createKnowledge', allowed:['knowledge_key','content'], required:['knowledge_key','content'], impact:'DB/RPC only; no LLM call', outreach:'NONE' },
  'prompt.publish': { label:'Stage prompt candidate', source:'versioned-intelligence-actions#createPromptVersion', allowed:['agent_name','prompt_text'], required:['agent_name','prompt_text'], impact:'DB/RPC only; candidate remains inactive', outreach:'NONE' },
  'lead.update': { label:'Update lead', source:'management-actions#updateLead', allowed:['id','status','agent_mode','recommended_offer'], required:['id','status','agent_mode'], impact:'DB only', outreach:'NONE', surfaces:['TELEGRAM','OWNER_COPILOT'], registryActionKey:'OWNER_LEAD_UPDATE' },
  'suppression.add': { label:'Add suppression', source:'management-actions#addSuppression', allowed:['email','phone','domain','reason'], impact:'DB only; removing suppression remains blocked', outreach:'NONE' },
  'portfolio.create': { label:'Create portfolio item', source:'extended-actions#createPortfolioItem', allowed:['title','service_id','industry','country_code','approved','public_url','summary'], required:['title'], impact:'DB only', outreach:'NONE' },
  'portfolio.update': { label:'Update portfolio item', source:'management-actions#updatePortfolioItem', allowed:['id','title','summary','public_url','approved'], required:['id','title','approved'], impact:'DB only', outreach:'NONE' },
  'preview_template.create': { label:'Create preview template', source:'extended-actions#createPreviewTemplate', allowed:['id','vertical','name','quality_tier'], required:['id','vertical','name','quality_tier'], impact:'DB only', outreach:'NONE' },
  'preview_template.update': { label:'Update preview template', source:'management-actions#updatePreviewTemplate', allowed:['id','name','active','quality_tier'], required:['id','name','active','quality_tier'], impact:'DB only', outreach:'NONE' },
  'conversation.update': { label:'Update conversation', source:'management-actions#updateConversation', allowed:['id','stage','requires_human','priority'], required:['id','stage','requires_human','priority'], impact:'DB only', outreach:'NONE' },
  'mailbox.update': { label:'Update mailbox', source:'extended-actions#updateMailbox', allowed:['id','enabled','daily_limit'], required:['id','enabled','daily_limit'], impact:'DB only', outreach:'NONE' },
  'variant.update': { label:'Update message variant', source:'extended-actions#updateMessageVariant', allowed:['id','enabled','sample_size'], required:['id','enabled','sample_size'], impact:'DB only', outreach:'NONE' },
  'cost.update': { label:'Update Cost Guard', source:'cost-actions#updateCostGuardSettings', allowed:['monthly_total_budget_usd','openai_budget_usd','google_places_budget_usd','email_budget_usd','whatsapp_budget_usd','reserve_budget_usd','daily_new_leads','daily_website_audits','daily_deep_ai_runs','max_ai_runs_per_lead','max_voice_seconds','max_auto_retries','warning_pct','throttle_pct','critical_pct','hard_stop_pct','audit_cache_days','model_routing_enabled','low_cost_model','high_reasoning_model','confirm_large_change'], required:['monthly_total_budget_usd','openai_budget_usd','google_places_budget_usd','email_budget_usd','whatsapp_budget_usd','reserve_budget_usd','daily_new_leads','daily_website_audits','daily_deep_ai_runs','max_ai_runs_per_lead','max_voice_seconds','max_auto_retries','warning_pct','throttle_pct','critical_pct','hard_stop_pct','audit_cache_days','model_routing_enabled'], impact:'DB only', outreach:'NONE' },
  'openai.health': { label:'OpenAI health check', source:'cost-actions#runOpenAiHealthCheck', allowed:[], impact:'1 controlled OpenAI call; Cost Guard applies', outreach:'NONE' },
  'growth.rescore': { label:'Re-score cached growth opportunities', source:'growth-opportunity-actions#routeCachedGrowthOpportunities', allowed:[], impact:'0 provider calls · 0 LLM calls', outreach:'NONE' },
  'growth.social_review': { label:'Record verified social review', source:'growth-opportunity-actions#recordGrowthSocialAssessment', allowed:['opportunityId','quality','note'], required:['opportunityId','quality','note'], impact:'DB only; evidence note required', outreach:'NONE' },
  'growth.promote': { label:'Promote Tier A candidates', source:'growth-opportunity-actions#promoteHighPrecisionGrowthCandidates', allowed:['limit'], impact:'DB only; creates Leads but sends nothing', outreach:'NONE' },
  'website.audit': { label:'Run deterministic website audit', source:'audit-actions#runDeterministicWebsiteAudit', allowed:['leadId','businessId'], impact:'HTTP website fetch only · 0 LLM · no paid provider', outreach:'NONE' },
  'hunter.sample': { label:'Run controlled Google IDs sample', source:'hunter-actions#runGooglePlacesControlledSample', allowed:['countryCode','city','industry','limit'], impact:'Google Places IDs-only discovery; Cost Guard and quota apply', outreach:'NONE' },
  'hunter.enrich': { label:'Enrich one Google candidate', source:'hunter-actions#enrichGooglePlaceCandidate', allowed:['placeId'], required:['placeId'], impact:'May perform one paid Google lookup; Cost Guard applies', outreach:'NONE' },
  'hunter.batch': { label:'Qualify Google priority batch', source:'hunter-batch-actions#qualifyGooglePlacesPriorityBatch', allowed:['maxChecks','targetLeads'], impact:'May perform selective paid Google qualification; Cost Guard applies', outreach:'NONE' },
  'google.refresh': { label:'Refresh Google business intelligence', source:'intelligence-actions#refreshGoogleBusinessIntelligence', allowed:['leadId'], required:['leadId'], impact:'May perform paid Google lookup when cache is stale; Cost Guard applies', outreach:'NONE' },
  'integration.email_verify': { label:'Check email evidence', source:'integration-health-actions#verifyEmailIntegration', allowed:[], impact:'Reads existing email evidence and rolling quota; records audit only; sends nothing', outreach:'NONE' },
  'integration.crawl4ai_verify': { label:'Verify Crawl4AI', source:'integration-health-actions#verifyCrawl4AiIntegration', allowed:[], impact:'One controlled Crawl4AI smoke test to example.com', outreach:'NONE' },
  'preview.generate_pilot': { label:'Generate controlled Preview pilot', source:'preview-actions#generateControlledPreviewPilot', allowed:['site_language'], required:['site_language'], impact:'Controlled INTERNAL_TEST pilot; current production path records zero generation provider cost', outreach:'NONE' },
  'preview.approve': { label:'Approve Preview', source:'preview-actions#approvePreview', allowed:['preview_id'], required:['preview_id'], impact:'DB transition only', outreach:'NONE' },
  'preview.mark_sent': { label:'Mark Preview manually sent', source:'preview-actions#markPreviewSent', allowed:['preview_id'], required:['preview_id'], impact:'DB transition only; does not send provider message', outreach:'NONE' },
  'preview.mark_internal_shared': { label:'Mark controlled Preview internally shared', source:'preview-actions#markControlledPreviewShared', allowed:['preview_id'], required:['preview_id'], impact:'INTERNAL_TEST-only DB transition', outreach:'NONE' },
  'whatsapp.process_pilot': { label:'Process latest WhatsApp pilot inbound', source:'whatsapp-pilot-actions#processLatestWhatsAppInboundPilot', allowed:[], impact:'Controlled INTERNAL_TEST agent processing; may use LLM under Cost Guard', outreach:'NONE' },
  'whatsapp.send_approved_pilot': { label:'Send approved WhatsApp catalog pilot', source:'whatsapp-pilot-actions#sendApprovedWhatsAppCatalogPilot', allowed:['id'], required:['id'], impact:'Real provider send, but only verified INTERNAL_TEST + APPROVED + open 24h window', outreach:'CONTROLLED_APPROVED_PILOT' },
  'whatsapp.verify': { label:'Verify WhatsApp provider', source:'whatsapp-verification-actions#verifyWhatsAppIntegration', allowed:['test_whatsapp'], required:['test_whatsapp'], impact:'One controlled WhatsApp verification reply; Cost Guard applies', outreach:'CONTROLLED_TEST_ONLY' },
  'whatsapp.voice_transcribe': { label:'Transcribe latest WhatsApp voice pilot', source:'whatsapp-verification-actions#transcribeLatestWhatsAppVoicePilot', allowed:[], impact:'Controlled INTERNAL_TEST voice transcription; may use one OpenAI transcription call', outreach:'NONE' },
  'crm.task.create': { label:'Create CRM task', source:'owner-copilot-actions#createOwnerCopilotTask', allowed:['business_id','lead_id','conversation_id','deal_id','person_id','task_type','title','description','priority','assignee_user_id','due_at','reminder_at','request_key'], required:['title','request_key'], impact:'Canonical CRM task state only', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_TASK_CREATE' },
  'customer.task': { label:'Create customer task', source:'owner-copilot-actions#createOwnerCopilotTask', allowed:['business_id','person_id','lead_id','deal_id','task_type','title','description','priority','assignee_user_id','due_at','reminder_at','request_key'], required:['business_id','title','request_key'], impact:'Canonical CRM task state scoped to a customer/business', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_CUSTOMER_TASK' },
  'crm.task.update': { label:'Update CRM task', source:'owner-copilot-actions#updateOwnerCopilotTask', allowed:['task_id','expected_version','task_type','title','description','status','priority','assignee_user_id','due_at','reminder_at','blocked_reason','completion_note'], required:['task_id','expected_version'], impact:'Canonical CRM task state with version check', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_TASK_UPDATE' },
  'crm.deal.update': { label:'Update CRM deal', source:'owner-copilot-actions#updateOwnerCopilotDeal', allowed:['deal_id','expected_version','title','stage_id','amount','currency','expected_close_at','owner_user_id','team_id','probability_override_bps','lost_reason'], required:['deal_id','expected_version'], impact:'Canonical CRM deal state with permission and version gates', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_DEAL_UPDATE' },
  'booking.confirm': { label:'Confirm booking', source:'booking/lifecycle-actions#confirmBooking', allowed:['booking_id','request_key'], required:['booking_id','request_key'], impact:'Canonical Booking lifecycle transition', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_BOOKING_CONFIRM' },
  'booking.reschedule': { label:'Reschedule booking', source:'booking/lifecycle-actions#rescheduleBooking', allowed:['booking_id','hold_id','reason','request_key'], required:['booking_id','hold_id','reason','request_key'], impact:'Canonical Booking lifecycle transition using an existing hold', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_BOOKING_RESCHEDULE' },
  'booking.cancel': { label:'Cancel booking', source:'booking/lifecycle-actions#cancelBooking', allowed:['booking_id','reason','request_key'], required:['booking_id','reason','request_key'], impact:'Canonical Booking lifecycle transition', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_BOOKING_CANCEL' },
  'quote.submit_review': { label:'Submit quote review', source:'quotes/actions#submitQuoteReviewV1', allowed:['quote_id','expected_quote_version','request_key'], required:['quote_id','expected_quote_version','request_key'], impact:'Canonical Quote review transition', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_QUOTE_SUBMIT_REVIEW' },
  'quote.review_decide': { label:'Decide quote review', source:'quotes/actions#decideQuoteReviewV1', allowed:['quote_id','decision','note','request_key'], required:['quote_id','decision','request_key'], impact:'Canonical Quote review decision', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_QUOTE_REVIEW_DECIDE' },
  'quote.mark_sent': { label:'Mark quote sent', source:'quotes/actions#markQuoteSentV1', allowed:['quote_id','expected_quote_version','request_key'], required:['quote_id','expected_quote_version','request_key'], impact:'Records Quote SENT state only; does not send a provider message', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_QUOTE_MARK_SENT' },
  'order.start': { label:'Start order processing', source:'orders/actions#startOrderProcessingV1', allowed:['order_id','expected_version','request_key'], required:['order_id','expected_version','request_key'], impact:'Canonical Order lifecycle transition', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_ORDER_START' },
  'order.cancel': { label:'Cancel order', source:'orders/actions#cancelOrderV1', allowed:['order_id','expected_version','reason','evidence_note','request_key'], required:['order_id','expected_version','reason','evidence_note','request_key'], impact:'Canonical Order cancellation with evidence', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_ORDER_CANCEL' },
  'invoice.issue': { label:'Issue invoice', source:'invoices/actions#issueInvoiceV1', allowed:['invoice_id','order_id','expected_version','request_key'], required:['invoice_id','expected_version','request_key'], impact:'Canonical Invoice lifecycle transition', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_INVOICE_ISSUE' },
  'invoice.void': { label:'Void invoice', source:'invoices/actions#voidInvoiceV1', allowed:['invoice_id','order_id','expected_version','reason','evidence_note','request_key'], required:['invoice_id','expected_version','reason','evidence_note','request_key'], impact:'Canonical manager-only Invoice void with evidence', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_INVOICE_VOID' },
  'payment.intent_create': { label:'Create payment intent', source:'payments/actions#createPaymentIntentV1', allowed:['invoice_id','amount','request_key'], required:['invoice_id','amount','request_key'], impact:'Creates internal Payment Intent only; no provider charge/link execution', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_PAYMENT_INTENT_CREATE' },
  'payment.intent_cancel': { label:'Cancel payment intent', source:'payments/actions#cancelPaymentIntentV1', allowed:['payment_intent_id','invoice_id','reason','request_key'], required:['payment_intent_id','reason','request_key'], impact:'Cancels internal Payment Intent only; no provider money movement', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_PAYMENT_INTENT_CANCEL' },
  'payment.refund_request': { label:'Request payment refund', source:'payments/actions#requestPaymentRefundV1', allowed:['payment_intent_id','invoice_id','amount','reason','evidence_note','request_key'], required:['payment_intent_id','amount','reason','evidence_note','request_key'], impact:'Records canonical refund request only; no provider refund execution', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_PAYMENT_REFUND_REQUEST' },
  'marketing_campaign.transition': { label:'Transition marketing campaign', source:'marketing-campaign-actions#transitionMarketingCampaign', allowed:['campaign_id','action'], required:['campaign_id','action'], impact:'Canonical Marketing Campaign lifecycle only; provider sends remain downstream gated', outreach:'NONE', surfaces:['OWNER_COPILOT'], registryActionKey:'OWNER_CAMPAIGN_TRANSITION' },
};

const BLOCKED = [
  'Shadow Mode OFF',
  'Kill Switch OFF',
  'delete/remove suppression (DNC bypass)',
  'disable hard approval rules',
  'enable auto-cold WhatsApp or Instagram',
  'show/change secret, token, password, credential or API key',
] as const;

const SENSITIVE_KEY = /(secret|token|password|credential|api[_-]?key|webhook[_-]?secret|authorization)/i;
const truthy = (value: string | undefined) => ['1','true','yes','on','enable','enabled','فعال','روشن'].includes(String(value ?? '').trim().toLowerCase());
const previewValue = (value: string) => value.length > 160 ? `${value.slice(0,157)}...` : value;
const cleanArgs = (args: PanelParityArgs) => Object.fromEntries(Object.entries(args).map(([key,value]) => [key, previewValue(value)]));

const TELEGRAM_ACTIONS = new Set<string>(PANEL_PARITY_TELEGRAM_ACTION_NAMES);
const OWNER_COPILOT_ACTIONS = new Set<string>(PANEL_PARITY_OWNER_COPILOT_ACTION_NAMES);

function actionAllowedOnSurface(action: PanelParityActionName, surface: PanelParitySurface) {
  return surface === 'OWNER_COPILOT' ? OWNER_COPILOT_ACTIONS.has(action) : TELEGRAM_ACTIONS.has(action);
}

type OwnerCopilotRegistryContract = {
  action_key: string;
  authority_key: string;
  permission_key: string;
  verifier_key: string;
  approval_requirement: string;
  approval_policy_key: string | null;
  availability: string;
  metadata: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requireOwnerCopilotRegistryContract(
  supabase: SupabaseClient,
  command: PanelParityCommand,
): Promise<OwnerCopilotRegistryContract> {
  const spec=SPECS[command.action];
  if(!spec.registryActionKey) throw new Error(`${command.action} has no Owner Copilot Tool Registry contract`);
  const {data,error}=await supabase.from('tool_action_registry')
    .select('action_key,authority_key,permission_key,verifier_key,approval_requirement,approval_policy_key,availability,metadata')
    .eq('action_key',spec.registryActionKey)
    .maybeSingle();
  if(error||!data) throw new Error(error?.message ?? `Tool Registry contract ${spec.registryActionKey} was not found`);
  const contract=data as OwnerCopilotRegistryContract;
  const metadata=metadataRecord(contract.metadata);
  const surfaces=Array.isArray(metadata.executionSurfaces)
    ? metadata.executionSurfaces.map((item)=>String(item).toUpperCase()) : [];
  if(contract.availability!=='AVAILABLE'
    || !surfaces.includes('OWNER_COPILOT')
    || String(metadata.ownerCopilotAction??'')!==command.action
    || contract.approval_requirement!=='REQUIRED'
    || contract.approval_policy_key!=='OWNER_COPILOT_CONFIRM'
    || metadata.explicitConfirmationRequired!==true
    || metadata.providerSend!==false
    || metadata.paymentExecution!==false) {
    throw new Error(`${spec.registryActionKey} is not a safe AVAILABLE Owner Copilot contract`);
  }
  return contract;
}


async function assertOwnerCopilotRuntimePolicy(
  supabase: SupabaseClient,
  organizationId: string,
  confirmationId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(confirmationId)) {
    throw new Error('Owner Copilot confirmation evidence is invalid');
  }
  const [{data:controls,error:controlsError},{data:prior,error:priorError}]=await Promise.all([
    supabase.from('system_controls')
      .select('global_kill_switch,shadow_mode,agents_paused')
      .eq('organization_id',organizationId).maybeSingle(),
    supabase.from('audit_logs')
      .select('id')
      .eq('organization_id',organizationId)
      .eq('action','OWNER_COPILOT_ACTION')
      .eq('correlation_id',confirmationId)
      .limit(1).maybeSingle(),
  ]);
  if(controlsError||!controls) throw new Error(controlsError?.message??'Owner Copilot runtime controls are unavailable');
  if(priorError) throw new Error(`Owner Copilot replay evidence read failed: ${priorError.message}`);
  if(prior) throw new Error('Owner Copilot confirmation was already consumed');
  if(controls.global_kill_switch) throw new Error('Global Kill Switch blocks Owner Copilot mutation');
  if(controls.agents_paused) throw new Error('AI agents are paused; Owner Copilot mutation is blocked');
  if(controls.shadow_mode) throw new Error('Shadow Mode blocks Owner Copilot mutation');
}

export async function listOwnerCopilotAvailableActions(supabase: SupabaseClient): Promise<PanelParityActionName[]> {
  const {data,error}=await supabase.from('tool_action_registry')
    .select('action_key,availability,approval_requirement,approval_policy_key,metadata')
    .eq('availability','AVAILABLE');
  if(error) throw new Error(`Owner Copilot Tool Registry read failed: ${error.message}`);
  const actions:PanelParityActionName[]=[];
  for(const row of data??[]) {
    const metadata=metadataRecord(row.metadata);
    const surfaces=Array.isArray(metadata.executionSurfaces)
      ? metadata.executionSurfaces.map((item)=>String(item).toUpperCase()) : [];
    const action=String(metadata.ownerCopilotAction??'') as PanelParityActionName;
    if(!surfaces.includes('OWNER_COPILOT')||!OWNER_COPILOT_ACTIONS.has(action)) continue;
    if(row.approval_requirement!=='REQUIRED'||row.approval_policy_key!=='OWNER_COPILOT_CONFIRM') continue;
    if(metadata.providerSend!==false||metadata.paymentExecution!==false||metadata.explicitConfirmationRequired!==true) continue;
    actions.push(action);
  }
  return [...new Set(actions)].sort();
}

export function panelParityHelpText() {
  const groups = [
    'Growth: growth.rescore · growth.social_review · growth.promote · website.audit',
    'Hunter: hunter.sample · hunter.enrich · hunter.batch · google.refresh',
    'Sales: lead.update · conversation.update · suppression.add · campaign.create/update · outreach.update',
    'Catalog: service.create/update · price.create/update · market.create/update · locale.update',
    'AI: agent.update · knowledge.publish · prompt.publish · cost.update · openai.health',
    'Content: portfolio.create/update · preview_template.create/update · preview.*',
    'Messaging: template.create/update · automation.create/update · mailbox.update · variant.update',
    'Integrations: integration.update · integration.email_verify · integration.crawl4ai_verify · whatsapp.*',
  ];
  return [
    'Control Center ↔ Telegram parity',
    'فرمت عمومی: /panel <action> key=value key="value with spaces"',
    'میانبرها: /rescore · /promote 10 · /socialreview <opportunityId> WEAK "evidence note" · /webaudit business <id>',
    '',
    ...groups,
    '',
    'هر PANEL_ACTION قبل از اجرا Preview + Confirm/Cancel دارد. خود action همان Server Action پنل را اجرا می‌کند، نه یک subsystem موازی.',
    'قفل‌های عمدی که فقط از پنل/فرایند امن‌تر می‌مانند:',
    ...BLOCKED.map((item)=>`• ${item}`),
  ].join('\n');
}

function assertActionArgs(command: PanelParityCommand, surface: PanelParitySurface = 'TELEGRAM') {
  const spec = SPECS[command.action];
  if (!actionAllowedOnSurface(command.action,surface)) throw new Error(`${command.action} is not available on ${surface}`);
  if (!spec) throw new Error('Panel action is not registered');
  for (const key of Object.keys(command.args)) {
    if (SENSITIVE_KEY.test(key)) throw new Error('Secret/Token/Credential fields are never accepted from an operator command.');
    if (!spec.allowed.includes(key)) throw new Error(`پارامتر «${key}» برای ${command.action} مجاز نیست.`);
  }
  for (const key of spec.required ?? []) {
    if (!String(command.args[key] ?? '').trim()) throw new Error(`پارامتر ${key} برای ${command.action} لازم است.`);
  }
  if (command.action === 'market.update') {
    if (truthy(command.args.whatsapp_cold_enabled) || truthy(command.args.instagram_auto_cold_enabled)) {
      throw new Error('فعال‌سازی auto-cold WhatsApp/Instagram از Telegram مسدود است.');
    }
  }
  if (command.action === 'approval.require' && !truthy(command.args.requires_approval)) {
    throw new Error('Telegram فقط می‌تواند Approval را اجباری‌تر کند؛ خاموش‌کردن Approval مجاز نیست.');
  }
  if (command.action === 'suppression.add' && !command.args.email && !command.args.phone && !command.args.domain) {
    throw new Error('برای suppression حداقل email یا phone یا domain لازم است.');
  }
  if (command.action === 'website.audit' && !command.args.leadId && !command.args.businessId) {
    throw new Error('برای website.audit یکی از leadId یا businessId لازم است.');
  }
  if (command.action === 'marketing_campaign.transition') {
    const action=String(command.args.action??'').trim().toUpperCase();
    if (!['SUBMIT','APPROVE','REJECT','START','PAUSE','RESUME','COMPLETE'].includes(action)) {
      throw new Error('Marketing Campaign transition action is invalid.');
    }
  }
  if (surface === 'OWNER_COPILOT' && ['payment.intent_create','payment.intent_cancel','payment.refund_request'].includes(command.action)) {
    if (command.args.provider || command.args.provider_reference || command.args.payment_link) {
      throw new Error('Owner Copilot cannot execute provider payment operations.');
    }
  }
}

async function resolveWebOwnerUserId(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase.from('organization_members')
    .select('user_id,role')
    .eq('organization_id', organizationId)
    .eq('role', 'OWNER')
    .limit(2);
  if (error) throw new Error(`Owner identity lookup failed: ${error.message}`);
  if (!data?.length) throw new Error('No Control Center OWNER membership is configured.');
  if (data.length !== 1) throw new Error('Telegram panel parity requires exactly one Control Center OWNER until identities are explicitly linked.');
  return String(data[0].user_id);
}

function formFrom(args: PanelParityArgs) {
  const form = new FormData();
  for (const [key, value] of Object.entries(args)) form.set(key, value);
  return form;
}

function redirectLocation(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const digest = String((error as { digest?: unknown }).digest ?? '');
  const match = digest.match(/^NEXT_REDIRECT;[^;]*;([^;]+);/);
  return match?.[1] ?? null;
}

function redirectedFailure(location: string) {
  try {
    const url = new URL(location, 'https://smartvisions.invalid');
    const bad = url.searchParams.get('error') || url.searchParams.get('message') || url.searchParams.get('promotionError');
    if (url.searchParams.get('result') === 'error' || url.searchParams.get('batch') === 'error' || url.searchParams.get('enrichment') === 'error' || url.searchParams.get('pilot') === 'error' || url.searchParams.get('voice') === 'error' || bad) {
      return bad ? decodeURIComponent(bad).slice(0,240) : 'Panel action reported a controlled failure.';
    }
  } catch { /* location is still a successful redirect token */ }
  return null;
}

async function invokePanelServerAction(action: PanelParityActionName, args: PanelParityArgs) {
  const form = formFrom(args);
  switch (action) {
    case 'service.create': return control.createService(form);
    case 'service.update': return control.updateService(form);
    case 'price.create': return extended.createPrice(form);
    case 'price.update': return control.updatePrice(form);
    case 'market.create': return extended.createMarket(form);
    case 'market.update': return control.updateMarket(form);
    case 'locale.update': return extended.updateLocaleProfile(form);
    case 'agent.update': return control.updateAgent(form);
    case 'approval.require': return control.updateApprovalRule(form);
    case 'campaign.create': return management.createCampaign(form);
    case 'campaign.update': return management.updateCampaign(form);
    case 'outreach.update': return management.updateOutreachPolicy(form);
    case 'template.create': return management.createMessageTemplate(form);
    case 'template.update': return management.updateMessageTemplate(form);
    case 'automation.create': return management.createAutomationRule(form);
    case 'automation.update': return management.updateAutomationRule(form);
    case 'integration.update': return management.updateIntegration(form);
    case 'organization.update': return management.updateOrganizationSettings(form);
    case 'knowledge.publish': return versioned.createKnowledge(form);
    case 'prompt.publish': return versioned.createPromptVersion(form);
    case 'lead.update': return management.updateLead(form);
    case 'suppression.add': return management.addSuppression(form);
    case 'portfolio.create': return extended.createPortfolioItem(form);
    case 'portfolio.update': return management.updatePortfolioItem(form);
    case 'preview_template.create': return extended.createPreviewTemplate(form);
    case 'preview_template.update': return management.updatePreviewTemplate(form);
    case 'conversation.update': return management.updateConversation(form);
    case 'mailbox.update': return extended.updateMailbox(form);
    case 'variant.update': return extended.updateMessageVariant(form);
    case 'cost.update': return cost.updateCostGuardSettings(form);
    case 'openai.health': return cost.runOpenAiHealthCheck();
    case 'growth.rescore': return growth.routeCachedGrowthOpportunities();
    case 'growth.social_review': return growth.recordGrowthSocialAssessment(form);
    case 'growth.promote': return growth.promoteHighPrecisionGrowthCandidates(form);
    case 'website.audit': return auditActions.runDeterministicWebsiteAudit(form);
    case 'hunter.sample': return hunter.runGooglePlacesControlledSample(form);
    case 'hunter.enrich': return hunter.enrichGooglePlaceCandidate(form);
    case 'hunter.batch': return hunterBatch.qualifyGooglePlacesPriorityBatch(form);
    case 'google.refresh': return intelligence.refreshGoogleBusinessIntelligence(form);
    case 'integration.email_verify': return integrationHealth.verifyEmailIntegration();
    case 'integration.crawl4ai_verify': return integrationHealth.verifyCrawl4AiIntegration();
    case 'preview.generate_pilot': return preview.generateControlledPreviewPilot(form);
    case 'preview.approve': return preview.approvePreview(form);
    case 'preview.mark_sent': return preview.markPreviewSent(form);
    case 'preview.mark_internal_shared': return preview.markControlledPreviewShared(form);
    case 'whatsapp.process_pilot': return whatsappPilot.processLatestWhatsAppInboundPilot();
    case 'whatsapp.send_approved_pilot': return whatsappPilot.sendApprovedWhatsAppCatalogPilot(form);
    case 'whatsapp.verify': return whatsappVerification.verifyWhatsAppIntegration(form);
    case 'whatsapp.voice_transcribe': return whatsappVerification.transcribeLatestWhatsAppVoicePilot();
    case 'crm.task.create':
    case 'customer.task': return ownerCopilot.createOwnerCopilotTask(form);
    case 'crm.task.update': return ownerCopilot.updateOwnerCopilotTask(form);
    case 'crm.deal.update': return ownerCopilot.updateOwnerCopilotDeal(form);
    case 'booking.confirm': return bookingLifecycle.confirmBooking(form);
    case 'booking.reschedule': return bookingLifecycle.rescheduleBooking(form);
    case 'booking.cancel': return bookingLifecycle.cancelBooking(form);
    case 'quote.submit_review': return quotes.submitQuoteReviewV1(form);
    case 'quote.review_decide': return quotes.decideQuoteReviewV1(form);
    case 'quote.mark_sent': return quotes.markQuoteSentV1(form);
    case 'order.start': return orders.startOrderProcessingV1(form);
    case 'order.cancel': return orders.cancelOrderV1(form);
    case 'invoice.issue': return invoices.issueInvoiceV1(form);
    case 'invoice.void': return invoices.voidInvoiceV1(form);
    case 'payment.intent_create': return payments.createPaymentIntentV1(form);
    case 'payment.intent_cancel': return payments.cancelPaymentIntentV1(form);
    case 'payment.refund_request': return payments.requestPaymentRefundV1(form);
    case 'marketing_campaign.transition': return marketingCampaigns.transitionMarketingCampaign(form);
  }
}

async function compactSnapshot(supabase: SupabaseClient, organizationId: string, action: PanelParityActionName, args: PanelParityArgs): Promise<unknown> {
  const byId = async (table: string, fields: string) => {
    const id = args.id ?? args.opportunityId ?? args.preview_id ?? args.leadId ?? args.businessId;
    if (!id) return null;
    const { data, error } = await supabase.from(table).select(fields).eq('organization_id', organizationId).eq('id', id).maybeSingle();
    if (error) throw new Error(`Preview lookup failed: ${error.message}`);
    return data ?? null;
  };
  const bySpecificId = async (table: string, fields: string, id: string | undefined) => {
    if (!id) return null;
    const { data, error } = await supabase.from(table).select(fields).eq('organization_id',organizationId).eq('id',id).maybeSingle();
    if (error) throw new Error(`Preview lookup failed: ${error.message}`);
    return data ?? null;
  };
  const byRequestKey = async (table: string, fields: string, requestKey: string | undefined) => {
    if (!requestKey) return null;
    const { data, error } = await supabase.from(table).select(fields).eq('organization_id',organizationId).eq('request_key',requestKey).maybeSingle();
    if (error) throw new Error(`Preview lookup failed: ${error.message}`);
    return data ?? null;
  };
  switch (action) {
    case 'service.update': return byId('services','id,name,enabled,updated_at');
    case 'price.update': return byId('service_prices','id,service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct,updated_at');
    case 'market.update': return byId('market_settings','id,country_code,enabled,currency,timezone,send_window_start,send_window_end,updated_at');
    case 'locale.update': return byId('locale_profiles','id,country_code,primary_locale,fallback_locale,dialect,tone_profile,dialect_intensity,max_first_touch_words,max_reply_words,updated_at');
    case 'agent.update': return byId('agent_settings','id,agent_name,enabled,model,temperature,max_tokens,confidence_threshold,updated_at');
    case 'approval.require': return byId('approval_rules','id,action_key,requires_approval,updated_at');
    case 'campaign.update': return byId('campaigns','id,name,status,target_count,updated_at');
    case 'outreach.update': return byId('outreach_policies','id,country_code,enabled,send_window_start,send_window_end,business_days,max_emails_per_day,max_emails_per_mailbox,max_followups,followup_delays_days,manual_review_required,updated_at');
    case 'template.update': return byId('message_templates','id,name,enabled,is_default,updated_at');
    case 'automation.update': return byId('automation_rules','id,name,enabled,priority,updated_at');
    case 'integration.update': return byId('integration_connections','id,provider,channel,status,enabled,account_label,updated_at');
    case 'lead.update': return byId('leads','id,status,agent_mode,recommended_offer,updated_at');
    case 'portfolio.update': return byId('portfolio_items','id,title,approved,public_url,updated_at');
    case 'preview_template.update': return byId('preview_templates','id,name,active,quality_tier,updated_at');
    case 'conversation.update': return byId('sales_conversations','id,stage,requires_human,awaiting_party,priority,updated_at');
    case 'mailbox.update': return byId('mailboxes','id,address,enabled,daily_limit,sent_today,health_status,updated_at');
    case 'variant.update': return byId('message_variants','id,enabled,sample_size,updated_at');
    case 'growth.social_review': return byId('growth_opportunities','id,business_id,prospect_tier,qualification_score,primary_offer_family,should_contact,updated_at');
    case 'preview.approve':
    case 'preview.mark_sent':
    case 'preview.mark_internal_shared': return byId('previews','id,status,updated_at');
    case 'crm.task.create':
    case 'customer.task': return byRequestKey('crm_tasks','id,business_id,lead_id,deal_id,person_id,task_type,title,status,priority,assignee_user_id,due_at,reminder_at,version,request_key,updated_at',args.request_key);
    case 'crm.task.update': return bySpecificId('crm_tasks','id,business_id,lead_id,deal_id,person_id,task_type,title,status,priority,assignee_user_id,due_at,reminder_at,blocked_reason,completion_note,version,updated_at',args.task_id);
    case 'crm.deal.update': return bySpecificId('crm_deals','id,business_id,lead_id,pipeline_id,stage_id,title,state,amount,currency,expected_close_at,owner_user_id,team_id,probability_override_bps,lost_reason,version,updated_at',args.deal_id);
    case 'booking.confirm':
    case 'booking.reschedule':
    case 'booking.cancel': return bySpecificId('bookings','id,booking_reference,person_id,lead_id,service_id,branch_id,starts_at,ends_at,status,current_hold_id,cancel_reason,confirmed_at,rescheduled_at,canceled_at,version,updated_at',args.booking_id);
    case 'quote.submit_review':
    case 'quote.review_decide':
    case 'quote.mark_sent': {
      const quote=await bySpecificId('quotes','id,quote_number,status,current_version,version,owner_user_id,buyer_business_id,person_id,updated_at',args.quote_id) as Record<string,unknown> | null;
      if(!quote) return null;
      const {data:review,error}=await supabase.from('quote_version_reviews')
        .select('quote_id,version_no,status,reviewer_roles,reviewed_by_user_id,reviewed_at,updated_at')
        .eq('organization_id',organizationId).eq('quote_id',args.quote_id ?? '')
        .eq('version_no',Number(quote.current_version ?? 0)).maybeSingle();
      if(error) throw new Error(`Preview lookup failed: ${error.message}`);
      return {quote,review:review ?? null};
    }
    case 'order.start':
    case 'order.cancel': return bySpecificId('orders','id,order_number,status,fulfillment_status,total,currency,quote_id,version,cancel_reason,updated_at',args.order_id);
    case 'invoice.issue':
    case 'invoice.void': return bySpecificId('invoices','id,invoice_number,order_id,status,settlement_status,total,paid_total,credited_total,balance_due,currency,due_date,version,updated_at',args.invoice_id);
    case 'payment.intent_cancel': return bySpecificId('payment_intents','id,payment_number,invoice_id,status,provider,amount,captured_total,refunded_total,net_paid_total,currency,version,updated_at',args.payment_intent_id);
    case 'payment.intent_create': {
      const [invoice,intent]=await Promise.all([
        bySpecificId('invoices','id,invoice_number,status,settlement_status,balance_due,currency,version,updated_at',args.invoice_id),
        supabase.from('payment_intents').select('id,payment_number,invoice_id,status,provider,amount,currency,version,updated_at')
          .eq('organization_id',organizationId).eq('invoice_id',args.invoice_id ?? '')
          .in('status',['CREATED','AUTHORIZED','RECONCILIATION_REQUIRED']).order('updated_at',{ascending:false}).limit(1).maybeSingle(),
      ]);
      if (intent.error) throw new Error(`Preview lookup failed: ${intent.error.message}`);
      return {invoice,activeIntent:intent.data ?? null};
    }
    case 'payment.refund_request': {
      const [intent,refund]=await Promise.all([
        bySpecificId('payment_intents','id,payment_number,invoice_id,status,provider,amount,captured_total,refunded_total,net_paid_total,currency,version,updated_at',args.payment_intent_id),
        supabase.from('payment_refunds').select('id,payment_intent_id,invoice_id,status,amount,currency,reason,updated_at')
          .eq('organization_id',organizationId).eq('payment_intent_id',args.payment_intent_id ?? '')
          .order('updated_at',{ascending:false}).limit(1).maybeSingle(),
      ]);
      if (refund.error) throw new Error(`Preview lookup failed: ${refund.error.message}`);
      return {intent,latestRefund:refund.data ?? null};
    }
    case 'marketing_campaign.transition': return bySpecificId('campaigns','id,name,campaign_kind,status,approval_status,scheduled_start_at,scheduled_end_at,version,updated_at',args.campaign_id);
    case 'organization.update': {
      const { data, error } = await supabase.from('organization_settings').select('brand_name,operator_language,default_customer_language,notification_email,updated_at').eq('organization_id',organizationId).maybeSingle();
      if (error) throw new Error(`Preview lookup failed: ${error.message}`); return data ?? null;
    }
    case 'cost.update': {
      const { data, error } = await supabase.from('cost_guard_settings').select('monthly_total_budget_usd,openai_budget_usd,google_places_budget_usd,email_budget_usd,whatsapp_budget_usd,reserve_budget_usd,daily_new_leads,daily_website_audits,daily_deep_ai_runs,warning_pct,throttle_pct,critical_pct,hard_stop_pct,updated_at').eq('organization_id',organizationId).maybeSingle();
      if (error) throw new Error(`Preview lookup failed: ${error.message}`); return data ?? null;
    }
    case 'growth.rescore': {
      const [businesses, opportunities] = await Promise.all([
        supabase.from('businesses').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).not('google_place_id','is',null),
        supabase.from('growth_opportunities').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
      ]);
      if (businesses.error || opportunities.error) throw new Error(`Preview lookup failed: ${businesses.error?.message ?? opportunities.error?.message}`);
      return { cachedBusinesses: businesses.count ?? 0, currentOpportunities: opportunities.count ?? 0 };
    }
    case 'growth.promote': {
      const [candidates, leads] = await Promise.all([
        supabase.from('growth_opportunities').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).eq('prospect_tier','A').eq('should_contact',true),
        supabase.from('leads').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
      ]);
      if (candidates.error || leads.error) throw new Error(`Preview lookup failed: ${candidates.error?.message ?? leads.error?.message}`);
      return { contactReadyTierA: candidates.count ?? 0, currentLeads: leads.count ?? 0 };
    }
    case 'website.audit': {
      if (args.businessId) {
        const { data, error } = await supabase.from('website_audits').select('id,status,audited_at').eq('organization_id',organizationId).eq('business_id',args.businessId).order('audited_at',{ascending:false}).limit(1).maybeSingle();
        if (error) throw new Error(`Preview lookup failed: ${error.message}`); return data ?? { businessId:args.businessId, latestAudit:null };
      }
      return { leadId: args.leadId ?? null };
    }
    case 'openai.health':
    case 'integration.email_verify':
    case 'integration.crawl4ai_verify':
    case 'whatsapp.verify': {
      const { data, error } = await supabase.from('integration_connections').select('provider,channel,status,enabled,last_checked_at,last_error').eq('organization_id',organizationId).order('provider');
      if (error) throw new Error(`Preview lookup failed: ${error.message}`); return data ?? [];
    }
    case 'whatsapp.process_pilot':
    case 'whatsapp.send_approved_pilot':
    case 'whatsapp.voice_transcribe':
    case 'preview.generate_pilot': {
      const { data, error } = await supabase.from('system_controls').select('shadow_mode,global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused').eq('organization_id',organizationId).maybeSingle();
      if (error) throw new Error(`Preview lookup failed: ${error.message}`); return data ?? null;
    }
    default: return null;
  }
}

function safeJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text.length > 900 ? `${text.slice(0,897)}...` : text;
  } catch { return '—'; }
}

function scalarMatches(row: Record<string,unknown>, rowKey: string, arg: string | undefined) {
  if(arg === undefined) return true;
  const actual=row[rowKey];
  if(actual == null) return arg.trim()==='' || arg.trim().toLowerCase()==='null';
  if(typeof actual==='boolean') return actual===truthy(arg);
  if(typeof actual==='number') return Number(arg)===actual;
  return String(actual)===arg;
}

function assertOwnerCopilotVerified(action: PanelParityActionName,args:PanelParityArgs,finalSnapshot:unknown) {
  if(finalSnapshot==null) throw new Error(`Owner Copilot verifier found no canonical state for ${action}`);
  const outer=metadataRecord(finalSnapshot);
  const row=(action.startsWith('quote.') ? metadataRecord(outer.quote) : outer);
  let verified=true;
  switch(action) {
    case 'lead.update':
      verified=scalarMatches(row,'status',args.status)&&scalarMatches(row,'agent_mode',args.agent_mode)
        &&scalarMatches(row,'recommended_offer',args.recommended_offer); break;
    case 'automation.update':
      verified=scalarMatches(row,'enabled',args.enabled)&&scalarMatches(row,'priority',args.priority); break;
    case 'crm.task.create':
    case 'customer.task':
      verified=scalarMatches(row,'request_key',args.request_key)&&scalarMatches(row,'title',args.title); break;
    case 'crm.task.update':
      verified=scalarMatches(row,'status',args.status)&&scalarMatches(row,'priority',args.priority)
        &&scalarMatches(row,'title',args.title)&&scalarMatches(row,'task_type',args.task_type); break;
    case 'crm.deal.update':
      verified=scalarMatches(row,'title',args.title)&&scalarMatches(row,'stage_id',args.stage_id)
        &&scalarMatches(row,'amount',args.amount)&&scalarMatches(row,'currency',args.currency)
        &&scalarMatches(row,'owner_user_id',args.owner_user_id)&&scalarMatches(row,'team_id',args.team_id); break;
    case 'booking.confirm': verified=String(row.status)==='CONFIRMED'; break;
    case 'booking.reschedule': verified=String(row.status)==='RESCHEDULED'; break;
    case 'booking.cancel': verified=String(row.status)==='CANCELED'; break;
    case 'quote.submit_review': verified=String(row.status)==='REVIEW'; break;
    case 'quote.review_decide': {
      const review=metadataRecord(outer.review);
      verified=String(review.status)===(String(args.decision).toUpperCase()==='APPROVE'?'APPROVED':'REJECTED');
      break;
    }
    case 'quote.mark_sent': verified=String(row.status)==='SENT'; break;
    case 'order.start': verified=String(row.status)==='PROCESSING'; break;
    case 'order.cancel': verified=String(row.status)==='CANCELLED'; break;
    case 'invoice.issue': verified=String(row.status)==='ISSUED'; break;
    case 'invoice.void': verified=String(row.status)==='VOID'; break;
    case 'payment.intent_create': verified=Boolean(outer.activeIntent); break;
    case 'payment.intent_cancel': verified=String(row.status)==='CANCELLED'; break;
    case 'payment.refund_request': verified=String(metadataRecord(outer.latestRefund).status)==='REQUESTED'; break;
    case 'marketing_campaign.transition': {
      const requested=String(args.action??'').toUpperCase();
      const expectedStatus:Record<string,string>={START:'RUNNING',RESUME:'RUNNING',PAUSE:'PAUSED',COMPLETE:'COMPLETED'};
      const expectedApproval:Record<string,string>={SUBMIT:'PENDING',APPROVE:'APPROVED',REJECT:'REJECTED'};
      verified=expectedStatus[requested] ? String(row.status)===expectedStatus[requested]
        : expectedApproval[requested] ? String(row.approval_status)===expectedApproval[requested] : false;
      break;
    }
    default: break;
  }
  if(!verified) throw new Error(`Owner Copilot verifier rejected canonical result for ${action}`);
}

export async function preparePanelAction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: PanelParityCommand;
  surface?: PanelParitySurface;
  actorRole?: string;
}): Promise<PreparedMutation> {
  const surface=input.surface ?? 'TELEGRAM';
  assertActionArgs(input.command,surface);
  if(surface==='OWNER_COPILOT' && !['OWNER','ADMIN'].includes(String(input.actorRole??''))) {
    throw new Error('Owner Copilot action requires OWNER or ADMIN');
  }
  const spec = SPECS[input.command.action];
  const registry = surface==='OWNER_COPILOT'
    ? await requireOwnerCopilotRegistryContract(input.supabase,input.command)
    : null;
  const before = await compactSnapshot(input.supabase,input.organizationId,input.command.action,input.command.args);
  const after = { action: input.command.action, requested: cleanArgs(input.command.args) };
  return {
    command: input.command,
    preview: {
      title: `${surface==='OWNER_COPILOT' ? 'Owner Copilot' : 'Control Center'} · ${spec.label}`,
      text: [
        `Action: ${input.command.action}`,
        `Source: ${spec.source}`,
        ...(registry ? [
          `Tool Registry: ${registry.action_key}`,
          `Authority: ${registry.authority_key}`,
          `Permission: ${registry.permission_key}`,
          `Approval: ${registry.approval_requirement} / ${registry.approval_policy_key}`,
          `Verifier: ${registry.verifier_key}`,
        ] : []),
        `Impact: ${spec.impact}`,
        `Customer outreach: ${spec.outreach}`,
        `Before: ${safeJson(before)}`,
        `Requested: ${safeJson(after.requested)}`,
        surface==='OWNER_COPILOT'
          ? 'این اقدام فقط بعد از Confirm صریح اجرا می‌شود. Tool Registry، state و role هنگام اجرا دوباره بررسی می‌شوند.'
          : 'این مسیر همان Server Action پنل را اجرا می‌کند. Revert عمومی برای PANEL_ACTION فعال نیست؛ تغییرات حساس فقط بعد از Confirm اجرا می‌شوند.',
      ].join('\n'),
      before,
      after,
      entityType: 'control_center_action',
      entityId: input.command.action,
      requiresConfirmation: true,
    },
  };
}

export async function executePanelAction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: PanelParityCommand;
  preview: { before?: unknown; after?: unknown };
  surface?: PanelParitySurface;
  actorRole?: string;
  approvalEvidence?: { type: 'SIGNED_PREVIEW_CONFIRM'; confirmationId: string };
}): Promise<ExecutedMutation> {
  const surface=input.surface ?? 'TELEGRAM';
  assertActionArgs(input.command,surface);
  if(surface==='OWNER_COPILOT' && !['OWNER','ADMIN'].includes(String(input.actorRole??''))) {
    throw new Error('Owner Copilot action requires OWNER or ADMIN');
  }
  const spec = SPECS[input.command.action];
  const registry = surface==='OWNER_COPILOT'
    ? await requireOwnerCopilotRegistryContract(input.supabase,input.command)
    : null;
  if(surface==='OWNER_COPILOT') {
    if(input.approvalEvidence?.type!=='SIGNED_PREVIEW_CONFIRM') {
      throw new Error('Owner Copilot signed confirmation is required');
    }
    await assertOwnerCopilotRuntimePolicy(
      input.supabase,
      input.organizationId,
      input.approvalEvidence.confirmationId,
    );
  }
  const current = await compactSnapshot(input.supabase,input.organizationId,input.command.action,input.command.args);
  if (input.preview.before != null && !jsonValueEqual(current,input.preview.before)) {
    throw new Error('Canonical state changed after preview; prepare the action again.');
  }

  let redirectTo: string | null = null;
  try {
    if(surface==='TELEGRAM') {
      const webOwnerUserId = await resolveWebOwnerUserId(input.supabase,input.organizationId);
      await runWithServerOperatorContext({
        supabase: input.supabase,
        organizationId: input.organizationId,
        role: 'OWNER',
        userId: webOwnerUserId,
        source: 'TELEGRAM',
      }, async () => { await invokePanelServerAction(input.command.action,input.command.args); });
    } else {
      await invokePanelServerAction(input.command.action,input.command.args);
    }
  } catch (error) {
    redirectTo = redirectLocation(error);
    if (!redirectTo) throw error;
    const failure = redirectedFailure(redirectTo);
    if (failure) throw new Error(failure);
  }

  const finalSnapshot = await compactSnapshot(input.supabase,input.organizationId,input.command.action,input.command.args);
  if(surface==='OWNER_COPILOT') {
    assertOwnerCopilotVerified(input.command.action,input.command.args,finalSnapshot);
  }
  const auditAction=surface==='OWNER_COPILOT' ? 'OWNER_COPILOT_ACTION' : 'TELEGRAM_PANEL_ACTION';
  const { error: auditError } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: surface==='OWNER_COPILOT' ? 'USER' : 'SYSTEM',
    actor_id: surface==='OWNER_COPILOT' ? input.ownerUserId : null,
    action: auditAction,
    entity_type: 'control_center_action',
    entity_id: input.command.action,
    correlation_id: surface==='OWNER_COPILOT' ? input.approvalEvidence?.confirmationId ?? null : null,
    before_data: input.preview.before ?? null,
    after_data: {
      operator_user_id: input.ownerUserId,
      operator_role: input.actorRole ?? (surface==='TELEGRAM' ? 'OWNER' : null),
      surface,
      panel_action: input.command.action,
      registry_action_key: registry?.action_key ?? null,
      authority_key: registry?.authority_key ?? null,
      permission_key: registry?.permission_key ?? null,
      verifier_key: registry?.verifier_key ?? null,
      source: spec.source,
      args: cleanArgs(input.command.args),
      final_snapshot: finalSnapshot,
      redirect: redirectTo,
      customer_outreach: spec.outreach,
      provider_send_triggered: false,
      payment_execution_triggered: false,
    },
  });
  if (auditError) throw new Error(`${surface} action audit failed: ${auditError.message}`);

  return {
    title: `${surface==='OWNER_COPILOT' ? 'Owner Copilot' : 'Control Center'} · ${spec.label}`,
    text: [
      `${input.command.action} انجام شد ✅`,
      `Source: ${spec.source}`,
      `Result: ${safeJson(finalSnapshot)}`,
      `Customer outreach: ${spec.outreach}`,
    ].join('\n'),
    before: input.preview.before,
    after: finalSnapshot ?? input.preview.after,
    entityType: 'control_center_action',
    entityId: input.command.action,
    command: input.command,
    reversible: false,
  };
}

export const PANEL_PARITY_SPECS = SPECS;
export const PANEL_PARITY_BLOCKED = BLOCKED;

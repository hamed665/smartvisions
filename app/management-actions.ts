'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const required = (f: FormData, k: string) => { const v = text(f,k); if (!v) throw new Error(`${k} is required`); return v; };
const number = (f: FormData, k: string, fallback = 0) => { const raw = text(f,k); if (!raw) return fallback; const v = Number(raw); if (!Number.isFinite(v)) throw new Error(`${k} must be numeric`); return v; };
const bool = (f: FormData, k: string) => f.get(k) === 'on';
const now = () => new Date().toISOString();

async function owner() { return getCurrentOrganization(true); }

export async function updateSystemControls(f: FormData) {
  const { supabase, organizationId } = await owner();
  const payload = {
    global_kill_switch: bool(f,'global_kill_switch'), email_paused: bool(f,'email_paused'),
    whatsapp_ai_paused: bool(f,'whatsapp_ai_paused'), agents_paused: bool(f,'agents_paused'),
    shadow_mode: bool(f,'shadow_mode'), monthly_budget_usd: number(f,'monthly_budget_usd', 20), updated_at: now(),
  };
  const { error } = await supabase.from('system_controls').upsert({ organization_id: organizationId, ...payload }, { onConflict: 'organization_id' });
  if (error) throw error; revalidatePath('/system'); revalidatePath('/');
}

export async function createCampaign(f: FormData) {
  const { supabase, organizationId } = await owner();
  const { error } = await supabase.from('campaigns').insert({ organization_id: organizationId, name: required(f,'name'), hunter_type: required(f,'hunter_type'), country_code: text(f,'country_code') || null, city: text(f,'city') || null, industry: text(f,'industry') || null, target_count: Math.max(1, Math.round(number(f,'target_count',25))), status: 'DRAFT', config: {} });
  if (error) throw error; revalidatePath('/campaigns');
}

export async function updateCampaign(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const allowed = ['DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED']; const status = required(f,'status').toUpperCase(); if (!allowed.includes(status)) throw new Error('invalid campaign status');
  const { error } = await supabase.from('campaigns').update({ status, target_count: Math.max(1, Math.round(number(f,'target_count',25))), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/campaigns');
}

export async function updateOutreachPolicy(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('outreach_policies').update({ enabled: bool(f,'enabled'), send_window_start: required(f,'send_window_start'), send_window_end: required(f,'send_window_end'), max_emails_per_day: Math.max(0,Math.round(number(f,'max_emails_per_day'))), max_emails_per_mailbox: Math.max(0,Math.round(number(f,'max_emails_per_mailbox'))), max_followups: Math.max(0,Math.round(number(f,'max_followups'))), manual_review_required: bool(f,'manual_review_required'), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/outreach');
}

export async function createMessageTemplate(f: FormData) {
  const { supabase, organizationId } = await owner();
  const { error } = await supabase.from('message_templates').insert({ organization_id: organizationId, name: required(f,'name'), channel: required(f,'channel').toUpperCase(), purpose: required(f,'purpose').toUpperCase(), country_code: text(f,'country_code').toUpperCase() || null, language: required(f,'language'), subject: text(f,'subject') || null, body: required(f,'body'), enabled: true, is_default: bool(f,'is_default'), config: {} });
  if (error) throw error; revalidatePath('/messages');
}

export async function updateMessageTemplate(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('message_templates').update({ name: required(f,'name'), subject: text(f,'subject') || null, body: required(f,'body'), enabled: bool(f,'enabled'), is_default: bool(f,'is_default'), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/messages');
}

export async function createAutomationRule(f: FormData) {
  const { supabase, organizationId } = await owner();
  const { error } = await supabase.from('automation_rules').insert({ organization_id: organizationId, name: required(f,'name'), trigger_key: required(f,'trigger_key'), action_key: required(f,'action_key'), enabled: true, priority: Math.min(100,Math.max(0,Math.round(number(f,'priority',50)))), config: {} });
  if (error) throw error; revalidatePath('/automations');
}

export async function updateAutomationRule(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('automation_rules').update({ enabled: bool(f,'enabled'), priority: Math.min(100,Math.max(0,Math.round(number(f,'priority',50)))), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/automations');
}

export async function updateIntegration(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('integration_connections').update({ enabled: bool(f,'enabled'), account_label: text(f,'account_label') || null, updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/integrations');
}

export async function updateOrganizationSettings(f: FormData) {
  const { supabase, organizationId } = await owner();
  const { error } = await supabase.from('organization_settings').upsert({ organization_id: organizationId, brand_name: required(f,'brand_name'), operator_language: required(f,'operator_language'), default_customer_language: required(f,'default_customer_language'), notification_email: text(f,'notification_email') || null, updated_at: now() }, { onConflict: 'organization_id' });
  if (error) throw error; revalidatePath('/settings');
}

export async function createKnowledge(f: FormData) {
  const { supabase, organizationId } = await owner(); const key = required(f,'knowledge_key');
  const { data } = await supabase.from('knowledge_versions').select('version').eq('organization_id',organizationId).eq('knowledge_key',key).order('version',{ascending:false}).limit(1).maybeSingle();
  const version = (data?.version ?? 0) + 1;
  await supabase.from('knowledge_versions').update({active:false}).eq('organization_id',organizationId).eq('knowledge_key',key);
  const { error } = await supabase.from('knowledge_versions').insert({ organization_id: organizationId, knowledge_key:key, version, payload:{ text: required(f,'content') }, active:true });
  if (error) throw error; revalidatePath('/knowledge');
}

export async function createPromptVersion(f: FormData) {
  const { supabase, organizationId } = await owner(); const agent = required(f,'agent_name');
  const { data } = await supabase.from('prompt_versions').select('version').eq('organization_id',organizationId).eq('agent_name',agent).order('version',{ascending:false}).limit(1).maybeSingle();
  const version = (data?.version ?? 0) + 1;
  await supabase.from('prompt_versions').update({active:false}).eq('organization_id',organizationId).eq('agent_name',agent);
  const { error } = await supabase.from('prompt_versions').insert({ organization_id: organizationId, agent_name:agent, version, prompt_text: required(f,'prompt_text'), active:true });
  if (error) throw error; revalidatePath('/agents');
}

export async function updateLead(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const statuses = ['NEW','AUDITED','QUALIFIED','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON','LOST','DO_NOT_CONTACT'];
  const modes = ['AUTO','PAUSED','HUMAN']; const status = required(f,'status'); const agent_mode = required(f,'agent_mode');
  if (!statuses.includes(status) || !modes.includes(agent_mode)) throw new Error('invalid lead state');
  const { error } = await supabase.from('leads').update({ status, agent_mode, recommended_offer: text(f,'recommended_offer') || null, updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/leads'); revalidatePath('/hot-leads');
}

export async function addSuppression(f: FormData) {
  const { supabase, organizationId } = await owner();
  const email = text(f,'email') || null, phone = text(f,'phone') || null, domain = text(f,'domain') || null; if (!email && !phone && !domain) throw new Error('email, phone or domain required');
  const { error } = await supabase.from('suppression_list').insert({ organization_id: organizationId, email, phone, domain, reason: text(f,'reason') || 'MANUAL', source:'CONTROL_CENTER' });
  if (error) throw error; revalidatePath('/suppression');
}

export async function updatePortfolioItem(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('portfolio_items').update({ title: required(f,'title'), summary: text(f,'summary') || null, public_url: text(f,'public_url') || null, approved: bool(f,'approved'), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/portfolio');
}

export async function updatePreviewTemplate(f: FormData) {
  const { supabase, organizationId } = await owner(); const id = required(f,'id');
  const { error } = await supabase.from('preview_templates').update({ name: required(f,'name'), active: bool(f,'active'), quality_tier: required(f,'quality_tier'), updated_at: now() }).eq('organization_id',organizationId).eq('id',id);
  if (error) throw error; revalidatePath('/preview-studio');
}

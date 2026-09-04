import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { queueShadowDraft, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';
import { evaluateBudgetMode } from '@/lib/reliability/cost-guard';
import {
  chooseSafeAutomationRule,
  conversationIdFromMetadata,
  followupStopReason,
  operationalAlertCodeForBudgetMode,
  operationalAutomationAllowed,
  stableAgentRequestKey,
  type AutomationRuleSnapshot,
} from '@/lib/operations/executor-core';
import { notifyOperationalAlert } from '@/lib/operations/alerts';

const MAX_INBOUND_SCAN = 30;
const MAX_AGENT_TASKS = 5;
const MAX_FOLLOWUPS = 15;
const STUCK_MINUTES = 10;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for operational execution');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

async function loadRules(supabase: SupabaseClient, organizationIds: string[]) {
  if (!organizationIds.length) return new Map<string, AutomationRuleSnapshot[]>();
  const { data, error } = await supabase.from('automation_rules')
    .select('id,organization_id,trigger_key,action_key,priority,config')
    .in('organization_id', organizationIds)
    .eq('enabled', true)
    .order('priority', { ascending: false });
  if (error) throw new Error(`Automation rule lookup failed: ${error.message}`);
  const byOrganization = new Map<string, AutomationRuleSnapshot[]>();
  for (const row of data ?? []) {
    const list = byOrganization.get(String(row.organization_id)) ?? [];
    list.push({
      id: String(row.id),
      triggerKey: String(row.trigger_key),
      actionKey: String(row.action_key),
      priority: Number(row.priority ?? 0),
      config: record(row.config),
    });
    byOrganization.set(String(row.organization_id), list);
  }
  return byOrganization;
}

async function applyStateAutomation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  conversationId: string;
  action: 'REQUIRE_HUMAN' | 'PAUSE_AUTOMATION' | 'SET_STAGE';
  config: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  if (input.action === 'REQUIRE_HUMAN') {
    const [lead, conversation] = await Promise.all([
      input.supabase.from('leads').update({ agent_mode: 'HUMAN', updated_at: now }).eq('organization_id', input.organizationId).eq('id', input.leadId),
      input.supabase.from('sales_conversations').update({ agent_mode: 'HUMAN', stage: 'NEEDS_HUMAN', requires_human: true, awaiting_party: 'HUMAN', updated_at: now }).eq('organization_id', input.organizationId).eq('id', input.conversationId),
    ]);
    if (lead.error || conversation.error) throw new Error(`REQUIRE_HUMAN automation failed: ${lead.error?.message ?? conversation.error?.message}`);
    return;
  }
  if (input.action === 'PAUSE_AUTOMATION') {
    const [lead, conversation] = await Promise.all([
      input.supabase.from('leads').update({ agent_mode: 'PAUSED', updated_at: now }).eq('organization_id', input.organizationId).eq('id', input.leadId),
      input.supabase.from('sales_conversations').update({ agent_mode: 'PAUSED', stage: 'PAUSED', awaiting_party: 'HUMAN', updated_at: now }).eq('organization_id', input.organizationId).eq('id', input.conversationId),
    ]);
    if (lead.error || conversation.error) throw new Error(`PAUSE_AUTOMATION rule failed: ${lead.error?.message ?? conversation.error?.message}`);
    return;
  }
  const stage = String(input.config.stage ?? '').toUpperCase();
  const requiresHuman = stage === 'NEEDS_HUMAN';
  const { error } = await input.supabase.from('sales_conversations').update({
    stage,
    requires_human: requiresHuman,
    awaiting_party: requiresHuman ? 'HUMAN' : stage === 'WAITING_CUSTOMER' ? 'CUSTOMER' : 'NONE',
    updated_at: now,
  }).eq('organization_id', input.organizationId).eq('id', input.conversationId);
  if (error) throw new Error(`SET_STAGE automation failed: ${error.message}`);
}

async function processFollowup(input: {
  supabase: SupabaseClient;
  job: Record<string, unknown>;
  controls: Record<string, unknown>;
  rules: AutomationRuleSnapshot[];
}) {
  const organizationId = String(input.job.organization_id);
  const leadId = String(input.job.lead_id);
  const jobId = String(input.job.id);
  const [leadResult, conversationResult, inboundResult, outboundResult, existingDraftResult] = await Promise.all([
    input.supabase.from('leads').select('id,business_id,status,agent_mode').eq('organization_id', organizationId).eq('id', leadId).maybeSingle(),
    input.supabase.from('sales_conversations').select('id,channel,stage,agent_mode,requires_human,last_inbound_at,last_outbound_at').eq('organization_id', organizationId).eq('lead_id', leadId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    input.supabase.from('outreach_messages').select('received_at,created_at').eq('organization_id', organizationId).eq('lead_id', leadId).eq('direction', 'INBOUND').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    input.supabase.from('outreach_messages').select('mailbox_id,subject,sent_at,created_at').eq('organization_id', organizationId).eq('lead_id', leadId).eq('direction', 'OUTBOUND').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    input.supabase.from('conversation_messages').select('id,status').eq('organization_id', organizationId).eq('provider_message_id', shadowProviderMessageId(`followup:${jobId}`)).maybeSingle(),
  ]);
  const firstError = [leadResult.error, conversationResult.error, inboundResult.error, outboundResult.error, existingDraftResult.error].find(Boolean);
  if (firstError) throw new Error(`Follow-up state lookup failed: ${firstError!.message}`);
  const lead = leadResult.data;
  const conversation = conversationResult.data;
  if (!lead || !conversation) {
    await input.supabase.from('followup_jobs').update({ status: 'CANCELLED', stop_reason: 'CANONICAL_LINKAGE_MISSING' }).eq('organization_id', organizationId).eq('id', jobId).eq('status', 'PENDING');
    return { jobId, action: 'CANCELLED', reason: 'CANONICAL_LINKAGE_MISSING' };
  }

  if (existingDraftResult.data) {
    if (existingDraftResult.data.status === 'SENT') {
      await input.supabase.from('followup_jobs').update({ status: 'COMPLETED', stop_reason: null }).eq('organization_id', organizationId).eq('id', jobId).eq('status', 'PENDING');
      return { jobId, action: 'COMPLETED', reason: 'FOLLOWUP_SENT' };
    }
    return { jobId, action: 'WAITING', reason: `DRAFT_${existingDraftResult.data.status}` };
  }

  const lastInboundAt = stringValue(inboundResult.data?.received_at ?? inboundResult.data?.created_at ?? conversation.last_inbound_at);
  const lastOutboundAt = stringValue(outboundResult.data?.sent_at ?? outboundResult.data?.created_at ?? conversation.last_outbound_at);
  const stop = followupStopReason({
    safety: {
      globalKillSwitch: Boolean(input.controls.global_kill_switch),
      agentsPaused: Boolean(input.controls.agents_paused),
      leadStatus: lead.status,
      leadAgentMode: lead.agent_mode,
      conversationStage: conversation.stage,
      conversationAgentMode: conversation.agent_mode,
      conversationRequiresHuman: Boolean(conversation.requires_human),
    },
    lastInboundAt,
    lastOutboundAt,
  });
  if (stop && stop !== 'GLOBAL_KILL_SWITCH' && stop !== 'AGENTS_PAUSED') {
    await input.supabase.from('followup_jobs').update({ status: 'CANCELLED', stop_reason: stop }).eq('organization_id', organizationId).eq('id', jobId).eq('status', 'PENDING');
    return { jobId, action: 'CANCELLED', reason: stop };
  }

  await input.supabase.from('sales_conversations').update({ stage: 'FOLLOW_UP_DUE', updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', conversation.id);
  if (stop) return { jobId, action: 'BLOCKED', reason: stop };

  const decision = chooseSafeAutomationRule({
    rules: input.rules,
    triggerKey: 'FOLLOWUP_DUE',
    channel: conversation.channel,
    leadStatus: lead.status,
    conversationStage: 'FOLLOW_UP_DUE',
  });
  if (decision.action === 'NONE') return { jobId, action: 'OWNER_REVIEW', reason: 'NO_FOLLOWUP_AUTOMATION_RULE' };
  if (decision.action === 'BLOCKED_UNSAFE_ACTION' || decision.action === 'BLOCKED_INVALID_CONFIG') {
    return { jobId, action: 'BLOCKED', reason: decision.action, ruleId: decision.rule?.id };
  }
  if (!decision.rule) return { jobId, action: 'OWNER_REVIEW', reason: 'RULE_UNAVAILABLE' };

  if (decision.action === 'REQUIRE_HUMAN' || decision.action === 'PAUSE_AUTOMATION' || decision.action === 'SET_STAGE') {
    await applyStateAutomation({
      supabase: input.supabase,
      organizationId,
      leadId,
      conversationId: String(conversation.id),
      action: decision.action,
      config: decision.rule.config,
    });
    return { jobId, action: decision.action, ruleId: decision.rule.id };
  }

  const templateId = String(decision.rule.config.message_template_id ?? '');
  const [templateResult, businessResult, marketResult] = await Promise.all([
    input.supabase.from('message_templates').select('id,channel,subject,body,language,enabled').eq('organization_id', organizationId).eq('id', templateId).maybeSingle(),
    lead.business_id
      ? input.supabase.from('businesses').select('id,country_code,email,whatsapp,phone,international_phone').eq('organization_id', organizationId).eq('id', lead.business_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead.business_id
      ? input.supabase.from('businesses').select('country_code').eq('organization_id', organizationId).eq('id', lead.business_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (templateResult.error || businessResult.error || marketResult.error) throw new Error(`Follow-up template lookup failed: ${templateResult.error?.message ?? businessResult.error?.message ?? marketResult.error?.message}`);
  const template = templateResult.data;
  const business = businessResult.data;
  if (!template?.enabled || !business || template.channel !== conversation.channel) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_TEMPLATE_INVALID' };
  const marketCode = String(business.country_code ?? marketResult.data?.country_code ?? '').toUpperCase();
  if (!marketCode) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_MARKET_MISSING' };
  const { data: market, error: marketError } = await input.supabase.from('market_settings').select('timezone').eq('organization_id', organizationId).eq('country_code', marketCode).maybeSingle();
  if (marketError || !market) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_MARKET_SETTINGS_MISSING' };

  if (conversation.channel === 'EMAIL') {
    const recipient = stringValue(business.email);
    const mailboxId = stringValue(outboundResult.data?.mailbox_id);
    if (!recipient || !mailboxId) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_EMAIL_CONTEXT_MISSING' };
    await queueShadowDraft({
      organizationId,
      conversationId: String(conversation.id),
      leadId,
      channel: 'EMAIL',
      draft: String(template.body),
      subject: stringValue(template.subject) ?? stringValue(outboundResult.data?.subject) ?? 'Follow-up',
      mailboxId,
      to: recipient,
      marketCode,
      leadTimezone: String(market.timezone),
      idempotencyKey: `followup:${jobId}`,
      replyLanguage: stringValue(template.language) ?? undefined,
    });
    return { jobId, action: 'QUEUED_FOR_APPROVAL', ruleId: decision.rule.id };
  }

  const recipient = stringValue(business.whatsapp ?? business.international_phone ?? business.phone);
  if (!recipient) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_WHATSAPP_RECIPIENT_MISSING' };
  const templateName = stringValue(decision.rule.config.meta_template_name);
  const templateLanguageCode = stringValue(decision.rule.config.meta_template_language_code) ?? 'en';
  const policy = evaluateWhatsAppSendPolicy({ lastCustomerMessageAt: lastInboundAt ?? undefined, templateName: templateName ?? undefined });
  if (!policy.allowed) return { jobId, action: 'BLOCKED', reason: 'FOLLOWUP_WHATSAPP_TEMPLATE_REQUIRED' };
  await queueShadowDraft({
    organizationId,
    conversationId: String(conversation.id),
    leadId,
    channel: 'WHATSAPP',
    draft: String(template.body),
    to: recipient,
    marketCode,
    leadTimezone: String(market.timezone),
    lastCustomerMessageAt: lastInboundAt ?? undefined,
    templateName: templateName ?? undefined,
    templateLanguageCode,
    idempotencyKey: `followup:${jobId}`,
    replyLanguage: stringValue(template.language) ?? undefined,
  });
  return { jobId, action: 'QUEUED_FOR_APPROVAL', ruleId: decision.rule.id };
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;
  const supabase = serviceClient();
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - STUCK_MINUTES * 60_000).toISOString();

  const [controlsResult, inboundResult, followupResult, stuckResult, failedSendResult] = await Promise.all([
    supabase.from('system_controls').select('organization_id,global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode'),
    supabase.from('outreach_messages').select('id,organization_id,lead_id,channel,body,provider_message_id,metadata,received_at,created_at').eq('direction', 'INBOUND').eq('status', 'RECEIVED').in('channel', ['EMAIL','WHATSAPP']).not('provider_message_id', 'is', null).order('created_at', { ascending: true }).limit(MAX_INBOUND_SCAN),
    supabase.from('followup_jobs').select('id,organization_id,lead_id,campaign_id,sequence,scheduled_at,status').eq('status', 'PENDING').lte('scheduled_at', now.toISOString()).order('scheduled_at', { ascending: true }).limit(MAX_FOLLOWUPS),
    supabase.from('agent_runs').select('id,organization_id,lead_id,conversation_id,request_key,started_at').eq('status', 'PROCESSING').lt('started_at', stuckBefore).limit(25),
    supabase.from('conversation_messages').select('id,organization_id,lead_id,status,approval_reason,processed_at').eq('status', 'FAILED').not('approval_reason', 'is', null).order('processed_at', { ascending: false }).limit(50),
  ]);
  const firstError = [controlsResult.error, inboundResult.error, followupResult.error, stuckResult.error, failedSendResult.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: `Operational discovery failed: ${firstError!.message}` }, { status: 503 });

  const controlsByOrganization = new Map((controlsResult.data ?? []).map((row) => [String(row.organization_id), record(row)]));
  const organizationIds = [...controlsByOrganization.keys()];
  let rulesByOrganization: Map<string, AutomationRuleSnapshot[]>;
  try {
    rulesByOrganization = await loadRules(supabase, organizationIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Automation rules unavailable' }, { status: 503 });
  }

  for (const run of stuckResult.data ?? []) {
    try {
      await notifyOperationalAlert({
        supabase,
        organizationId: String(run.organization_id),
        code: 'INBOUND_STUCK',
        eventKey: `stuck:${run.id}`,
        detail: `Agent run ${run.id} has remained PROCESSING since ${run.started_at}. No automatic retry was started.`,
        entityType: 'agent_run',
        entityId: String(run.id),
        payload: { requestKey: run.request_key, leadId: run.lead_id, conversationId: run.conversation_id },
      });
    } catch { /* Telegram failure never changes execution state. */ }
  }

  for (const row of failedSendResult.data ?? []) {
    const reason = String(row.approval_reason ?? '');
    const code = reason.includes('GLOBAL_KILL_SWITCH') ? 'KILL_SWITCH_BLOCKED_SEND'
      : reason.includes('RECONCILIATION_REQUIRED') || reason.includes('Provider-accepted') ? 'RECONCILIATION_REQUIRED'
      : null;
    if (!code) continue;
    try {
      await notifyOperationalAlert({
        supabase,
        organizationId: String(row.organization_id),
        code,
        eventKey: `send:${row.id}:${code}`,
        detail: reason,
        entityType: 'conversation_message',
        entityId: String(row.id),
        payload: { leadId: row.lead_id },
      });
    } catch { /* notification-only */ }
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  for (const organizationId of organizationIds) {
    try {
      const [{ data: settings, error: settingsError }, usage] = await Promise.all([
        supabase.from('cost_guard_settings').select('monthly_total_budget_usd,warning_pct,throttle_pct,critical_pct,hard_stop_pct').eq('organization_id', organizationId).maybeSingle(),
        supabase.rpc('get_cost_guard_monthly_usage', { p_organization_id: organizationId, p_start: monthStart }),
      ]);
      if (settingsError || usage.error || !settings) continue;
      const spend = (usage.data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + Math.max(0, Number(row.cost_usd ?? 0)), 0);
      const budget = evaluateBudgetMode(spend, {
        monthly_total_budget_usd: Number(settings.monthly_total_budget_usd),
        warning_pct: Number(settings.warning_pct),
        throttle_pct: Number(settings.throttle_pct),
        critical_pct: Number(settings.critical_pct),
        hard_stop_pct: Number(settings.hard_stop_pct),
      });
      const code = operationalAlertCodeForBudgetMode(budget.mode);
      if (code) await notifyOperationalAlert({
        supabase,
        organizationId,
        code,
        eventKey: `budget:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}:${budget.mode}`,
        detail: `${budget.percentUsed.toFixed(1)}% of monthly budget used (${spend.toFixed(4)} USD). Mode: ${budget.mode}.`,
        entityType: 'cost_guard_settings',
        entityId: organizationId,
        payload: { percentUsed: budget.percentUsed, mode: budget.mode },
      });
    } catch { /* fail closed in paid operations; alert sampling must not break tick */ }
  }

  const agentTasks: Array<{ requestKey: string; channel: 'EMAIL'|'WHATSAPP'; payload: Record<string, unknown> }> = [];
  for (const inbound of inboundResult.data ?? []) {
    if (agentTasks.length >= MAX_AGENT_TASKS) break;
    const channel = String(inbound.channel).toUpperCase();
    const providerMessageId = String(inbound.provider_message_id ?? '').trim();
    const leadId = stringValue(inbound.lead_id);
    const conversationId = conversationIdFromMetadata(inbound.metadata);
    if (!leadId || !conversationId || !providerMessageId || !['EMAIL','WHATSAPP'].includes(channel)) continue;
    const requestKey = stableAgentRequestKey(channel, providerMessageId);
    const { data: existingRun, error: runError } = await supabase.from('agent_runs').select('id,status').eq('organization_id', inbound.organization_id).eq('request_key', requestKey).maybeSingle();
    if (runError || existingRun) continue;

    const [leadResult, conversationResult] = await Promise.all([
      supabase.from('leads').select('id,business_id,status,agent_mode').eq('organization_id', inbound.organization_id).eq('id', leadId).maybeSingle(),
      supabase.from('sales_conversations').select('id,lead_id,channel,stage,agent_mode,requires_human').eq('organization_id', inbound.organization_id).eq('id', conversationId).maybeSingle(),
    ]);
    if (leadResult.error || conversationResult.error || !leadResult.data || !conversationResult.data) continue;
    const lead = leadResult.data;
    const conversation = conversationResult.data;
    if (conversation.lead_id !== leadId || conversation.channel !== channel) continue;
    const controls = controlsByOrganization.get(String(inbound.organization_id)) ?? {};
    const safety = operationalAutomationAllowed({
      globalKillSwitch: Boolean(controls.global_kill_switch),
      agentsPaused: Boolean(controls.agents_paused),
      leadStatus: lead.status,
      leadAgentMode: lead.agent_mode,
      conversationStage: conversation.stage,
      conversationAgentMode: conversation.agent_mode,
      conversationRequiresHuman: Boolean(conversation.requires_human),
    });
    if (!safety.allowed) continue;

    const decision = chooseSafeAutomationRule({
      rules: rulesByOrganization.get(String(inbound.organization_id)) ?? [],
      triggerKey: 'INBOUND_RECEIVED',
      channel,
      leadStatus: lead.status,
      conversationStage: conversation.stage,
    });
    if (decision.action === 'REQUIRE_HUMAN' || decision.action === 'PAUSE_AUTOMATION' || decision.action === 'SET_STAGE') {
      try {
        await applyStateAutomation({
          supabase,
          organizationId: String(inbound.organization_id),
          leadId,
          conversationId,
          action: decision.action,
          config: decision.rule?.config ?? {},
        });
      } catch { /* fail closed: do not call AI after a failed state automation */ }
      continue;
    }
    if (decision.action === 'BLOCKED_UNSAFE_ACTION' || decision.action === 'BLOCKED_INVALID_CONFIG' || decision.action === 'QUEUE_TEMPLATE_APPROVAL') continue;

    const payload: Record<string, unknown> = {
      context: {
        organizationId: String(inbound.organization_id),
        leadId,
        conversationId,
        message: String(inbound.body),
      },
      idempotencyKey: requestKey,
    };
    if (channel === 'WHATSAPP' && lead.business_id) {
      const { data: business } = await supabase.from('businesses').select('country_code,whatsapp,international_phone,phone').eq('organization_id', inbound.organization_id).eq('id', lead.business_id).maybeSingle();
      const to = stringValue(business?.whatsapp ?? business?.international_phone ?? business?.phone);
      const marketCode = stringValue(business?.country_code)?.toUpperCase();
      if (!to || !marketCode) continue;
      payload.deliveryContext = { conversationId, to, marketCode };
    }
    agentTasks.push({ requestKey, channel: channel as 'EMAIL'|'WHATSAPP', payload });
  }

  const followupResults: Array<Record<string, unknown>> = [];
  for (const job of followupResult.data ?? []) {
    const organizationId = String(job.organization_id);
    const controls = controlsByOrganization.get(organizationId) ?? {};
    try {
      const result = await processFollowup({ supabase, job: record(job), controls, rules: rulesByOrganization.get(organizationId) ?? [] });
      followupResults.push(result);
      if (result.action === 'OWNER_REVIEW' || result.action === 'BLOCKED') {
        await notifyOperationalAlert({
          supabase,
          organizationId,
          code: 'FOLLOWUP_FAILED',
          eventKey: `followup:${job.id}:${result.reason ?? result.action}`,
          detail: `Follow-up ${job.id} is due but no customer send occurred. State: ${result.action}; reason: ${result.reason ?? 'review required'}.`,
          entityType: 'followup_job',
          entityId: String(job.id),
          payload: { leadId: job.lead_id, sequence: job.sequence, action: result.action, reason: result.reason ?? null },
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Follow-up executor failed';
      followupResults.push({ jobId: job.id, action: 'ERROR', reason: detail });
      try {
        await notifyOperationalAlert({
          supabase,
          organizationId,
          code: 'FOLLOWUP_FAILED',
          eventKey: `followup:${job.id}:error`,
          detail,
          entityType: 'followup_job',
          entityId: String(job.id),
          payload: { leadId: job.lead_id, sequence: job.sequence },
        });
      } catch { /* notification-only */ }
    }
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    agentTasks,
    followups: followupResults,
    limits: { maxAgentTasksPerTick: MAX_AGENT_TASKS, maxInboundScan: MAX_INBOUND_SCAN, maxFollowups: MAX_FOLLOWUPS },
  });
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateProductionAsset } from '@/lib/preview/production-service';
import { persistHumanHandoff } from '@/lib/conversations/sales-lifecycle';

type JsonRecord = Record<string, unknown>;

export type ApprovedSendInvoker = (input: {
  organizationId: string;
  messageId: string;
}) => Promise<{ status: number; body: JsonRecord }>;

type RuntimeAction = {
  id: string;
  organization_id: string;
  automation_run_id: string;
  action_key: string;
  action_config: JsonRecord | null;
  idempotency_key: string;
  retry_policy: string;
  output_payload: JsonRecord | null;
};

type RuntimeRun = {
  id: string;
  organization_id: string;
  automation_rule_id: string;
  owner_user_id: string;
  subject_type: string | null;
  subject_id: string | null;
  trigger_payload: JsonRecord | null;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
}

function boundedInteger(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

async function loadRun(supabase: SupabaseClient, action: RuntimeAction): Promise<RuntimeRun> {
  const { data, error } = await supabase.from('automation_runs')
    .select('id,organization_id,automation_rule_id,owner_user_id,subject_type,subject_id,trigger_payload')
    .eq('organization_id', action.organization_id)
    .eq('id', action.automation_run_id)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Automation runtime parent run not found');
  return {
    ...data,
    trigger_payload: record(data.trigger_payload),
  } as RuntimeRun;
}

async function complete(
  supabase: SupabaseClient,
  action: RuntimeAction,
  workerId: string,
  outcome: 'SUCCEEDED'|'WAITING_APPROVAL'|'WAITING_RELEASE'|'RECONCILIATION_REQUIRED'|'RETRY'|'FAILED'|'CANCELLED',
  options: {
    output?: JsonRecord;
    verification?: JsonRecord;
    error?: string | null;
    providerAccepted?: boolean;
    retryAfterSeconds?: number | null;
  } = {},
) {
  const { data, error } = await supabase.rpc('complete_automation_runtime_action', {
    p_action_id: action.id,
    p_worker_id: workerId,
    p_outcome: outcome,
    p_output_payload: options.output ?? {},
    p_verification_payload: options.verification ?? {},
    p_error: options.error ?? null,
    p_provider_accepted: options.providerAccepted ?? false,
    p_retry_after_seconds: options.retryAfterSeconds ?? null,
  });
  if (error) throw new Error(`Automation runtime completion failed: ${error.message}`);
  return record(data);
}

async function executeGeneratePreview(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
) {
  if (run.subject_type !== 'LEAD' || !run.subject_id) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'GENERATE_PREVIEW_REQUIRES_LEAD_SUBJECT' });
  }
  const config = record(action.action_config);
  type PreviewInput = Parameters<typeof generateProductionAsset>[0];
  const result = await generateProductionAsset({
    organizationId: run.organization_id,
    leadId: run.subject_id,
    explicitRequest: config.explicitRequest === true,
    ownerApprovedHeavyGeneration: config.ownerApprovedHeavyGeneration === true,
    siteLanguage: optionalString(config.siteLanguage) as PreviewInput['siteLanguage'],
    siteLanguageSource: optionalString(config.siteLanguageSource) as PreviewInput['siteLanguageSource'],
  });
  if (!result.eligible) {
    return complete(supabase, action, workerId, 'CANCELLED', {
      output: { eligible: false },
      verification: { verified: false, reason: 'PREVIEW_NOT_ELIGIBLE' },
      error: 'PREVIEW_NOT_ELIGIBLE',
    });
  }

  const { data: event, error: eventError } = await supabase.from('preview_events')
    .select('id,event_type')
    .eq('organization_id', run.organization_id)
    .eq('preview_id', result.previewId)
    .in('event_type', ['GENERATED','QUALITY_FAILED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventError) throw new Error(`Preview verification failed: ${eventError.message}`);
  if (!event) {
    return complete(supabase, action, workerId, 'RETRY', {
      output: { previewId: result.previewId, status: result.status },
      verification: { verified: false, reason: 'PREVIEW_EVENT_MISSING' },
      error: 'PREVIEW_EVENT_MISSING',
      retryAfterSeconds: 30,
    });
  }

  return complete(supabase, action, workerId, 'SUCCEEDED', {
    output: {
      previewId: result.previewId,
      status: result.status,
      reused: result.reused,
    },
    verification: {
      verified: true,
      previewId: result.previewId,
      eventType: event.event_type,
    },
  });
}

async function executeHumanHandoff(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
) {
  if (run.subject_type !== 'CONVERSATION' || !run.subject_id) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'HANDOFF_HUMAN_REQUIRES_CONVERSATION_SUBJECT' });
  }
  const { data: conversation, error: lookupError } = await supabase.from('sales_conversations')
    .select('id,lead_id')
    .eq('organization_id', run.organization_id)
    .eq('id', run.subject_id)
    .maybeSingle();
  if (lookupError || !conversation) {
    return complete(supabase, action, workerId, 'FAILED', { error: lookupError?.message ?? 'HANDOFF_CONVERSATION_NOT_FOUND' });
  }

  const result = await persistHumanHandoff({
    supabase,
    organizationId: run.organization_id,
    conversationId: run.subject_id,
    leadId: conversation.lead_id,
    reasons: stringArray(record(action.action_config).reasons),
    requestKey: action.idempotency_key,
    actorType: 'SYSTEM',
    actorId: 'automation_runtime',
  });
  if ('terminal' in result && result.terminal) {
    return complete(supabase, action, workerId, 'CANCELLED', {
      output: { terminal: true },
      verification: { verified: false, reason: 'HANDOFF_TARGET_TERMINAL' },
      error: 'HANDOFF_TARGET_TERMINAL',
    });
  }

  const [{ data: current, error: currentError }, { data: event, error: eventError }] = await Promise.all([
    supabase.from('sales_conversations')
      .select('agent_mode,requires_human,stage')
      .eq('organization_id', run.organization_id)
      .eq('id', run.subject_id)
      .maybeSingle(),
    supabase.from('handoff_events')
      .select('id,to_mode')
      .eq('organization_id', run.organization_id)
      .eq('request_key', action.idempotency_key)
      .maybeSingle(),
  ]);
  if (currentError || eventError) throw new Error(currentError?.message ?? eventError?.message ?? 'Handoff verification failed');
  const verified = current?.agent_mode === 'HUMAN'
    && current.requires_human === true
    && event?.to_mode === 'HUMAN';
  if (!verified) {
    return complete(supabase, action, workerId, 'RETRY', {
      output: { eventRecorded: result.eventRecorded },
      verification: { verified: false, reason: 'HANDOFF_VERIFICATION_MISMATCH' },
      error: 'HANDOFF_VERIFICATION_MISMATCH',
      retryAfterSeconds: 30,
    });
  }

  return complete(supabase, action, workerId, 'SUCCEEDED', {
    output: { eventId: event.id, conversationId: run.subject_id },
    verification: { verified: true, mode: 'HUMAN', stage: current.stage },
  });
}

async function executeOperatorBrief(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
) {
  if (run.subject_type !== 'CONVERSATION' || !run.subject_id) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'CREATE_OPERATOR_BRIEF_REQUIRES_CONVERSATION_SUBJECT' });
  }
  const config = record(action.action_config);
  const { data, error } = await supabase.rpc('create_automation_operator_brief', {
    p_organization_id: run.organization_id,
    p_conversation_id: run.subject_id,
    p_message_id: optionalString(config.messageId) ?? null,
    p_request_key: action.idempotency_key,
    p_brief_type: optionalString(config.briefType) ?? '',
    p_title: optionalString(config.title) ?? '',
    p_summary: optionalString(config.summary) ?? '',
    p_details: record(config.details),
    p_requires_action: config.requiresAction === true,
  });
  if (error) throw new Error(error.message);
  const output = record(data);
  return complete(supabase, action, workerId, 'SUCCEEDED', {
    output,
    verification: { verified: output.verified === true, briefId: output.briefId },
  });
}

async function executeMarkHot(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
) {
  if (run.subject_type !== 'LEAD' || !run.subject_id) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'MARK_HOT_REQUIRES_LEAD_SUBJECT' });
  }
  const minimumScore = boundedInteger(record(action.action_config).minimumScore, 50, 100);
  if (minimumScore === null) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'MARK_HOT_MINIMUM_SCORE_REQUIRED' });
  }
  const { data, error } = await supabase.rpc('mark_crm_lead_hot_from_automation', {
    p_organization_id: run.organization_id,
    p_actor_user_id: run.owner_user_id,
    p_lead_id: run.subject_id,
    p_minimum_score: minimumScore,
    p_request_key: action.idempotency_key,
  });
  if (error) throw new Error(error.message);
  const output = record(data);
  const verified = output.status === 'HOT' && Number(output.effectiveScore) >= minimumScore;
  if (!verified) throw new Error('MARK_HOT verification failed');
  return complete(supabase, action, workerId, 'SUCCEEDED', {
    output,
    verification: { verified: true, status: 'HOT', effectiveScore: output.effectiveScore },
  });
}

async function executePause(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
) {
  const { data, error } = await supabase.rpc('pause_automation_rule_from_runtime', {
    p_organization_id: run.organization_id,
    p_rule_id: run.automation_rule_id,
    p_request_key: action.idempotency_key,
  });
  if (error) throw new Error(error.message);
  const output = record(data);
  const verified = output.enabled === false && output.executionState === 'DISABLED';
  if (!verified) throw new Error('PAUSE_AUTOMATION verification failed');
  return complete(supabase, action, workerId, 'SUCCEEDED', {
    output,
    verification: { verified: true, enabled: false, executionState: 'DISABLED' },
  });
}

async function executeSendFollowup(
  supabase: SupabaseClient,
  action: RuntimeAction,
  run: RuntimeRun,
  workerId: string,
  approvedSend: ApprovedSendInvoker,
) {
  if (run.subject_type !== 'CONVERSATION' || !run.subject_id) {
    return complete(supabase, action, workerId, 'FAILED', { error: 'SEND_FOLLOWUP_REQUIRES_CONVERSATION_SUBJECT' });
  }
  const config = record(action.action_config);
  const existingOutput = record(action.output_payload);
  let messageId = optionalString(existingOutput.messageId);

  if (!messageId) {
    const { data: conversation, error: conversationError } = await supabase.from('sales_conversations')
      .select('id,lead_id,channel')
      .eq('organization_id', run.organization_id)
      .eq('id', run.subject_id)
      .maybeSingle();
    if (conversationError || !conversation?.lead_id) {
      return complete(supabase, action, workerId, 'FAILED', {
        error: conversationError?.message ?? 'SEND_FOLLOWUP_CONVERSATION_LINKAGE_MISSING',
      });
    }
    const body = optionalString(config.body);
    const sendContext = record(config.sendContext);
    if (!body) {
      return complete(supabase, action, workerId, 'FAILED', { error: 'SEND_FOLLOWUP_BODY_REQUIRED' });
    }
    const { data, error } = await supabase.rpc('create_automation_approval_message', {
      p_organization_id: run.organization_id,
      p_conversation_id: run.subject_id,
      p_lead_id: conversation.lead_id,
      p_channel: conversation.channel,
      p_body: body,
      p_send_context: sendContext,
      p_request_key: action.idempotency_key,
    });
    if (error) throw new Error(error.message);
    const output = record(data);
    messageId = optionalString(output.messageId);
    if (!messageId) throw new Error('SEND_FOLLOWUP approval artifact missing messageId');
    return complete(supabase, action, workerId, 'WAITING_APPROVAL', {
      output: { ...output, messageId },
      verification: { verified: true, artifactPersisted: true },
    });
  }

  const [{ data: message, error: messageError }, { data: controls, error: controlsError }] = await Promise.all([
    supabase.from('conversation_messages')
      .select('id,status,requires_approval,provider_message_id,approval_decision')
      .eq('organization_id', run.organization_id)
      .eq('id', messageId)
      .maybeSingle(),
    supabase.from('system_controls')
      .select('shadow_mode')
      .eq('organization_id', run.organization_id)
      .maybeSingle(),
  ]);
  if (messageError || controlsError || !message || !controls) {
    throw new Error(messageError?.message ?? controlsError?.message ?? 'SEND_FOLLOWUP state unavailable');
  }
  if (message.status === 'SENT' && message.provider_message_id) {
    return complete(supabase, action, workerId, 'SUCCEEDED', {
      output: { ...existingOutput, messageId, providerMessageId: message.provider_message_id },
      verification: { verified: true, messageStatus: 'SENT' },
      providerAccepted: true,
    });
  }
  if (message.requires_approval || message.status === 'APPROVAL_REQUIRED') {
    return complete(supabase, action, workerId, 'WAITING_APPROVAL', {
      output: { ...existingOutput, messageId },
      verification: { verified: true, awaitingApproval: true },
    });
  }
  if (message.status === 'BLOCKED' || ['REJECTED','EXPIRED'].includes(String(message.approval_decision ?? ''))) {
    return complete(supabase, action, workerId, 'CANCELLED', {
      output: { ...existingOutput, messageId },
      verification: { verified: true, blocked: true },
      error: 'SEND_FOLLOWUP_APPROVAL_BLOCKED',
    });
  }
  if (controls.shadow_mode) {
    return complete(supabase, action, workerId, 'WAITING_RELEASE', {
      output: { ...existingOutput, messageId },
      verification: { verified: true, shadowMode: true },
      error: 'SHADOW_MODE_RELEASE_REQUIRED',
    });
  }
  if (message.status !== 'APPROVED') {
    return complete(supabase, action, workerId, 'FAILED', {
      output: { ...existingOutput, messageId },
      error: `SEND_FOLLOWUP_MESSAGE_NOT_APPROVED:${message.status}`,
    });
  }

  const response = await approvedSend({ organizationId: run.organization_id, messageId });
  const providerAccepted = response.body.providerAccepted === true;
  if (response.status >= 200 && response.status < 300) {
    const { data: sent, error: sentError } = await supabase.from('conversation_messages')
      .select('status,provider_message_id')
      .eq('organization_id', run.organization_id)
      .eq('id', messageId)
      .maybeSingle();
    if (sentError) throw new Error(sentError.message);
    if (sent?.status === 'SENT' && sent.provider_message_id) {
      return complete(supabase, action, workerId, 'SUCCEEDED', {
        output: { ...existingOutput, messageId, providerMessageId: sent.provider_message_id },
        verification: { verified: true, messageStatus: 'SENT' },
        providerAccepted: true,
      });
    }
    return complete(supabase, action, workerId, 'RECONCILIATION_REQUIRED', {
      output: { ...existingOutput, messageId, ...response.body },
      verification: { verified: false, reason: 'PROVIDER_RESPONSE_NOT_RECONCILED' },
      error: 'PROVIDER_RESPONSE_NOT_RECONCILED',
      providerAccepted: true,
    });
  }

  if (providerAccepted) {
    return complete(supabase, action, workerId, 'RECONCILIATION_REQUIRED', {
      output: { ...existingOutput, messageId, ...response.body },
      verification: { verified: false, reason: 'PROVIDER_ACCEPTED_RECONCILIATION_REQUIRED' },
      error: optionalString(response.body.error) ?? 'PROVIDER_ACCEPTED_RECONCILIATION_REQUIRED',
      providerAccepted: true,
    });
  }
  return complete(supabase, action, workerId, 'FAILED', {
    output: { ...existingOutput, messageId, ...response.body },
    verification: { verified: false, providerAccepted: false },
    error: optionalString(response.body.error) ?? `APPROVED_SEND_HTTP_${response.status}`,
  });
}

export async function executeAutomationRuntimeAction(input: {
  supabase: SupabaseClient;
  action: RuntimeAction;
  workerId: string;
  approvedSend: ApprovedSendInvoker;
}) {
  const run = await loadRun(input.supabase, input.action);
  switch (input.action.action_key) {
    case 'GENERATE_PREVIEW':
      return executeGeneratePreview(input.supabase, input.action, run, input.workerId);
    case 'HANDOFF_HUMAN':
      return executeHumanHandoff(input.supabase, input.action, run, input.workerId);
    case 'CREATE_OPERATOR_BRIEF':
      return executeOperatorBrief(input.supabase, input.action, run, input.workerId);
    case 'MARK_HOT':
      return executeMarkHot(input.supabase, input.action, run, input.workerId);
    case 'PAUSE_AUTOMATION':
      return executePause(input.supabase, input.action, run, input.workerId);
    case 'SEND_FOLLOWUP':
      return executeSendFollowup(input.supabase, input.action, run, input.workerId, input.approvedSend);
    default:
      return complete(input.supabase, input.action, input.workerId, 'FAILED', {
        error: `UNSUPPORTED_AUTOMATION_ACTION:${input.action.action_key}`,
      });
  }
}

export async function runAutomationRuntimeTick(input: {
  supabase: SupabaseClient;
  workerId: string;
  approvedSend: ApprovedSendInvoker;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(25, Math.round(input.limit ?? 10)));

  const bookingEvents = await input.supabase.rpc(
    'reconcile_booking_automation_events',
    { p_limit: 100 },
  );
  if (bookingEvents.error && bookingEvents.error.code !== 'PGRST202') {
    throw new Error(`Booking automation event reconciliation failed: ${bookingEvents.error.message}`);
  }

  const quoteEvents = await input.supabase.rpc(
    'reconcile_quote_automation_events',
    { p_limit: 100 },
  );
  if (quoteEvents.error && quoteEvents.error.code !== 'PGRST202') {
    throw new Error(`Quote automation event reconciliation failed: ${quoteEvents.error.message}`);
  }

  const approvalDeadlines = await input.supabase.rpc(
    'reconcile_automation_runtime_approval_deadlines',
    { p_limit: 100 },
  );
  if (approvalDeadlines.error) {
    throw new Error(`Automation approval deadline reconciliation failed: ${approvalDeadlines.error.message}`);
  }

  const waiting = await input.supabase.rpc('reconcile_automation_runtime_waiting', { p_limit: 100 });
  if (waiting.error) throw new Error(`Automation waiting reconciliation failed: ${waiting.error.message}`);

  const timeouts = await input.supabase.rpc('reap_automation_runtime_timeouts', { p_limit: 100 });
  if (timeouts.error) throw new Error(`Automation timeout reap failed: ${timeouts.error.message}`);

  const { data: claimed, error: claimError } = await input.supabase.rpc('claim_automation_runtime_actions', {
    p_worker_id: input.workerId,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (claimError) throw new Error(`Automation action claim failed: ${claimError.message}`);

  let succeeded = 0;
  let waitingCount = 0;
  let failed = 0;
  for (const row of claimed ?? []) {
    const action = {
      ...row,
      action_config: record(row.action_config),
      output_payload: record(row.output_payload),
    } as RuntimeAction;
    try {
      const result = await executeAutomationRuntimeAction({
        supabase: input.supabase,
        action,
        workerId: input.workerId,
        approvedSend: input.approvedSend,
      });
      const status = String(result.status ?? result.runStatus ?? '');
      if (status === 'SUCCEEDED' || status === 'COMPLETED') succeeded += 1;
      else if (status.startsWith('WAITING') || status === 'VERIFYING') waitingCount += 1;
      else if (status === 'DEAD_LETTER' || status === 'FAILED') failed += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Automation action execution failed';
      const outcome = action.retry_policy === 'BOUNDED_IDEMPOTENT' ? 'RETRY' : 'FAILED';
      try {
        await complete(input.supabase, action, input.workerId, outcome, {
          verification: { verified: false },
          error: detail.slice(0, 2000),
        });
      } catch {
        // Lease timeout reaper remains the durable fallback if completion itself fails.
      }
      failed += 1;
    }
  }

  return {
    claimed: (claimed ?? []).length,
    succeeded,
    waiting: waitingCount,
    failed,
    bookingEvents: bookingEvents.error ? {} : record(bookingEvents.data),
    quoteEvents: quoteEvents.error ? {} : record(quoteEvents.data),
    approvalDeadlines: record(approvalDeadlines.data),
    reconciliation: record(waiting.data),
    timeoutRecovery: record(timeouts.data),
  };
}

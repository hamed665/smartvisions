import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { queueShadowDraft } from '@/lib/outreach/shadow-approval';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Email Shadow reconciliation');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

function operatorFields(trace: Record<string, unknown>) {
  const results = Array.isArray(trace.agentResults) ? trace.agentResults : [];
  const find = (name: string) => record(results.find((item) => record(item).agent === name));
  const secretary = record(find('secretary').data);
  const culture = record(find('culture_locale').data);
  return {
    persianTranslation: stringValue(secretary.operator_persian_translation),
    persianSummary: stringValue(secretary.operator_persian_summary),
    replyDialect: stringValue(culture.reply_dialect ?? culture.dialect),
  };
}

function replySubject(subject: unknown) {
  const value = stringValue(subject) ?? 'Follow-up';
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;
  const body = await request.json() as { organizationId?: string; requestKey?: string };
  if (!body.organizationId || !body.requestKey) return NextResponse.json({ error: 'organizationId and requestKey are required' }, { status: 400 });
  const supabase = serviceClient();

  const { data: run, error: runError } = await supabase.from('agent_runs')
    .select('id,status,result_payload,lead_id,conversation_id')
    .eq('organization_id', body.organizationId)
    .eq('request_key', body.requestKey)
    .maybeSingle();
  if (runError || !run) return NextResponse.json({ error: runError?.message ?? 'Agent run not found' }, { status: 404 });
  if (run.status !== 'COMPLETED') return NextResponse.json({ reconciled: false, reason: `RUN_${run.status}` }, { status: 409 });
  if (!run.lead_id || !run.conversation_id) return NextResponse.json({ reconciled: false, reason: 'CANONICAL_LINKAGE_MISSING' }, { status: 409 });

  const result = record(run.result_payload);
  const draft = record(result.draft);
  const trace = record(result.trace);
  if (trace.delivery !== 'REVIEW') return NextResponse.json({ reconciled: false, reason: 'DELIVERY_NOT_REVIEW' });
  const draftText = stringValue(draft.text);
  if (!draftText) return NextResponse.json({ reconciled: false, reason: 'DRAFT_MISSING' }, { status: 409 });

  const [leadResult, conversationResult, inboundResult, outboundResult] = await Promise.all([
    supabase.from('leads').select('id,business_id').eq('organization_id', body.organizationId).eq('id', run.lead_id).maybeSingle(),
    supabase.from('sales_conversations').select('id,lead_id,channel').eq('organization_id', body.organizationId).eq('id', run.conversation_id).maybeSingle(),
    supabase.from('outreach_messages').select('subject,metadata,received_at,created_at').eq('organization_id', body.organizationId).eq('lead_id', run.lead_id).eq('channel', 'EMAIL').eq('direction', 'INBOUND').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('outreach_messages').select('mailbox_id').eq('organization_id', body.organizationId).eq('lead_id', run.lead_id).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND').not('mailbox_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const firstError = [leadResult.error, conversationResult.error, inboundResult.error, outboundResult.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: `Email Shadow context lookup failed: ${firstError!.message}` }, { status: 503 });
  const lead = leadResult.data;
  const conversation = conversationResult.data;
  if (!lead?.business_id || !conversation || conversation.lead_id !== run.lead_id || conversation.channel !== 'EMAIL') {
    return NextResponse.json({ reconciled: false, reason: 'EMAIL_CONVERSATION_LINKAGE_INVALID' }, { status: 409 });
  }

  const { data: business, error: businessError } = await supabase.from('businesses')
    .select('email,country_code')
    .eq('organization_id', body.organizationId)
    .eq('id', lead.business_id)
    .maybeSingle();
  if (businessError || !business) return NextResponse.json({ error: businessError?.message ?? 'Business not found' }, { status: 503 });
  const recipient = stringValue(business.email);
  const marketCode = stringValue(business.country_code)?.toUpperCase();
  if (!recipient || !marketCode) return NextResponse.json({ reconciled: false, reason: 'EMAIL_CANONICAL_RECIPIENT_OR_MARKET_MISSING' }, { status: 409 });

  const inboundMetadata = record(inboundResult.data?.metadata);
  const receivingMailboxAddress = stringValue(inboundMetadata.to);
  let mailboxId = stringValue(outboundResult.data?.mailbox_id);
  if (!mailboxId && receivingMailboxAddress) {
    const { data: mailbox, error: mailboxError } = await supabase.from('mailboxes')
      .select('id')
      .eq('organization_id', body.organizationId)
      .ilike('address', receivingMailboxAddress)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();
    if (mailboxError) return NextResponse.json({ error: `Mailbox lookup failed: ${mailboxError.message}` }, { status: 503 });
    mailboxId = stringValue(mailbox?.id);
  }
  if (!mailboxId) return NextResponse.json({ reconciled: false, reason: 'EMAIL_MAILBOX_MISSING' }, { status: 409 });

  const { data: market, error: marketError } = await supabase.from('market_settings')
    .select('timezone')
    .eq('organization_id', body.organizationId)
    .eq('country_code', marketCode)
    .maybeSingle();
  if (marketError || !market) return NextResponse.json({ error: marketError?.message ?? 'Market settings not found' }, { status: 503 });

  const operator = operatorFields(trace);
  try {
    const queued = await queueShadowDraft({
      organizationId: body.organizationId,
      conversationId: String(run.conversation_id),
      leadId: String(run.lead_id),
      channel: 'EMAIL',
      draft: draftText,
      idempotencyKey: `agent:${body.requestKey}:shadow`,
      to: recipient,
      subject: replySubject(inboundResult.data?.subject),
      mailboxId,
      marketCode,
      leadTimezone: String(market.timezone),
      replyLanguage: stringValue(draft.language) ?? undefined,
      replyDialect: operator.replyDialect ?? undefined,
      persianTranslation: operator.persianTranslation ?? undefined,
      persianSummary: operator.persianSummary ?? undefined,
    });
    return NextResponse.json({ reconciled: true, ...queued });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Email Shadow queue failed', reconciliationRequired: true }, { status: 202 });
  }
}

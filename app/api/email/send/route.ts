import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { evaluateMailboxHealth } from '@/lib/outreach/mailbox-health';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
import { assertChannelAllowed, getRuntimeControls } from '@/lib/reliability/runtime-controls';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for email sending');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    mailboxId?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    idempotencyKey?: string;
    marketCode?: MarketCode;
    leadTimezone?: string;
    agentMode?: 'AUTO' | 'PAUSED' | 'HUMAN';
    doNotContact?: boolean;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    leadId?: string;
  };

  if (!body.organizationId || !body.mailboxId || !body.to || !body.subject || !body.text || !body.idempotencyKey || !body.marketCode) {
    return NextResponse.json({ error: 'organizationId, mailboxId, to, subject, text, idempotencyKey and marketCode are required' }, { status: 400 });
  }
  if (body.doNotContact) return NextResponse.json({ error: 'Lead is marked do-not-contact' }, { status: 409 });
  if (body.agentMode === 'HUMAN') return NextResponse.json({ error: 'AI sending is blocked during human takeover' }, { status: 409 });
  if (body.agentMode === 'PAUSED') return NextResponse.json({ error: 'AI sending is paused' }, { status: 409 });

  const supabase = serviceClient();
  const { data: existing, error: existingError } = await supabase
    .from('outreach_messages')
    .select('provider_message_id,status')
    .eq('organization_id', body.organizationId)
    .eq('idempotency_key', body.idempotencyKey)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing?.provider_message_id) {
    return NextResponse.json({ providerMessageId: existing.provider_message_id, status: existing.status, duplicate: true });
  }

  try {
    const [controls, costState] = await Promise.all([
      getRuntimeControls(body.organizationId),
      getCostGuardState(body.organizationId),
    ]);
    assertChannelAllowed(controls, 'EMAIL');
    assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Runtime safety block' }, { status: 409 });
  }

  const window = evaluateLocalWindow({ marketCode: body.marketCode, leadTimezone: body.leadTimezone });
  if (!window.allowed) return NextResponse.json({ error: 'Outside recipient local send window', window }, { status: 409 });

  const { data: mailbox, error: mailboxError } = await supabase
    .from('mailboxes')
    .select('id,organization_id,enabled,daily_limit,sent_today,bounce_rate,complaint_rate')
    .eq('id', body.mailboxId)
    .eq('organization_id', body.organizationId)
    .maybeSingle();
  if (mailboxError || !mailbox) return NextResponse.json({ error: mailboxError?.message ?? 'Mailbox not found' }, { status: 404 });

  const provider = new ResendEmailProvider();
  const providerHealth = await provider.health();
  const mailboxHealth = evaluateMailboxHealth({
    enabled: Boolean(mailbox.enabled),
    dailyLimit: Number(mailbox.daily_limit),
    sentToday: Number(mailbox.sent_today),
    bounceRate: Number(mailbox.bounce_rate),
    complaintRate: Number(mailbox.complaint_rate),
    providerHealthy: providerHealth.ok,
  });
  if (!mailboxHealth.allowed) {
    return NextResponse.json({ error: 'Mailbox health blocks sending', mailboxHealth }, { status: 409 });
  }

  const result = await provider.sendEmail({
    mailboxId: body.mailboxId,
    to: body.to,
    subject: body.subject,
    text: body.text,
    html: body.html,
    idempotencyKey: body.idempotencyKey,
  });

  const { error: upsertError } = await supabase.from('outreach_messages').upsert({
    organization_id: body.organizationId,
    lead_id: body.leadId ?? null,
    mailbox_id: body.mailboxId,
    channel: 'EMAIL',
    direction: 'OUTBOUND',
    status: 'SENT',
    provider_message_id: result.providerMessageId,
    subject: body.subject,
    body: body.text,
    idempotency_key: body.idempotencyKey,
    sent_at: new Date().toISOString(),
    metadata: { provider: 'RESEND', html_supplied: Boolean(body.html) },
  }, { onConflict: 'organization_id,idempotency_key' });
  if (upsertError) return NextResponse.json({ error: `Email sent but persistence failed: ${upsertError.message}`, providerMessageId: result.providerMessageId }, { status: 500 });

  const { error: mailboxUpdateError } = await supabase
    .from('mailboxes')
    .update({ sent_today: Number(mailbox.sent_today) + 1, updated_at: new Date().toISOString() })
    .eq('id', body.mailboxId)
    .eq('organization_id', body.organizationId);
  if (mailboxUpdateError) console.error('Mailbox sent_today update failed', mailboxUpdateError);

  await recordUsage({
    organizationId: body.organizationId,
    provider: 'EMAIL',
    operation: 'SEND_EMAIL',
    costUsd: 0,
    units: 1,
    leadId: body.leadId,
    metadata: { provider: 'RESEND', pricing_status: 'PENDING_RECONCILIATION' },
  });

  return NextResponse.json({ ...result, duplicate: false, mailboxHealth });
}

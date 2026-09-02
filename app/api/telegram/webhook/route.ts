import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { answerTelegramCallbackQuery, confirmationKeyboard, sendTelegramMessage } from '@/lib/telegram/client';
import { getTelegramRuntimeConfig, isAuthorizedTelegramOwner, verifyTelegramWebhookSecret } from '@/lib/telegram/config';
import type { CommandExecutionResult, TelegramOwnerCommand, TelegramUpdate } from '@/lib/telegram/contracts';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { executePreparedMutation, executeReadCommand, prepareMutation } from '@/lib/telegram/commands';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Telegram webhook');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function callbackParts(data: string | undefined) {
  const match = String(data ?? '').match(/^tg:(ok|no):([0-9a-f-]{36})$/i);
  return match ? { action: match[1].toLowerCase() as 'ok' | 'no', token: match[2].toLowerCase() } : null;
}

async function markRunFailed(supabase: ReturnType<typeof serviceClient>, organizationId: string, id: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 600) : 'Telegram command failed';
  await supabase.from('telegram_command_runs').update({ status: 'FAILED', error: message, completed_at: new Date().toISOString() })
    .eq('organization_id', organizationId).eq('id', id).in('status', ['PROCESSING','PENDING_CONFIRMATION']);
  return message;
}

async function handleCallback(input: {
  update: TelegramUpdate;
  chatId: string;
  userId: string;
  callbackId: string;
  callbackData?: string;
}) {
  const config = getTelegramRuntimeConfig()!;
  const supabase = serviceClient();
  const parts = callbackParts(input.callbackData);
  if (!parts) {
    await answerTelegramCallbackQuery(input.callbackId, 'دستور نامعتبر است.');
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: callbackRun, error: claimError } = await supabase.from('telegram_command_runs').insert({
    organization_id: config.organizationId,
    update_id: input.update.update_id,
    chat_id: input.chatId,
    user_id: input.userId,
    message_id: input.update.callback_query?.message?.message_id ?? null,
    raw_text: input.callbackData ?? null,
    command_type: parts.action === 'ok' ? 'CONFIRM_CALLBACK' : 'CANCEL_CALLBACK',
    command_payload: { token: parts.token },
    status: 'PROCESSING',
  }).select('id').single();
  if (claimError) {
    if (claimError.code === '23505') return NextResponse.json({ ok: true, replayed: true });
    return NextResponse.json({ error: 'Telegram callback claim failed' }, { status: 500 });
  }

  const { data: pending, error: pendingError } = await supabase.from('telegram_command_runs')
    .select('id,command_type,command_payload,result,created_at,status')
    .eq('organization_id', config.organizationId)
    .eq('chat_id', input.chatId)
    .eq('user_id', input.userId)
    .eq('confirmation_token', parts.token)
    .eq('status', 'PENDING_CONFIRMATION')
    .maybeSingle();
  if (pendingError || !pending) {
    await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', result: { ignored: true, reason: 'NO_PENDING_CONFIRMATION' }, completed_at: new Date().toISOString() }).eq('id', callbackRun.id);
    await answerTelegramCallbackQuery(input.callbackId, 'این تأیید دیگر فعال نیست.');
    return NextResponse.json({ ok: true, expired: true });
  }

  const ageMs = Date.now() - new Date(String(pending.created_at)).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 15 * 60_000) {
    await supabase.from('telegram_command_runs').update({ status: 'REJECTED', error: 'CONFIRMATION_EXPIRED', completed_at: new Date().toISOString() })
      .eq('organization_id', config.organizationId).eq('id', pending.id).eq('status', 'PENDING_CONFIRMATION');
    await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', result: { expired: true }, completed_at: new Date().toISOString() }).eq('id', callbackRun.id);
    await answerTelegramCallbackQuery(input.callbackId, 'تأیید منقضی شده؛ دستور را دوباره بفرست.');
    return NextResponse.json({ ok: true, expired: true });
  }

  if (parts.action === 'no') {
    await supabase.from('telegram_command_runs').update({ status: 'REJECTED', completed_at: new Date().toISOString(), result: { ...record(pending.result), cancelledByOwner: true } })
      .eq('organization_id', config.organizationId).eq('id', pending.id).eq('status', 'PENDING_CONFIRMATION');
    await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', result: { cancelled: true, targetRunId: pending.id }, completed_at: new Date().toISOString() }).eq('id', callbackRun.id);
    await answerTelegramCallbackQuery(input.callbackId, 'لغو شد.');
    await sendTelegramMessage({ chatId: input.chatId, text: '❌ تغییر لغو شد. هیچ چیزی عوض نشد.' });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  const { data: locked, error: lockError } = await supabase.from('telegram_command_runs').update({ status: 'PROCESSING', confirmed_at: new Date().toISOString() })
    .eq('organization_id', config.organizationId).eq('id', pending.id).eq('status', 'PENDING_CONFIRMATION')
    .select('id,command_payload,result').maybeSingle();
  if (lockError || !locked) {
    await answerTelegramCallbackQuery(input.callbackId, 'این دستور قبلاً پردازش شده است.');
    return NextResponse.json({ ok: true, replayed: true });
  }

  try {
    const command = locked.command_payload as TelegramOwnerCommand;
    const preview = record(locked.result).preview as CommandExecutionResult | undefined;
    if (!preview) throw new Error('Stored Telegram confirmation preview is missing');
    const executed = await executePreparedMutation({ supabase, organizationId: config.organizationId, ownerUserId: config.ownerUserId, command, preview });
    const completedAt = new Date().toISOString();
    const { error: completeError } = await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', result: executed, error: null, completed_at: completedAt })
      .eq('organization_id', config.organizationId).eq('id', locked.id).eq('status', 'PROCESSING');
    if (completeError) throw new Error(`Telegram command completion persistence failed: ${completeError.message}`);
    await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', result: { confirmed: true, targetRunId: locked.id }, completed_at: completedAt }).eq('id', callbackRun.id);
    await answerTelegramCallbackQuery(input.callbackId, 'انجام شد ✅');
    await sendTelegramMessage({ chatId: input.chatId, text: `✅ ${executed.title}\n${executed.text}` });
    return NextResponse.json({ ok: true, completed: true });
  } catch (error) {
    const message = await markRunFailed(supabase, config.organizationId, locked.id, error);
    await supabase.from('telegram_command_runs').update({ status: 'FAILED', error: message, completed_at: new Date().toISOString() }).eq('id', callbackRun.id);
    await answerTelegramCallbackQuery(input.callbackId, 'اجرا نشد.');
    await sendTelegramMessage({ chatId: input.chatId, text: `⛔️ تغییر اجرا نشد:\n${message}` });
    return NextResponse.json({ ok: true, failed: true });
  }
}

// Migration-only diagnostic. Removed before PR A merges.
export async function GET() {
  if (process.env.DEPLOYMENT_ENV !== 'candidate') return new Response(null, { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, reason: 'CONFIG_MISSING' }, { status: 503 });
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/previews?select=id&limit=0`, {
      headers: { apikey: key, accept: 'application/json' },
    });
    return NextResponse.json({ ok: response.ok, upstreamStatus: response.status }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.name : 'UnknownError' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const config = getTelegramRuntimeConfig();
  if (!config) return NextResponse.json({ error: 'Telegram owner assistant is not configured' }, { status: 503 });
  if (!verifyTelegramWebhookSecret(request.headers.get('x-telegram-bot-api-secret-token'), config)) {
    return NextResponse.json({ error: 'Unauthorized Telegram webhook' }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Number.isInteger(update.update_id)) return NextResponse.json({ error: 'update_id is required' }, { status: 400 });

  const callback = update.callback_query;
  const message = update.message;
  const chatId = String(callback?.message?.chat.id ?? message?.chat.id ?? '');
  const userId = String(callback?.from.id ?? message?.from?.id ?? '');
  if (!isAuthorizedTelegramOwner({ chatId, userId }, config)) {
    return NextResponse.json({ error: 'Telegram owner identity rejected' }, { status: 403 });
  }

  if (callback) {
    return handleCallback({ update, chatId, userId, callbackId: callback.id, callbackData: callback.data });
  }

  const rawText = String(message?.text ?? '').trim();
  const supabase = serviceClient();
  const { data: claimed, error: claimError } = await supabase.from('telegram_command_runs').insert({
    organization_id: config.organizationId,
    update_id: update.update_id,
    chat_id: chatId,
    user_id: userId,
    message_id: message?.message_id ?? null,
    raw_text: rawText || null,
    command_payload: {},
    status: 'PROCESSING',
  }).select('id').single();
  if (claimError) {
    if (claimError.code === '23505') return NextResponse.json({ ok: true, replayed: true });
    return NextResponse.json({ error: 'Telegram update claim failed' }, { status: 500 });
  }

  if (!rawText) {
    await supabase.from('telegram_command_runs').update({ status: 'COMPLETED', command_type: 'IGNORED', result: { reason: 'TEXT_REQUIRED' }, completed_at: new Date().toISOString() }).eq('id', claimed.id);
    await sendTelegramMessage({ chatId, text: 'فعلاً دستور متنی بفرست. /help' });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const command = parseTelegramOwnerCommand(rawText);
    if (MUTATING_COMMANDS.has(command.type)) {
      const prepared = await prepareMutation({ supabase, organizationId: config.organizationId, ownerUserId: config.ownerUserId, command });
      const token = randomUUID();
      const { error: pendingError } = await supabase.from('telegram_command_runs').update({
        command_type: prepared.command.type,
        command_payload: prepared.command,
        status: 'PENDING_CONFIRMATION',
        confirmation_token: token,
        result: { preview: prepared.preview },
      }).eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
      if (pendingError) throw new Error(`Telegram confirmation persistence failed: ${pendingError.message}`);
      try {
        await sendTelegramMessage({ chatId, text: `⚠️ ${prepared.preview.title}\n${prepared.preview.text}\n\nتا ۱۵ دقیقه معتبر است.`, replyMarkup: confirmationKeyboard(token) });
      } catch (error) {
        await markRunFailed(supabase, config.organizationId, claimed.id, error);
        throw error;
      }
      return NextResponse.json({ ok: true, pendingConfirmation: true });
    }

    const result = await executeReadCommand({ supabase, organizationId: config.organizationId, command });
    const { error: completeError } = await supabase.from('telegram_command_runs').update({ command_type: command.type, command_payload: command, status: 'COMPLETED', result, completed_at: new Date().toISOString() })
      .eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    if (completeError) throw new Error(`Telegram read command persistence failed: ${completeError.message}`);
    try {
      await sendTelegramMessage({ chatId, text: `${result.title}\n\n${result.text}` });
    } catch (error) {
      await supabase.from('telegram_command_runs').update({ error: error instanceof Error ? error.message.slice(0, 300) : 'Reply delivery failed' }).eq('id', claimed.id);
    }
    return NextResponse.json({ ok: true, completed: true });
  } catch (error) {
    const messageText = await markRunFailed(supabase, config.organizationId, claimed.id, error);
    try { await sendTelegramMessage({ chatId, text: `⛔️ انجام نشد:\n${messageText}` }); } catch { /* no retry: Telegram send is not idempotent */ }
    return NextResponse.json({ ok: true, failed: true });
  }
}

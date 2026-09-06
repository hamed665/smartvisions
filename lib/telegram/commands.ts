import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';
import type { ExecutedMutation, PreparedMutation } from './commands-core';
import * as core from './commands-core';
import {
  executeCatalogComposeMutation,
  prepareCatalogComposeMutation,
} from './catalog-composer';
import {
  executeControlMutation,
  executeControlReadCommand,
  executeControlRevert,
  isControlMutation,
  isControlReadCommand,
  prepareControlMutation,
  revertTargetsControlMutation,
} from './control-plane';
import { normalizePersistedPreview } from './persisted-preview';
import { assertTelegramRevertFresh } from './revert-guard';
import { notifyTelegramOwner } from './notifications';

export type { ExecutedMutation, PreparedMutation } from './commands-core';
export { isSafeServiceOptionKey } from './commands-core';

export async function executeReadCommand(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: TelegramOwnerCommand;
}): Promise<CommandExecutionResult> {
  if (input.command.type === 'SHOW_PANEL_CAPABILITIES') {
    const { panelParityHelpText } = await import('./panel-parity');
    return { title:'Control Center ↔ Telegram', text:panelParityHelpText() };
  }

  if (input.command.type === 'TEST_OWNER_ALERT') {
    const notification = await notifyTelegramOwner({
      eventKey: `owner-alert-self-test:${randomUUID()}`,
      notificationType: 'SYSTEM_ALERT',
      text: [
        '🧪 تست مسیر هشدار مالک',
        'این پیام فقط SYSTEM_ALERT داخلی است.',
        'هیچ Lead/رویداد مشتری ساخته نشده و هیچ outreachای اجرا نشده است.',
      ].join('\n'),
      entityType: 'telegram_owner_self_test',
      payload: {
        source: 'OWNER_ALERT_SELF_TEST',
        customerEvent: false,
        outboundTriggered: false,
      },
      supabase: input.supabase,
    });

    if (!notification.sent) {
      const reason = 'reason' in notification
        ? notification.reason
        : 'error' in notification
          ? notification.error
          : 'UNKNOWN';
      throw new Error(`Telegram owner alert self-test failed: ${reason}`);
    }

    const messageId = 'messageId' in notification ? notification.messageId : '—';
    const reconciliationRequired = 'reconciliationRequired' in notification
      && notification.reconciliationRequired === true;

    return {
      title: 'تست هشدار مالک',
      text: [
        'SYSTEM_ALERT از مسیر canonical ارسال شد ✅',
        `Telegram message ID: ${messageId}`,
        reconciliationRequired
          ? 'ارسال انجام شد؛ notification journal نیاز به reconciliation دارد.'
          : 'notification journal روی SENT ثبت شد.',
        'هیچ پیام یا outreach برای مشتری ایجاد نشد.',
      ].join('\n'),
    };
  }

  if (isControlReadCommand(input.command.type)) return executeControlReadCommand(input);
  return core.executeReadCommand(input);
}

export async function prepareMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
}): Promise<PreparedMutation> {
  if (input.command.type === 'CATALOG_COMPOSE') {
    return prepareCatalogComposeMutation({
      supabase: input.supabase,
      organizationId: input.organizationId,
      command: input.command,
    });
  }
  if (input.command.type === 'PANEL_ACTION') {
    const { preparePanelAction } = await import('./panel-parity');
    return preparePanelAction({ ...input, command:input.command });
  }
  if (input.command.type !== 'REVERT_LAST_CHANGE' && isControlMutation(input.command.type)) {
    return prepareControlMutation(input);
  }
  return core.prepareMutation(input);
}

export async function executePreparedMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
  preview: CommandExecutionResult;
}): Promise<ExecutedMutation> {
  if (input.command.type === 'REVERT_LAST_CHANGE') {
    if (!input.command.targetRunId) throw new Error('Revert target is missing');
    await assertTelegramRevertFresh({
      supabase: input.supabase,
      organizationId: input.organizationId,
      targetRunId: input.command.targetRunId,
    });
    if (await revertTargetsControlMutation(input)) return executeControlRevert(input);
    return core.executePreparedMutation(input);
  }

  if (input.command.type === 'CATALOG_COMPOSE') {
    return executeCatalogComposeMutation({
      supabase: input.supabase,
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      command: input.command,
      preview: input.preview,
    });
  }

  if (input.command.type === 'PANEL_ACTION') {
    const { executePanelAction } = await import('./panel-parity');
    return executePanelAction({ ...input, command:input.command });
  }

  const normalizedInput = {
    ...input,
    preview: normalizePersistedPreview(input.command, input.preview),
  };

  if (isControlMutation(input.command.type)) return executeControlMutation(normalizedInput);
  return core.executePreparedMutation(normalizedInput);
}

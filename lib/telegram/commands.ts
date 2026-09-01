import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';
import type { ExecutedMutation, PreparedMutation } from './commands-core';
import * as core from './commands-core';
import {
  executeControlMutation,
  executeControlReadCommand,
  executeControlRevert,
  isControlMutation,
  isControlReadCommand,
  prepareControlMutation,
  revertTargetsControlMutation,
} from './control-plane';

export type { ExecutedMutation, PreparedMutation } from './commands-core';
export { isSafeServiceOptionKey } from './commands-core';

export async function executeReadCommand(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: TelegramOwnerCommand;
}): Promise<CommandExecutionResult> {
  if (isControlReadCommand(input.command.type)) return executeControlReadCommand(input);
  return core.executeReadCommand(input);
}

export async function prepareMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
}): Promise<PreparedMutation> {
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
  if (input.command.type === 'REVERT_LAST_CHANGE' && await revertTargetsControlMutation(input)) {
    return executeControlRevert(input);
  }
  if (isControlMutation(input.command.type)) return executeControlMutation(input);
  return core.executePreparedMutation(input);
}

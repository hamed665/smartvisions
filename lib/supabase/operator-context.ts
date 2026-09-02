import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ServerOperatorContext = {
  supabase: SupabaseClient;
  organizationId: string;
  role: 'OWNER';
  userId: string;
  source: 'TELEGRAM';
};

const storage = new AsyncLocalStorage<ServerOperatorContext>();

export function getServerOperatorContext() {
  return storage.getStore() ?? null;
}

export function runWithServerOperatorContext<T>(
  context: ServerOperatorContext,
  operation: () => Promise<T>,
): Promise<T> {
  return storage.run(context, operation);
}

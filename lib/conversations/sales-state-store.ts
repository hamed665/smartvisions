import type { SupabaseClient } from '@supabase/supabase-js';
import type { SalesStateSnapshot } from '@/lib/agents/contracts';

export async function persistConversationSalesState(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  leadId?: string | null;
  state: SalesStateSnapshot;
}) {
  const now = new Date().toISOString();
  let query = input.supabase
    .from('sales_conversations')
    .update({
      sales_state: input.state,
      sales_state_updated_at: now,
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId);

  if (input.leadId) query = query.eq('lead_id', input.leadId);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(`Conversation sales state persistence failed: ${error.message}`);
  if (!data) throw new Error('Conversation sales state target not found');
  return { persisted: true as const, updatedAt: now };
}

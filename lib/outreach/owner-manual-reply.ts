export type OwnerManualReplyAccessInput = {
  channel: string;
  leadStatus?: string | null;
  leadAgentMode?: string | null;
  conversationStage?: string | null;
  conversationAgentMode?: string | null;
  conversationRequiresHuman: boolean;
};

const TERMINAL_LEAD_STATES = new Set(['WON', 'LOST', 'DO_NOT_CONTACT']);
const TERMINAL_CONVERSATION_STAGES = new Set(['WON', 'LOST', 'DO_NOT_CONTACT', 'SPAM']);

export function evaluateOwnerManualReplyAccess(input: OwnerManualReplyAccessInput) {
  const blocks: string[] = [];
  const channel = String(input.channel ?? '').toUpperCase();
  const leadMode = String(input.leadAgentMode ?? '').toUpperCase();
  const conversationMode = String(input.conversationAgentMode ?? '').toUpperCase();
  const leadStatus = String(input.leadStatus ?? '').toUpperCase();
  const conversationStage = String(input.conversationStage ?? '').toUpperCase();

  if (channel !== 'WHATSAPP') blocks.push('OWNER_MANUAL_WHATSAPP_ONLY');
  if (TERMINAL_LEAD_STATES.has(leadStatus)) blocks.push('TERMINAL_LEAD');
  if (TERMINAL_CONVERSATION_STAGES.has(conversationStage)) blocks.push('TERMINAL_CONVERSATION');
  if (!(leadMode === 'HUMAN' && conversationMode === 'HUMAN' && input.conversationRequiresHuman)) {
    blocks.push('OWNER_TAKEOVER_REQUIRED');
  }

  return { allowed: blocks.length === 0, blocks };
}

export function normalizeOwnerReplyText(value: unknown) {
  if (typeof value !== 'string') throw new Error('Reply text is required');
  const text = value.trim();
  if (!text) throw new Error('Reply text is required');
  if (text.length > 4096) throw new Error('WhatsApp manual reply must be 4096 characters or fewer');
  return text;
}

export function ownerManualReplyIdempotencyKey(conversationId: string, requestId: string) {
  const conversation = conversationId.trim();
  const request = requestId.trim();
  if (!conversation || !request) throw new Error('conversationId and requestId are required');
  return `owner-manual:${conversation}:${request}`;
}

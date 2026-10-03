export const PANEL_PARITY_TELEGRAM_ACTION_NAMES = [
  'service.create','service.update','price.create','price.update','market.create','market.update','locale.update','agent.update','approval.require',
  'campaign.create','campaign.update','outreach.update','template.create','template.update','automation.create','automation.update','integration.update','organization.update',
  'knowledge.publish','prompt.publish','lead.update','suppression.add','portfolio.create','portfolio.update','preview_template.create','preview_template.update','conversation.update','mailbox.update','variant.update','cost.update','openai.health',
  'growth.rescore','growth.social_review','growth.promote','website.audit','hunter.sample','hunter.enrich','hunter.batch','google.refresh','integration.email_verify','integration.crawl4ai_verify',
  'preview.generate_pilot','preview.approve','preview.mark_sent','preview.mark_internal_shared','whatsapp.process_pilot','whatsapp.send_approved_pilot','whatsapp.verify','whatsapp.voice_transcribe',
] as const;

export const PANEL_PARITY_OWNER_COPILOT_ACTION_NAMES = [
  'lead.update','automation.update',
  'crm.task.create','customer.task','crm.task.update','crm.deal.update',
  'booking.confirm','booking.reschedule','booking.cancel',
  'quote.submit_review','quote.review_decide','quote.mark_sent',
  'order.start','order.cancel',
  'invoice.issue','invoice.void',
  'payment.intent_create','payment.intent_cancel','payment.refund_request',
  'marketing_campaign.transition',
] as const;

export const PANEL_PARITY_ACTION_NAMES = [
  ...PANEL_PARITY_TELEGRAM_ACTION_NAMES,
  'crm.task.create','customer.task','crm.task.update','crm.deal.update',
  'booking.confirm','booking.reschedule','booking.cancel',
  'quote.submit_review','quote.review_decide','quote.mark_sent',
  'order.start','order.cancel',
  'invoice.issue','invoice.void',
  'payment.intent_create','payment.intent_cancel','payment.refund_request',
  'marketing_campaign.transition',
] as const;

export type PanelParityActionName = typeof PANEL_PARITY_ACTION_NAMES[number];
export type PanelParitySurface = 'TELEGRAM' | 'OWNER_COPILOT';
export type PanelParityArgs = Record<string, string>;

export type PanelParityCommand = {
  type: 'PANEL_ACTION';
  action: PanelParityActionName;
  args: PanelParityArgs;
};

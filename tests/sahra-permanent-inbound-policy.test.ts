import { describe, expect, it } from 'vitest';
import { evaluateInternalTestLiveReplyPolicy } from '@/lib/whatsapp/internal-test-live-reply-policy';
import { verifyControlledWhatsAppPilot } from '@/lib/outreach/controlled-whatsapp-pilot';

const now = new Date('2026-10-14T09:53:00Z');
const policy = {
  permanentInboundReply: {
    enabled: true, tenantBusinessId: 'sahra', bindingId: 'sahra-meta-binding',
    consentAuditId: 'valid-owner-audit-id',
    senderPhoneNumberId: 'test-sender', senderWabaId: 'test-waba',
    inboundOnly: true, allowAllCustomerInitiated:true, noUnsolicited:true,
    deliveryMode: 'TEXT', dailyCap: 60,
  },
};
const input = {
  ruleRequiresApproval: true, ruleConfig: policy, shadowMode: true,
  globalKillSwitch: false, agentsPaused: false, whatsappPaused: false,
  businessCategory: 'car_care', businessWhatsapp: '96893191993',
  inboundFrom: '96893191993', tenantBusinessId: 'sahra',
  bindingId: 'sahra-meta-binding', inboundReceivedAt: '2026-10-14T09:51:00Z',
  claimedCount: 0, now,
};

describe('Permanent inbound-only Sahra service policy', () => {
  it('has no arbitrary lifetime expiry or aggregate test recipient list', () => {
    expect(evaluateInternalTestLiveReplyPolicy(input)).toEqual({
      allowed: true, recipient: '96893191993', startsAt: '', endsAt: '',
      maxReplies: 60, deliveryMode: 'TEXT', permanentInbound: true,
    });
  });
  it('supports real verified customer-initiated non-Oman phone format', () => {
    expect(evaluateInternalTestLiveReplyPolicy({ ...input, businessWhatsapp: '+44 7700 900123',
      inboundFrom: '447700900123' }).allowed).toBe(true);
  });
  it.each([
    [{ ruleRequiresApproval: false },'GLOBAL_WHATSAPP_APPROVAL_RULE_MUST_REMAIN_ON'],
    [{ shadowMode: false },'SHADOW_MODE_REQUIRED'],
    [{ whatsappPaused: true },'WHATSAPP_PAUSED'],
    [{ globalKillSwitch: true },'GLOBAL_KILL_SWITCH'],
    [{ bindingId: 'wrong-binding' },'PRODUCTION_INBOUND_TENANT_BINDING_MISMATCH'],
    [{ tenantBusinessId: 'other-tenant' },'PRODUCTION_INBOUND_TENANT_BINDING_MISMATCH'],
    [{ inboundFrom: '96890000000' },'PRODUCTION_INBOUND_RECIPIENT_MISMATCH'],
    [{ inboundReceivedAt: '2026-10-14T09:45:00Z' },'PRODUCTION_FRESH_INBOUND_REQUIRED'],
    [{ ruleConfig: {permanentInboundReply: {...policy.permanentInboundReply,consentAuditId:''}} },'PRODUCTION_INBOUND_CONSENT_CONFIG_REQUIRED'],
    [{ ruleConfig: {permanentInboundReply: {...policy.permanentInboundReply,dailyCap:500}} },'PRODUCTION_DAILY_CAP_INVALID'],
    [{ ruleConfig: {permanentInboundReply: {...policy.permanentInboundReply,inboundOnly:false}} },'PRODUCTION_INBOUND_CONSENT_CONFIG_REQUIRED'],
    [{ ruleConfig: {permanentInboundReply: {...policy.permanentInboundReply,allowAllCustomerInitiated:false}} },'PRODUCTION_INBOUND_CONSENT_CONFIG_REQUIRED'],
    [{ ruleConfig: {permanentInboundReply: {...policy.permanentInboundReply,noUnsolicited:false}} },'PRODUCTION_INBOUND_CONSENT_CONFIG_REQUIRED'],
  ])('fails closed when any critical gate fails %#', (change, reason) => {
    expect(evaluateInternalTestLiveReplyPolicy({...input,...change})).toEqual({ allowed:false, reason });
  });
  it('still requires canonical Meta receipt for an approved text send', () => {
    const verified = verifyControlledWhatsAppPilot({
      messageStatus: 'APPROVED', requiresApproval:false, channel:'WHATSAPP',
      metadataSource:'SHADOW_MODE', providerMessageId:'shadow:agent:whatsapp-pilot:live:123e4567-e89b-12d3-a456-426614174000:shadow',
      idempotencyKey:'agent:whatsapp-pilot:live:123e4567-e89b-12d3-a456-426614174000:shadow',
      sendTo:'447700900123',businessWhatsapp:'447700900123',
      messageLeadId:'lead',conversationLeadId:'lead',conversationChannel:'WHATSAPP',
      businessCategory:'car_care',canonicalLiveEvidenceVerified:true,
    });
    expect(verified.verified).toBe(true);
    expect(verifyControlledWhatsAppPilot({
      messageStatus: 'APPROVED', requiresApproval:false, channel:'WHATSAPP',
      metadataSource:'SHADOW_MODE', providerMessageId:'shadow:agent:whatsapp-pilot:live:123e4567-e89b-12d3-a456-426614174000:shadow',
      idempotencyKey:'agent:whatsapp-pilot:live:123e4567-e89b-12d3-a456-426614174000:shadow',
      sendTo:'447700900123',businessWhatsapp:'447700900123',
      messageLeadId:'lead',conversationLeadId:'lead',conversationChannel:'WHATSAPP',
      businessCategory:'car_care',canonicalLiveEvidenceVerified:false,
    }).verified).toBe(false);
  });
});

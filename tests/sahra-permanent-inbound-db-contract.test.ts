import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root,
  'supabase/migrations/20261014120000_sahra_permanent_inbound_owner_governed.sql'),'utf8');
const ownerAction = fs.readFileSync(path.join(root,'app/sahra-inbound-service-actions.ts'),'utf8');
const pilot = fs.readFileSync(path.join(root,'lib/whatsapp/internal-test-live-reply.ts'),'utf8');

describe('Sahra ongoing inbound authorization evidence', () => {
  it('requires immutable authenticated owner audit and existing membership', () => {
    expect(ownerAction).toContain('await getCurrentOrganization(true)');
    expect(ownerAction).toContain("owner.organizationId !== SAHRA_ORG");
    expect(ownerAction).toContain("action: 'SAHRA_INBOUND_SERVICE_OWNER_APPROVED'");
    expect(migration).toContain("v_consent_action := case when v_is_permanent then 'SAHRA_INBOUND_SERVICE_OWNER_APPROVED'");
    expect(migration).toContain("om.role='OWNER'");
    expect(migration).toContain("v_consent->'allowAllCustomerInitiated' is distinct from 'true'::jsonb");
    expect(migration).toContain("v_consent->'noUnsolicited' is distinct from 'true'::jsonb");
    expect(migration).toContain("v_consent->>'senderPhoneNumberId' is distinct from v_cfg->>'senderPhoneNumberId'");
  });
  it('reuses governed SQL owner approval and provider sender, with no separate outbox', () => {
    expect(migration).toContain('create or replace function public.verify_or_claim_whatsapp_controlled_inbound(');
    expect(migration).toContain('create or replace function public.approve_whatsapp_controlled_inbound_reply(');
    expect(migration).toContain('public.decide_message_approval(');
    expect(pilot).toContain('approve_whatsapp_controlled_inbound_reply');
    expect(pilot).toContain('controlledInboundEvidence(');
    expect(pilot).toContain("POST as approvedSendPost");
  });
  it('has a renewable daily safety cap but no 90 minute service lifetime', () => {
    expect(migration).toContain("v_cap := (v_cfg->>'dailyCap')::integer");
    expect(migration).toContain('not between 1 and 100');
    expect(migration).toContain("v_claim_action := case when v_is_permanent then 'WHATSAPP_INBOUND_SERVICE_CLAIMED'");
    expect(migration).toContain('not v_is_permanent and v_end-v_start > interval');
    expect(migration).toContain("v_now-v_inbound.received_at > interval '5 minutes'");
    expect(migration).toContain("source_plane='META_WHATSAPP'");
    expect(migration).toContain("v_message.media_type not in ('TEXT','VOICE','AUDIO')");
    expect(migration).toContain("b.status='ACTIVE'");
  });
  it('preserves Shadow, approval and stops for takeover, suppression and stale customer messages', () => {
    expect(migration).toContain('v_controls.shadow_mode is distinct from true');
    expect(migration).toContain('v_rule.requires_approval is distinct from true');
    expect(migration).toContain('c.requires_human=false');
    expect(migration).toContain('l.agent_mode=\'AUTO\'');
    expect(migration).toContain('public.suppression_list');
    expect(migration).toContain('CANONICAL_INBOUND_NOT_CURRENT');
  });
  it('restricts permissions and never allows public RPC invocation', () => {
    expect(migration).toContain('revoke all on function public.verify_or_claim_whatsapp_controlled_inbound');
    expect(migration).toContain('revoke all on function public.approve_whatsapp_controlled_inbound_reply');
    expect(migration).toContain('grant execute on function public.verify_or_claim_whatsapp_controlled_inbound');
    expect(migration).toContain('to service_role');
  });
});

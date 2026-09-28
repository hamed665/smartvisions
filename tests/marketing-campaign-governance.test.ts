import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('MARKETING-CAMPAIGNS governance', () => {
  const migration = readFileSync('supabase/migrations/0142_marketing_campaign_governance.sql','utf8');
  const actions = readFileSync('app/marketing-campaign-actions.ts','utf8');
  const page = readFileSync('app/campaigns/page.tsx','utf8');
  const messages = readFileSync('app/messages/page.tsx','utf8');
  const snapshots = readFileSync('app/segments/segment-snapshot-panel.tsx','utf8');
  const ci = readFileSync('.github/workflows/ci.yml','utf8');

  it('extends the existing canonical campaign authority instead of creating another engine', () => {
    expect(migration).toContain('alter table public.campaigns');
    expect(migration).toContain("campaign_kind in ('HUNTER','MARKETING')");
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(?:marketing_)?campaigns\b/i);
    expect(migration).toContain("campaign_kind='HUNTER'");
    expect(migration).toContain("campaign_kind='MARKETING'");
    expect(page).toContain('Legacy Hunter campaigns');
  });

  it('binds marketing campaigns to exact immutable audience evidence', () => {
    expect(migration).toContain('public.crm_segment_snapshots');
    expect(migration).toContain("v_snapshot.purpose<>'CAMPAIGN'");
    expect(migration).toContain("v_snapshot.entity_type<>'LEAD'");
    expect(migration).toContain('audience_snapshot_id');
    expect(migration).toContain('segment_version');
    expect(page).toContain('Snapshot membership is not consent');
    expect(snapshots).toContain('<option value="CAMPAIGN"');
    expect(snapshots).toContain('Freeze for Marketing Campaign');
  });

  it('governs channel, schedule, frequency, budget, approvals and Shadow Mode', () => {
    expect(migration).toContain('frequency_cap_per_recipient');
    expect(migration).toContain('budget_cap_minor');
    expect(migration).toContain('scheduled_start_at');
    expect(migration).toContain('approval_status');
    expect(migration).toContain("v_role not in ('OWNER','ADMIN')");
    expect(migration).toContain('sc.shadow_mode');
    expect(migration).toContain('MARKETING campaign RC activation requires Shadow Mode ON');
  });

  it('uses governed templates and campaign variants for A/B evidence', () => {
    expect(migration).toContain('message_template_id');
    expect(migration).toContain('allocation_bps');
    expect(migration).toContain('is_control');
    expect(migration).toContain('v_allocation<>10000');
    expect(migration).toContain('v_control_count<>1');
    expect(messages).toContain('Managed by Campaigns');
  });

  it('keeps browser mutations behind the explicit service trust boundary', () => {
    expect(migration).toContain("current_user<>'service_role'");
    expect(actions).toContain('createSupabaseServiceClient');
    expect(actions).toContain('ctx.userId');
    expect(actions).toContain('ctx.organizationId');
    expect(migration).toContain('to service_role;');
    expect(migration).not.toMatch(/grant execute on function public\.create_marketing_campaign\([\s\S]*?\) to authenticated;/i);
  });

  it('records direct response and explicit conversion evidence without inventing attribution', () => {
    expect(migration).toContain('public.reply_events');
    expect(migration).toContain('marketing_campaign_conversion_evidence');
    expect(migration).toContain("'attribution_claimed',false");
    expect(page).toContain('explicit conversions');
    expect(page).toContain('Record explicit conversion evidence');
  });

  it('keeps consent and suppression at the canonical send gate and never sends from campaign control', () => {
    expect(migration).toContain("consent_policy='SEND_GATE_REQUIRED'");
    expect(migration).toContain('CONSENT_AND_SUPPRESSION_ENFORCED_AT_CANONICAL_SEND_GATE');
    expect(migration).toContain("'provider_send_triggered',false");
    expect(actions).not.toContain('approved-send');
    expect(actions).not.toContain('controlled-email-send');
    expect(actions).not.toContain('outreach_messages');
    expect(page).toContain('This page does not send messages.');
  });

  it('runs PostgreSQL 17 controlled acceptance in CI', () => {
    expect(ci).toContain('marketing-campaign-governance-smoke.sql');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0155_automation_notifications.sql','utf8');
const runtime=readFileSync('lib/notifications/runtime.ts','utf8');
const route=readFileSync('app/api/operations/automation-notifications/route.ts','utf8');
const page=readFileSync('app/notifications/page.tsx','utf8');
const worker=readFileSync('worker/index.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-NOTIFICATIONS contract',()=>{
  it('projects canonical evidence without inventing a second event bus or notification work queue',()=>{
    expect(migration).toContain('references public.audit_logs(id)');
    expect(migration).toContain('Per-member in-app projection derived from canonical audit/runtime/approval evidence');
    expect(migration).toContain('It is not a work queue');
    expect(migration).not.toMatch(/create table public\.(notification_queue|notification_events|event_bus|notification_jobs)/i);
  });

  it('uses a lossless cutover cursor so activation neither replays history nor skips bounded backlog',()=>{
    expect(migration).toContain('notification_projection_checkpoints');
    expect(migration).toContain('last_scanned_id uuid');
    expect(migration).toContain('a.created_at>v_from');
    expect(migration).toContain('a.id>v_from_id');
    expect(migration).toContain('v_last_id:=v_event.id');
    expect(migration).not.toContain("a.created_at>=now()-interval '48 hours'");
  });

  it('covers approval escalation/expiry and runtime DLQ without recursive escalation projection',()=>{
    for(const action of [
      'MESSAGE_APPROVAL_ESCALATED',
      'MESSAGE_APPROVAL_EXPIRED',
      'AUTOMATION_RUN_DEAD_LETTER',
    ]) expect(migration).toContain(action);
    expect(migration).toContain("'NOTIFICATION_ESCALATED'");
    expect(migration.match(/NOTIFICATION_ESCALATED/g)?.length).toBe(1);
  });

  it('governs preferences, in-app read/ack, dedupe, severity and escalation',()=>{
    for(const marker of [
      'notification_preferences',
      'notification_inbox',
      'notification_delivery_receipts',
      'minimum_severity',
      'mark_notification_state',
      'reconcile_notification_escalations',
      'unique (organization_id,recipient_user_id,event_key)',
      'unique (notification_id,channel,escalation_level)',
    ]) expect(migration).toContain(marker);
    expect(migration).toContain("v_action not in ('READ','ACKNOWLEDGE')");
  });

  it('reuses the existing Telegram and email provider authorities',()=>{
    expect(runtime).toContain("import { notifyTelegramOwner } from '@/lib/telegram/notifications'");
    expect(runtime).toContain("import { ResendEmailProvider } from '@/lib/outreach/resend-provider'");
    expect(runtime).toContain('await notifyTelegramOwner({');
    expect(runtime).toContain('await provider.sendEmail({');
    expect(runtime).not.toContain("fetch('https://api.telegram.org");
    expect(runtime).not.toContain("fetch('https://api.resend.com");
  });

  it('keeps email destination fail-closed and push/SMS dependency-gated',()=>{
    expect(runtime).toContain('notificationMailboxId');
    expect(runtime).toContain('NOTIFICATION_EMAIL_OR_MAILBOX_NOT_CONFIGURED');
    expect(runtime).toContain('DEVICE_REGISTRATION_AND_PUSH_PROVIDER_NOT_CONFIGURED');
    expect(runtime).toContain('OMNI_SMS_RCS_PROVIDER_ROUTE_NOT_PRODUCTION_VERIFIED');
    expect(page).toContain('DEPENDENCY PENDING');
  });

  it('does not make temporary configuration blockers terminal delivery receipts',()=>{
    expect(runtime).toContain('Configuration blockers are intentionally not terminal receipts');
    expect(runtime).toContain('Configuration blockers are not terminal receipts');
  });

  it('adds an in-app Notification Center and keeps scheduled delivery on the existing Cloudflare loop',()=>{
    expect(shell).toContain("['Notifications', '/notifications']");
    expect(page).toContain('My notification preferences');
    expect(route).toContain('runAutomationNotifications');
    expect(worker).toContain("internalPost(env, '/api/operations/automation-notifications', { limit: 50 })");
  });

  it('keeps trusted mutation RPCs server-side and CI-covered',()=>{
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).not.toContain('security definer');
    expect(ci).toContain('automation-notifications-smoke.sql');
  });
});

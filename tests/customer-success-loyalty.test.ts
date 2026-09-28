import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0147_customer_success_loyalty.sql','utf8');
const page=readFileSync('app/customer-success/page.tsx','utf8');
const actions=readFileSync('app/customer-success/customer-success-actions.ts','utf8');
const service=readFileSync('lib/crm/customer-success.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('CUSTOMER-SUCCESS-LOYALTY contract',()=>{
  it('reuses canonical CRM Task and Marketing Campaign authorities',()=>{
    expect(migration).toContain("'CUSTOMER_SUCCESS'");
    expect(migration).toContain('accept_customer_success_task_candidate');
    expect(migration).toContain('set_marketing_campaign_customer_success_lifecycle');
    expect(migration).toContain("campaign_kind='MARKETING'");
    expect(migration).not.toMatch(/create table public\.customer_success_tasks/i);
    expect(migration).not.toMatch(/create table public\.customer_success_campaigns/i);
  });

  it('persists only the missing loyalty/referral domain truths',()=>{
    expect(migration).toContain('create table public.customer_loyalty_events');
    expect(migration).toContain('create table public.customer_referrals');
    expect(migration).toContain('Customer loyalty event is append-only');
    expect(migration).toContain('Customer loyalty balance cannot become negative');
    expect(migration).toContain('Referral conversion requires canonical WON Deal evidence');
    expect(migration).toContain('Referral reward requires canonical loyalty EARN evidence');
  });

  it('keeps mutations behind the trusted service boundary',()=>{
    for(const marker of [
      'CUSTOMER_SUCCESS task acceptance requires trusted server boundary',
      'Customer referral mutation requires trusted server boundary',
      'Customer referral transition requires trusted server boundary',
      'Customer loyalty mutation requires trusted server boundary',
      'Customer-success Campaign classification requires trusted server boundary',
    ]) expect(migration).toContain(marker);

    expect(migration).toContain('to service_role');
    expect(migration).toContain('customer_loyalty_events_member_read');
    expect(migration).toContain('customer_referrals_member_read');
  });

  it('derives explainable health instead of creating hidden AI truth',()=>{
    expect(migration).toContain('get_customer_success_accounts');
    expect(migration).toContain("'SLA_BREACH'");
    expect(migration).toContain("'OVERDUE_TASK'");
    expect(migration).toContain("'NEGATIVE_SENTIMENT_30D'");
    expect(migration).toContain("'INACTIVE_60D'");
    expect(migration).toContain("'FORMER_CUSTOMER'");
    expect(migration).not.toMatch(/customer_success_score(s)?\s*\(/i);
  });

  it('does not create a provider send or payment/revenue mutation path',()=>{
    expect(migration).not.toMatch(/insert\s+into\s+public\.outreach_messages/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.conversation_messages/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.payments/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.invoices/i);
    expect(page).toContain('cannot send a customer message');
    expect(page).toContain('never money, billing credit or collected revenue');
  });

  it('delivers operator controls and canonical navigation',()=>{
    expect(shell).toContain("['Customer Success', '/customer-success']");
    expect(page).toContain('Customer Success & Loyalty');
    expect(page).toContain('Accept as CRM Task');
    expect(page).toContain('Record points evidence');
    expect(page).toContain('Record referral');
    expect(page).toContain('Lifecycle campaigns');
    expect(actions).toContain("createSupabaseServiceClient()");
    expect(service).toContain("rpc('get_customer_success_accounts'");
  });

  it('runs the PostgreSQL acceptance gate in CI',()=>{
    expect(ci).toContain('customer-success-loyalty-smoke.sql');
  });
});

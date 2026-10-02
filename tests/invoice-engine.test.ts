import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0177_invoice_engine.sql','utf8');
const runtime=readFileSync('lib/automation/runtime.ts','utf8');
const customer360=readFileSync('lib/crm/customer360.ts','utf8');
const invoicePage=readFileSync('app/invoices/[id]/page.tsx','utf8');
const invoiceDocument=readFileSync('app/invoices/[id]/document/page.tsx','utf8');
const orderPage=readFileSync('app/orders/[id]/page.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('INVOICE-ENGINE contract',()=>{
  it('creates one canonical invoice/credit evidence authority without Payment or scheduler duplication',()=>{
    for(const marker of [
      'create table public.invoices',
      'create table public.invoice_line_items',
      'create table public.invoice_credit_notes',
      'create table public.invoice_credit_note_line_items',
      'create table public.invoice_lifecycle_events',
    ]) expect(migration).toContain(marker);
    expect(migration).not.toMatch(/create table public\.(payments|payment_transactions|refunds|tax_rules|tax_rates)/i);
    expect(migration).not.toMatch(/cron\.schedule|pgmq\.|create extension.*pg_cron/i);
  });

  it('snapshots Order commercial evidence and keeps issued documents immutable',()=>{
    expect(migration).toContain('create_invoice_from_order_v1');
    expect(migration).toContain('from public.order_line_items ol');
    expect(migration).toContain('issued document snapshot is immutable');
    expect(migration).toContain("'paymentExecutionAvailable',false");
    expect(migration).toContain("'refundExecutionAvailable',false");
  });

  it('supports due/overdue balance and bounded Credit Notes without executing refunds',()=>{
    expect(migration).toContain('balance_due numeric(18,4) generated always as');
    expect(migration).toContain('reconcile_due_invoices_v1');
    expect(migration).toContain('issue_invoice_credit_note_v1');
    expect(migration).toContain('Credit Note quantity exceeds remaining Invoice line quantity');
    expect(migration).toContain("'refundTruthCreated',false");
  });

  it('activates real Invoice automation producers through the existing runtime scheduler',()=>{
    expect(migration).toContain("where trigger_key in ('INVOICE_ISSUED','INVOICE_OVERDUE')");
    expect(migration).toContain('reconcile_invoice_automation_events');
    expect(runtime).toContain("'reconcile_due_invoices_v1'");
    expect(runtime).toContain("'reconcile_invoice_automation_events'");
  });

  it('extends Customer 360 cutover-safely instead of replacing it',()=>{
    expect(migration).toContain('get_crm_customer360_v5');
    expect(migration).toContain('get_crm_customer360_v4');
    expect(customer360).toContain("rpc('get_crm_customer360_v5'");
    expect(customer360).toContain("error?.code === 'PGRST202'");
    expect(customer360).toContain("rpc('get_crm_customer360_v4'");
  });

  it('exposes governed Order-to-Invoice and immutable print surfaces',()=>{
    expect(orderPage).toContain('createInvoiceFromOrderV1');
    expect(invoicePage).toContain('CreditNoteForm');
    expect(invoiceDocument).toContain('document_snapshot');
    expect(invoiceDocument).toContain('PrintInvoiceButton');
  });

  it('runs controlled PG17 Invoice acceptance in CI',()=>{
    expect(ci).toContain('invoice-engine-smoke.sql');
  });
});

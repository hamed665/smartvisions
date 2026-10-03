'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';

function required(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function nonNegative(form: FormData, key: string) {
  const value = Number(required(form, key));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number`);
  return value;
}

function boundedText(form: FormData, key: string, max: number) {
  const value = String(form.get(key) ?? '').trim();
  if (value.length > max) throw new Error(`${key} is too long`);
  return value;
}

function currency(form: FormData) {
  const value = required(form, 'currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('currency must be a three-letter ISO code');
  return value;
}

function bpsFromPercent(form: FormData, key: string) {
  const percent = nonNegative(form, key);
  if (percent > 100) throw new Error(`${key} must be between 0 and 100`);
  return Math.round(percent * 100);
}

export async function recordCompanyFinancialSnapshot(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');

  const sourceRef = required(form, 'source_ref');
  if (sourceRef.length > 512) throw new Error('source_ref is too long');
  const note = boundedText(form, 'note', 1800);

  const { error } = await ctx.supabase.from('company_financial_snapshots').insert({
    organization_id: ctx.organizationId,
    as_of_date: required(form, 'as_of_date'),
    currency: currency(form),
    cash_balance: nonNegative(form, 'cash_balance'),
    monthly_net_burn: nonNegative(form, 'monthly_net_burn'),
    monthly_payroll: nonNegative(form, 'monthly_payroll'),
    monthly_sales_marketing_spend: nonNegative(form, 'monthly_sales_marketing_spend'),
    monthly_other_opex: nonNegative(form, 'monthly_other_opex'),
    accounts_receivable: nonNegative(form, 'accounts_receivable'),
    accounts_payable: nonNegative(form, 'accounts_payable'),
    source_type: 'MANUAL_CONFIRMED',
    source_ref: sourceRef,
    evidence: {
      confirmation: 'OWNER_MANUAL_CONFIRMED',
      note: note || null,
      recordedAt: new Date().toISOString(),
    },
    created_by_user_id: ctx.userId,
  });
  if (error) throw new Error(`Company financial snapshot failed: ${error.message}`);
  revalidatePath('/founder');
}

export async function saveFounderFinanceScenario(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');

  const id = String(form.get('id') ?? '').trim();
  const version = Number(form.get('version') ?? 0);
  const payload = {
    name: required(form, 'name').slice(0, 120),
    currency: currency(form),
    cash_balance_assumption: nonNegative(form, 'cash_balance_assumption'),
    monthly_net_burn_assumption: nonNegative(form, 'monthly_net_burn_assumption'),
    monthly_sales_marketing_spend_assumption: nonNegative(form, 'monthly_sales_marketing_spend_assumption'),
    new_customers_per_month_assumption: nonNegative(form, 'new_customers_per_month_assumption'),
    target_customer_count_assumption: nonNegative(form, 'target_customer_count_assumption'),
    monthly_arpa_assumption: nonNegative(form, 'monthly_arpa_assumption'),
    gross_margin_bps_assumption: bpsFromPercent(form, 'gross_margin_pct_assumption'),
    monthly_churn_bps_assumption: bpsFromPercent(form, 'monthly_churn_pct_assumption'),
    notes: boundedText(form, 'notes', 2000) || null,
    updated_by_user_id: ctx.userId,
  };

  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version) || version < 1) {
      throw new Error('Invalid scenario identity');
    }
    const { data, error } = await ctx.supabase
      .from('founder_finance_scenarios')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Founder scenario update failed: ${error.message}`);
    if (!data) throw new Error('Founder scenario version conflict');
  } else {
    const { error } = await ctx.supabase.from('founder_finance_scenarios').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
      status: 'ACTIVE',
    });
    if (error) throw new Error(`Founder scenario create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}

export async function archiveFounderFinanceScenario(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  const id = required(form, 'id');
  const version = Number(required(form, 'version'));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version) || version < 1) {
    throw new Error('Invalid scenario identity');
  }

  const { data, error } = await ctx.supabase
    .from('founder_finance_scenarios')
    .update({ status: 'ARCHIVED', updated_by_user_id: ctx.userId })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Founder scenario archive failed: ${error.message}`);
  if (!data) throw new Error('Founder scenario version conflict');
  revalidatePath('/founder');
}

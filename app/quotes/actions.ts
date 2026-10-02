'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const QUOTE_ROLES = new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}
function optional(formData: FormData, key: string) {
  const value = field(formData,key);
  return value || null;
}
function integer(formData: FormData, key: string) {
  const value = Number(field(formData,key));
  if (!Number.isInteger(value)) throw new Error(key + ' must be an integer');
  return value;
}
function parseDate(raw: string) {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('valid_until must be a date');
  return new Date(value + 'T23:59:59.999Z').toISOString();
}
function parseLines(raw: string) {
  const value = JSON.parse(raw || '[]');
  if (!Array.isArray(value) || value.length<1 || value.length>500) {
    throw new Error('Quote requires 1–500 line items');
  }
  return value;
}
async function context() {
  const current = await getCurrentOrganization();
  if (!current.userId || !QUOTE_ROLES.has(String(current.role))) {
    throw new Error('Quote permission required');
  }
  return {...current, service:createSupabaseServiceClient()};
}
function refresh(id?: string) {
  revalidatePath('/quotes');
  if (id) {
    revalidatePath('/quotes/' + id);
    revalidatePath('/quotes/' + id + '/document');
  }
}
function rpcError(label: string, error: {message?: string}|null) {
  if (error) throw new Error(label + ': ' + (error.message ?? 'unknown error'));
}

export async function createQuoteV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const {error}=await service.rpc('create_quote_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_quote_id:quoteId,
    p_tenant_business_id:field(formData,'tenant_business_id'),
    p_branch_id:optional(formData,'branch_id'),
    p_person_id:optional(formData,'person_id'),
    p_buyer_business_id:optional(formData,'buyer_business_id'),
    p_deal_id:optional(formData,'deal_id'),
    p_owner_user_id:userId,
    p_country_code:field(formData,'country_code'),
    p_currency:field(formData,'currency'),
    p_valid_until:parseDate(field(formData,'valid_until')),
    p_terms:optional(formData,'terms'),
    p_notes:optional(formData,'notes'),
    p_lines:parseLines(field(formData,'lines_json')),
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Create Quote failed',error);
  refresh(quoteId);
}

export async function createQuoteVersionV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const {error}=await service.rpc('create_quote_version_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_quote_id:quoteId,
    p_expected_quote_version:integer(formData,'expected_quote_version'),
    p_country_code:field(formData,'country_code'),
    p_currency:field(formData,'currency'),
    p_valid_until:parseDate(field(formData,'valid_until')),
    p_terms:optional(formData,'terms'),
    p_notes:optional(formData,'notes'),
    p_lines:parseLines(field(formData,'lines_json')),
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Create Quote version failed',error);
  refresh(quoteId);
}

export async function submitQuoteReviewV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const {error}=await service.rpc('submit_quote_review_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_quote_id:quoteId,
    p_expected_quote_version:integer(formData,'expected_quote_version'),
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Submit Quote review failed',error); refresh(quoteId);
}

export async function decideQuoteReviewV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const {error}=await service.rpc('decide_quote_review_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_quote_id:quoteId,
    p_decision:field(formData,'decision'),p_note:optional(formData,'note'),
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Quote review decision failed',error); refresh(quoteId);
}

export async function markQuoteSentV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const {error}=await service.rpc('mark_quote_sent_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_quote_id:quoteId,
    p_expected_quote_version:integer(formData,'expected_quote_version'),
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Mark Quote sent failed',error); refresh(quoteId);
}

export async function recordManualQuoteDecisionV1(formData: FormData) {
  const {organizationId,userId,service}=await context();
  const quoteId=field(formData,'quote_id');
  const decision=field(formData,'decision');
  const note=field(formData,'evidence_note');
  if (note.length<3) throw new Error('Customer decision evidence is required');
  const {error}=await service.rpc('record_quote_customer_decision_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_quote_id:quoteId,
    p_decision:decision,p_evidence_source:'MANUAL_CONFIRMED',
    p_evidence:{note,recordedAt:new Date().toISOString()},
    p_request_key:field(formData,'request_key'),
  });
  rpcError('Record Quote customer decision failed',error); refresh(quoteId);
}

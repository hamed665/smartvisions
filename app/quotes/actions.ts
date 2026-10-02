'use server';

import { revalidatePath } from 'next/cache';
import { DateTime } from 'luxon';

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
async function normalizeValidUntil(input: {
  service: ReturnType<typeof createSupabaseServiceClient>;
  organizationId: string;
  raw: string;
  tenantBusinessId?: string | null;
  quoteId?: string | null;
}) {
  const raw=input.raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('valid_until must be a date');

  let sellerId=input.tenantBusinessId??null;
  if (!sellerId && input.quoteId) {
    const {data:quote,error}=await input.service.from('quotes')
      .select('tenant_business_id')
      .eq('organization_id',input.organizationId)
      .eq('id',input.quoteId)
      .maybeSingle();
    if (error) throw new Error('Quote seller lookup failed: '+error.message);
    sellerId=quote?.tenant_business_id?String(quote.tenant_business_id):null;
  }
  if (!sellerId) throw new Error('Seller Business is required for Quote validity');

  const {data:seller,error}=await input.service.from('tenant_businesses')
    .select('timezone')
    .eq('organization_id',input.organizationId)
    .eq('id',sellerId)
    .maybeSingle();
  if (error) throw new Error('Seller timezone lookup failed: '+error.message);
  if (!seller) throw new Error('Seller Business was not found');

  const zone=String(seller.timezone||'UTC');
  const parsed=DateTime.fromISO(raw,{zone});
  if (!parsed.isValid) throw new Error('valid_until is invalid');
  const iso=parsed.endOf('day').toUTC().toISO();
  if (!iso) throw new Error('valid_until could not be normalized');
  return iso;
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
  const tenantBusinessId=field(formData,'tenant_business_id');
  const validUntil=await normalizeValidUntil({
    service,organizationId,raw:field(formData,'valid_until'),tenantBusinessId,
  });
  const {error}=await service.rpc('create_quote_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_quote_id:quoteId,
    p_tenant_business_id:tenantBusinessId,
    p_branch_id:optional(formData,'branch_id'),
    p_person_id:optional(formData,'person_id'),
    p_buyer_business_id:optional(formData,'buyer_business_id'),
    p_deal_id:optional(formData,'deal_id'),
    p_owner_user_id:userId,
    p_country_code:field(formData,'country_code'),
    p_currency:field(formData,'currency'),
    p_valid_until:validUntil,
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
  const validUntil=await normalizeValidUntil({
    service,organizationId,raw:field(formData,'valid_until'),quoteId,
  });
  const {error}=await service.rpc('create_quote_version_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_quote_id:quoteId,
    p_expected_quote_version:integer(formData,'expected_quote_version'),
    p_country_code:field(formData,'country_code'),
    p_currency:field(formData,'currency'),
    p_valid_until:validUntil,
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

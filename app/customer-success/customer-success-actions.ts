'use server';

import { revalidatePath } from 'next/cache';
import {
  acceptCustomerSuccessTaskCandidate,
  classifyCustomerSuccessCampaign,
  recordCustomerLoyaltyEvent,
  recordCustomerReferral,
  transitionCustomerReferral,
  type CustomerSuccessAction,
} from '@/lib/crm/customer-success';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const managerRoles = new Set(['OWNER','ADMIN','SALES_MANAGER']);
const taskRoles = new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const required = (form: FormData, key: string) => {
  const value = text(form,key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const uuid = (form: FormData, key: string) => {
  const value=required(form,key);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
};
const optionalUuid = (form: FormData,key:string) => {
  const value=text(form,key);
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
};
const integer = (form: FormData,key:string) => {
  const value=Number(required(form,key));
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
};

function refresh() {
  for (const path of ['/customer-success','/tasks','/campaigns','/audit']) revalidatePath(path);
}

async function operator(roles: Set<string>) {
  const ctx=await getCurrentOrganization();
  if (!roles.has(ctx.role)) throw new Error('Customer Success operation is not permitted for this role');
  return ctx;
}

export async function acceptCustomerSuccessTask(form: FormData) {
  const ctx=await operator(taskRoles);
  const action=required(form,'action_kind').toUpperCase() as Exclude<CustomerSuccessAction,'NONE'>;
  if (!['ONBOARDING','RETENTION_REVIEW','REACTIVATION'].includes(action)) {
    throw new Error('Unsupported Customer Success action');
  }
  const assignee=optionalUuid(form,'assignee_user_id') ?? ctx.userId;
  if (ctx.role==='SALES_AGENT' && assignee!==ctx.userId) throw new Error('SALES_AGENT may only assign to self');

  await acceptCustomerSuccessTaskCandidate({
    supabase:createSupabaseServiceClient(),
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    businessId:uuid(form,'business_id'),
    actionKind:action,
    assigneeUserId:assignee,
    dueAt:null,
    reminderAt:null,
    requestKey:required(form,'request_key'),
  });
  refresh();
}

export async function recordCustomerLoyalty(form: FormData) {
  const ctx=await operator(managerRoles);
  const eventType=required(form,'event_type').toUpperCase();
  if (!['EARN','REDEEM','ADJUST','EXPIRE'].includes(eventType)) throw new Error('Unsupported loyalty event');
  const sourceType=(text(form,'source_type') || 'MANUAL').toUpperCase();
  if (!['MANUAL','REFERRAL','CAMPAIGN','SERVICE_RECOVERY','OTHER'].includes(sourceType)) throw new Error('Unsupported loyalty source');

  await recordCustomerLoyaltyEvent({
    supabase:createSupabaseServiceClient(),
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    businessId:uuid(form,'business_id'),
    personId:optionalUuid(form,'person_id'),
    eventType:eventType as 'EARN'|'REDEEM'|'ADJUST'|'EXPIRE',
    pointsDelta:integer(form,'points_delta'),
    rewardKey:text(form,'reward_key') || null,
    sourceType:sourceType as 'MANUAL'|'REFERRAL'|'CAMPAIGN'|'SERVICE_RECOVERY'|'OTHER',
    sourceRef:required(form,'source_ref'),
    occurredAt:new Date().toISOString(),
    requestKey:required(form,'request_key'),
    metadata:{ recordedFrom:'CUSTOMER_SUCCESS_OPERATOR' },
  });
  refresh();
}

export async function recordCustomerReferralAction(form: FormData) {
  const ctx=await operator(managerRoles);
  const note=required(form,'evidence_note');
  if (note.length>1000) throw new Error('Referral evidence note is too long');

  await recordCustomerReferral({
    supabase:createSupabaseServiceClient(),
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    referrerBusinessId:uuid(form,'referrer_business_id'),
    referrerPersonId:optionalUuid(form,'referrer_person_id'),
    referredLeadId:optionalUuid(form,'referred_lead_id'),
    referredBusinessId:optionalUuid(form,'referred_business_id'),
    sourceRef:required(form,'source_ref'),
    occurredAt:new Date().toISOString(),
    requestKey:required(form,'request_key'),
    evidence:{ source:'OPERATOR', note },
  });
  refresh();
}

export async function transitionCustomerReferralAction(form: FormData) {
  const ctx=await operator(managerRoles);
  const action=required(form,'action').toUpperCase();
  if (!['QUALIFY','CONVERT','REWARD','CANCEL'].includes(action)) throw new Error('Unsupported referral transition');
  const note=required(form,'evidence_note');
  if (note.length>1000) throw new Error('Referral transition note is too long');

  await transitionCustomerReferral({
    supabase:createSupabaseServiceClient(),
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    referralId:uuid(form,'referral_id'),
    action:action as 'QUALIFY'|'CONVERT'|'REWARD'|'CANCEL',
    evidence:{ source:'OPERATOR', note },
  });
  refresh();
}

export async function rewardCustomerReferral(form: FormData) {
  const ctx=await operator(managerRoles);
  const referralId=uuid(form,'referral_id');
  const businessId=uuid(form,'business_id');
  const requestKey=required(form,'request_key');
  const points=integer(form,'points');
  if (points<=0) throw new Error('Referral reward points must be positive');

  const service=createSupabaseServiceClient();
  await recordCustomerLoyaltyEvent({
    supabase:service,
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    businessId,
    eventType:'EARN',
    pointsDelta:points,
    rewardKey:'REFERRAL_REWARD',
    sourceType:'REFERRAL',
    sourceRef:referralId,
    occurredAt:new Date().toISOString(),
    requestKey,
    metadata:{ recordedFrom:'CUSTOMER_SUCCESS_REFERRAL_REWARD' },
  });
  await transitionCustomerReferral({
    supabase:service,
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    referralId,
    action:'REWARD',
    evidence:{ source:'LOYALTY_LEDGER', requestKey },
  });
  refresh();
}

export async function classifyCustomerSuccessLifecycleCampaign(form: FormData) {
  const ctx=await operator(managerRoles);
  const raw=text(form,'lifecycle').toUpperCase();
  if (raw && !['ONBOARDING','RETENTION','REACTIVATION','LOYALTY','REFERRAL'].includes(raw)) {
    throw new Error('Unsupported Customer Success lifecycle');
  }
  await classifyCustomerSuccessCampaign({
    supabase:createSupabaseServiceClient(),
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    campaignId:uuid(form,'campaign_id'),
    lifecycle:(raw || null) as 'ONBOARDING'|'RETENTION'|'REACTIVATION'|'LOYALTY'|'REFERRAL'|null,
  });
  refresh();
}

'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { evaluateProjectHunter, PROJECT_CHANNELS, type ProjectChannel } from '@/lib/hunters/intent/project-hunter';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const numberOrUndefined = (value: string) => value === '' ? undefined : Number(value);
const STAGES = {
  REVIEW: new Set(['REJECTED']),
  DRAFT_READY: new Set(['APPROVED_FOR_MANUAL_SEND','REVIEW','REJECTED']),
  APPROVED_FOR_MANUAL_SEND: new Set(['SENT_MANUALLY','REVIEW','REJECTED']),
  SENT_MANUALLY: new Set(['REPLIED','LOST']),
  REPLIED: new Set(['WON','LOST']),
  WON: new Set<string>(),
  LOST: new Set<string>(),
  REJECTED: new Set(['REVIEW']),
} as const;

export async function addProjectHunterOpportunity(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const channel = text(form,'channel') as ProjectChannel;
  if (!PROJECT_CHANNELS.includes(channel)) throw new Error('Select a supported source');
  const evaluated = evaluateProjectHunter({
    channel,
    title:text(form,'title'),
    body:text(form,'body'),
    sourceUrl:text(form,'sourceUrl'),
    postedAt:text(form,'postedAt') || undefined,
    budgetAmount:numberOrUndefined(text(form,'budgetAmount')),
    budgetCurrency:text(form,'budgetCurrency') || 'USD',
    proposalCount:numberOrUndefined(text(form,'proposalCount')),
    paymentVerified:form.get('paymentVerified') === 'on',
  });
  const {data:existing,error:lookupError} = await ctx.supabase.from('intent_opportunities')
    .select('id').eq('organization_id',ctx.organizationId)
    .eq('source_type',evaluated.sourceType).eq('source_id',evaluated.sourceId).maybeSingle();
  if (lookupError) throw new Error('Project opportunity lookup failed');
  if (existing) {revalidatePath('/hunters/project-hunter');return;}
  const opportunity = {
    organization_id:ctx.organizationId,
    source_type:evaluated.sourceType,
    source_id:evaluated.sourceId,
    source_url:evaluated.input.sourceUrl,
    title:evaluated.input.title,
    body:evaluated.input.body,
    budget_amount:evaluated.input.budgetAmount ?? null,
    budget_currency:evaluated.input.budgetCurrency,
    posted_at:evaluated.input.postedAt ? new Date(evaluated.input.postedAt).toISOString() : null,
    detected_at:new Date().toISOString(),
    language:'en',
    service_hint:evaluated.intent.opportunity.serviceHint ?? null,
    freshness_score:evaluated.intent.scoring.freshnessScore,
    intent_score:evaluated.intent.scoring.score,
    priority:evaluated.intent.scoring.priority,
    scoring_reasons:evaluated.reasons,
    contactability:evaluated.contactability,
    project_channel:evaluated.input.channel,
    project_fit_score:evaluated.fitScore,
    project_review_status:evaluated.status,
    project_proposal_draft:evaluated.draft,
    project_evidence:{
      origin:'OWNER_MANUAL_IMPORT',paymentVerifiedReported:evaluated.input.paymentVerified === true,
      proposalCountReported:evaluated.input.proposalCount ?? null,
      geoRestricted:evaluated.geoRestricted,skillMatches:evaluated.skills,
      verification:'UNVERIFIED_OPERATOR_SUPPLIED',externalMessageSent:false,
    },
  };
  const {data:created,error} = await ctx.supabase.from('intent_opportunities').insert(opportunity).select('id').single();
  if (error) {
    // An identical real URL imported concurrently is a safe no-op.
    if (error.code==='23505') {revalidatePath('/hunters/project-hunter');return;}
    throw new Error('Could not save project opportunity');
  }
  const {error:auditError} = await ctx.supabase.from('audit_logs').insert({
    organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,
    action:'PROJECT_HUNTER_MANUAL_IMPORT',entity_type:'intent_opportunity',entity_id:created.id,
    after_data:{channel,fitScore:evaluated.fitScore,status:evaluated.status,providerCalls:0,llmCalls:0,externalMessageSent:false},
  });
  if (auditError) throw new Error('Opportunity was saved, but audit confirmation failed; review before continuing');
  revalidatePath('/hunters/project-hunter');
  revalidatePath('/hunters');
}

export async function reviewProjectHunterOpportunity(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id=text(form,'id'), next=text(form,'status');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid opportunity identifier');
  const {data:row,error} = await ctx.supabase.from('intent_opportunities')
    .select('id,project_review_status,project_channel')
    .eq('organization_id',ctx.organizationId).eq('id',id).maybeSingle();
  if (error || !row || !row.project_channel) throw new Error('Project opportunity not found');
  const previous=String(row.project_review_status);
  if (!(previous in STAGES) || !STAGES[previous as keyof typeof STAGES].has(next)) {
    throw new Error('Invalid project review transition');
  }
  if (next==='SENT_MANUALLY' && text(form,'sentConfirmation') !== 'I_SENT_IT_MANUALLY') {
    throw new Error('Manual submission attestation is required');
  }
  const {data:updated,error:updateError} = await ctx.supabase.from('intent_opportunities')
    .update({project_review_status:next,project_reviewed_at:new Date().toISOString()})
    .eq('id',id).eq('organization_id',ctx.organizationId).eq('project_review_status',previous)
    .select('id').maybeSingle();
  if (updateError || !updated) throw new Error('The opportunity changed; refresh and retry');
  const {error:auditError} = await ctx.supabase.from('audit_logs').insert({
    organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,
    action:'PROJECT_HUNTER_OWNER_REVIEW',entity_type:'intent_opportunity',entity_id:id,
    before_data:{status:previous},after_data:{status:next,providerCalls:0,externalMessageSent:false,
      manualSubmissionAttested:next==='SENT_MANUALLY'},
  });
  if (auditError) throw new Error('Status updated but audit confirmation failed');
  revalidatePath('/hunters/project-hunter');
}

'use server';

import { revalidatePath } from 'next/cache';
import { createCrmTask, updateCrmTask, type CrmTaskPriority, type CrmTaskStatus, type CrmTaskType } from '@/lib/crm/tasks';
import { updateCrmDeal } from '@/lib/crm/deals';
import { getCurrentOrganization } from '@/lib/supabase/org';

const OPERATOR_ROLES = new Set(['OWNER','ADMIN']);
const TASK_TYPES = new Set<CrmTaskType>(['GENERAL','CALL','EMAIL','WHATSAPP','MEETING','REVIEW','FOLLOW_UP','FIELD_SERVICE','OTHER']);
const TASK_PRIORITIES = new Set<CrmTaskPriority>(['LOW','NORMAL','HIGH','URGENT']);
const TASK_STATUSES = new Set<CrmTaskStatus>(['OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELED']);

function text(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function required(form: FormData, key: string) { const value=text(form,key); if(!value) throw new Error(`${key} is required`); return value; }
function optional(form: FormData, key: string) { const value=text(form,key); return value || null; }
function integer(form: FormData, key: string) { const value=Number(required(form,key)); if(!Number.isInteger(value)||value<1) throw new Error(`${key} must be a positive integer`); return value; }
function optionalIso(form: FormData, key: string) {
  const value=text(form,key); if(!value) return null;
  const parsed=Date.parse(value); if(!Number.isFinite(parsed)) throw new Error(`${key} must be a valid date/time`);
  return new Date(parsed).toISOString();
}
function optionalNumber(form: FormData,key:string) {
  const value=text(form,key); if(!value) return undefined;
  const parsed=Number(value); if(!Number.isFinite(parsed)) throw new Error(`${key} must be a number`);
  return parsed;
}
async function operator() {
  const ctx=await getCurrentOrganization();
  if(!ctx.userId||!OPERATOR_ROLES.has(String(ctx.role))) throw new Error('Owner Copilot action requires OWNER or ADMIN');
  return ctx;
}
function refresh() {
  for(const path of ['/tasks','/crm','/founder','/copilot']) revalidatePath(path);
}

export async function createOwnerCopilotTask(form: FormData) {
  const ctx=await operator();
  const taskType=(text(form,'task_type')||'GENERAL').toUpperCase() as CrmTaskType;
  const priority=(text(form,'priority')||'NORMAL').toUpperCase() as CrmTaskPriority;
  if(!TASK_TYPES.has(taskType)) throw new Error('task_type is invalid');
  if(!TASK_PRIORITIES.has(priority)) throw new Error('priority is invalid');
  const task=await createCrmTask({
    supabase:ctx.supabase,
    organizationId:ctx.organizationId,
    actorUserId:ctx.userId,
    businessId:optional(form,'business_id'),
    leadId:optional(form,'lead_id'),
    conversationId:optional(form,'conversation_id'),
    dealId:optional(form,'deal_id'),
    personId:optional(form,'person_id'),
    taskType,
    title:required(form,'title'),
    description:optional(form,'description'),
    priority,
    assigneeUserId:optional(form,'assignee_user_id') ?? ctx.userId,
    dueAt:optionalIso(form,'due_at'),
    reminderAt:optionalIso(form,'reminder_at'),
    requestKey:required(form,'request_key'),
    metadata:{source:'OWNER_COPILOT'},
  });
  refresh();
  return task;
}

export async function updateOwnerCopilotTask(form: FormData) {
  const ctx=await operator();
  const patch: Parameters<typeof updateCrmTask>[0]['patch']={};
  const status=text(form,'status').toUpperCase();
  const priority=text(form,'priority').toUpperCase();
  const taskType=text(form,'task_type').toUpperCase();
  if(status){ if(!TASK_STATUSES.has(status as CrmTaskStatus)) throw new Error('status is invalid'); patch.status=status as CrmTaskStatus; }
  if(priority){ if(!TASK_PRIORITIES.has(priority as CrmTaskPriority)) throw new Error('priority is invalid'); patch.priority=priority as CrmTaskPriority; }
  if(taskType){ if(!TASK_TYPES.has(taskType as CrmTaskType)) throw new Error('task_type is invalid'); patch.taskType=taskType as CrmTaskType; }
  if(text(form,'title')) patch.title=text(form,'title');
  if(form.has('description')) patch.description=optional(form,'description');
  if(form.has('assignee_user_id')) patch.assigneeUserId=optional(form,'assignee_user_id');
  if(form.has('due_at')) patch.dueAt=optionalIso(form,'due_at');
  if(form.has('reminder_at')) patch.reminderAt=optionalIso(form,'reminder_at');
  if(form.has('blocked_reason')) patch.blockedReason=optional(form,'blocked_reason');
  if(form.has('completion_note')) patch.completionNote=optional(form,'completion_note');
  if(!Object.keys(patch).length) throw new Error('At least one CRM task field must change');
  const task=await updateCrmTask({
    supabase:ctx.supabase,
    organizationId:ctx.organizationId,
    taskId:required(form,'task_id'),
    expectedVersion:integer(form,'expected_version'),
    patch,
  });
  refresh();
  return task;
}

export async function updateOwnerCopilotDeal(form: FormData) {
  const ctx=await operator();
  const patch: Parameters<typeof updateCrmDeal>[0]['patch']={};
  if(text(form,'title')) patch.title=text(form,'title');
  if(text(form,'stage_id')) patch.stageId=text(form,'stage_id');
  if(form.has('amount')) patch.amount=optionalNumber(form,'amount') ?? null;
  if(form.has('currency')) patch.currency=optional(form,'currency')?.toUpperCase() ?? null;
  if(form.has('expected_close_at')) patch.expectedCloseAt=optionalIso(form,'expected_close_at');
  if(text(form,'owner_user_id')) patch.ownerUserId=text(form,'owner_user_id');
  if(form.has('team_id')) patch.teamId=optional(form,'team_id');
  if(form.has('probability_override_bps')) patch.probabilityOverrideBps=optionalNumber(form,'probability_override_bps') ?? null;
  if(form.has('lost_reason')) patch.lostReason=optional(form,'lost_reason');
  if(!Object.keys(patch).length) throw new Error('At least one CRM deal field must change');
  const deal=await updateCrmDeal({
    supabase:ctx.supabase,
    organizationId:ctx.organizationId,
    dealId:required(form,'deal_id'),
    expectedVersion:integer(form,'expected_version'),
    patch,
  });
  refresh();
  return deal;
}

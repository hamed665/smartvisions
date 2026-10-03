import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { loadOwnerCopilotOperationalSnapshot } from '@/lib/owner-copilot/operational-snapshot';
import { createOwnerCopilotPreviewToken, verifyOwnerCopilotPreviewToken } from '@/lib/owner-copilot/preview-token';
import { planOwnerCopilotRequest } from '@/lib/telegram/assistant-planner';
import { executePanelAction, listOwnerCopilotAvailableActions, preparePanelAction } from '@/lib/telegram/panel-parity';
import type { PanelParityCommand } from '@/lib/telegram/panel-parity-types';

const ROLES=new Set(['OWNER','ADMIN']);
const REQUEST_KEY_ACTIONS=new Set([
  'crm.task.create','customer.task',
  'booking.confirm','booking.reschedule','booking.cancel',
  'quote.submit_review','quote.review_decide','quote.mark_sent',
  'order.start','order.cancel','invoice.issue','invoice.void',
  'payment.intent_create','payment.intent_cancel','payment.refund_request',
]);

function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function safeText(value:unknown,max:number){return String(value??'').trim().slice(0,max);}
function withRequestKey(command:PanelParityCommand):PanelParityCommand {
  if(!REQUEST_KEY_ACTIONS.has(command.action)||safeText(command.args.request_key,240)) return command;
  return {...command,args:{...command.args,request_key:`owner-copilot:${randomUUID()}`}};
}
function errorResponse(error:unknown,status=400){return NextResponse.json({error:error instanceof Error?error.message:'Owner Copilot request failed'},{status});}

export async function POST(request:Request){
  try{
    const ctx=await getCurrentOrganization();
    const role=String(ctx.role).toUpperCase();
    if(!ctx.userId||!ROLES.has(role)) return NextResponse.json({error:'Owner Copilot requires OWNER or ADMIN'},{status:403});
    const body=record(await request.json().catch(()=>({})));
    const mode=safeText(body.mode,20).toUpperCase()||'ASK';
    const service=createSupabaseServiceClient();
    const availablePanelActions=await listOwnerCopilotAvailableActions(service);

    if(mode==='ASK'){
      const text=safeText(body.text,4_000);
      if(!text) return NextResponse.json({error:'text is required'},{status:400});
      const snapshot=await loadOwnerCopilotOperationalSnapshot({supabase:service,organizationId:ctx.organizationId});
      const plan=await planOwnerCopilotRequest({
        organizationId:ctx.organizationId,
        text,
        operationalSnapshot:JSON.stringify(snapshot),
        availablePanelActions,
      });
      if(plan.mode!=='COMMAND') return NextResponse.json({mode:plan.mode,text:plan.text,importance:plan.importance,reason:plan.reason,snapshotGeneratedAt:snapshot.generatedAt});
      if(plan.command.type!=='PANEL_ACTION') return NextResponse.json({mode:'BLOCKED',text:'این action از مسیر ثبت‌شده Owner Copilot عبور نمی‌کند.',reason:'PANEL_ONLY'},{status:409});
      const command=withRequestKey(plan.command);
      const prepared=await preparePanelAction({
        supabase:service,
        organizationId:ctx.organizationId,
        ownerUserId:ctx.userId,
        actorRole:role,
        surface:'OWNER_COPILOT',
        command,
      });
      const token=createOwnerCopilotPreviewToken({
        organizationId:ctx.organizationId,
        userId:ctx.userId,
        role:role as 'OWNER'|'ADMIN',
        confirmationId:randomUUID(),
        command,
        preview:{before:prepared.preview.before,after:prepared.preview.after},
      });
      return NextResponse.json({
        mode:'PREVIEW',
        importance:plan.importance,
        reason:plan.reason,
        command,
        preview:prepared.preview,
        confirmationToken:token,
        snapshotGeneratedAt:snapshot.generatedAt,
      });
    }

    if(mode==='CONFIRM'){
      if(body.confirmed!==true) return NextResponse.json({error:'Explicit confirmed=true is required'},{status:400});
      const token=safeText(body.confirmationToken,21_000);
      const payload=verifyOwnerCopilotPreviewToken(token,{organizationId:ctx.organizationId,userId:ctx.userId,role});
      if(!availablePanelActions.includes(payload.command.action)) return NextResponse.json({error:'Owner Copilot action is no longer AVAILABLE'},{status:409});
      const executed=await executePanelAction({
        supabase:service,
        organizationId:ctx.organizationId,
        ownerUserId:ctx.userId,
        actorRole:role,
        surface:'OWNER_COPILOT',
        approvalEvidence:{type:'SIGNED_PREVIEW_CONFIRM',confirmationId:payload.confirmationId},
        command:payload.command,
        preview:payload.preview,
      });
      return NextResponse.json({mode:'EXECUTED',result:executed});
    }

    return NextResponse.json({error:'mode must be ASK or CONFIRM'},{status:400});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const status=/Authentication required|membership required/i.test(message)?401:/requires OWNER or ADMIN|permission/i.test(message)?403:/state changed|expired|no longer AVAILABLE|Shadow Mode|Kill Switch|agents are paused|already consumed|confirmation/i.test(message)?409:400;
    return errorResponse(error,status);
  }
}

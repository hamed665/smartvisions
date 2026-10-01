import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0162_field_service.sql','utf8');
const smoke=readFileSync('tests/sql/field-service-smoke.sql','utf8');
const lib=readFileSync('lib/field-service/work-orders.ts','utf8');
const createRoute=readFileSync('app/api/field-service/route.ts','utf8');
const actionRoute=readFileSync('app/api/field-service/[taskId]/route.ts','utf8');
const uploadRoute=readFileSync('app/api/field-service/[taskId]/evidence/upload-url/route.ts','utf8');
const finalizeRoute=readFileSync('app/api/field-service/[taskId]/evidence/finalize/route.ts','utf8');
const downloadRoute=readFileSync('app/api/field-service/[taskId]/evidence/[evidenceId]/route.ts','utf8');
const page=readFileSync('app/field-service/page.tsx','utf8');
const actions=readFileSync('app/field-service/field-service-actions.tsx','utf8');
const tasks=readFileSync('lib/crm/tasks.ts','utf8');
const genericTaskRoute=readFileSync('app/api/crm/tasks/route.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('FIELD-SERVICE contract',()=>{
  it('extends canonical Task, Booking and member authorities instead of duplicating them',()=>{
    expect(migration).toContain("task_type in (");
    expect(migration).toContain("'FIELD_SERVICE'");
    expect(migration).toContain('references public.crm_tasks(organization_id,id)');
    expect(migration).toContain('references public.bookings(organization_id,id)');
    expect(migration).toContain('references public.organization_members(organization_id,user_id)');
    expect(migration).not.toMatch(/create table public\.(field_service_tasks|field_service_bookings|field_service_staff|field_service_scheduler)/i);
  });

  it('keeps Task status and technician canonical while specializing work details',()=>{
    expect(tasks).toContain("| 'FIELD_SERVICE'");
    expect(createRoute).toContain("taskType:'FIELD_SERVICE'");
    expect(createRoute).toContain("personId:null");
    expect(createRoute).toContain("link_crm_customer360_person_context");
    expect(createRoute).toContain("p_entity_type:'TASK'");
    expect(page).toContain("Task owns technician/status");
    expect(createRoute).toContain('scheduledAt');
    expect(actions).toContain('Manual schedule');
    expect(migration).toContain('assignee_user_id');
    expect(migration).toContain('Field Service child state of canonical crm_tasks');
    expect(genericTaskRoute).not.toContain("'FOLLOW_UP','FIELD_SERVICE','OTHER'");
    expect(createRoute).toContain(".eq('task_type','FIELD_SERVICE')");
    expect(createRoute).toContain(".in('id',ids)");
    expect(createRoute).not.toContain('listCrmTasks({supabase,organizationId,includeClosed:true,limit:100})');
    expect(page).toContain("const orderTaskIds=(orders.data??[]).map(row=>String(row.task_id))");
    expect(page).toContain(".in('id',orderTaskIds)");
  });

  it('enforces governed completion evidence and customer sign-off in PostgreSQL',()=>{
    for(const marker of [
      'Required Field Service checklist is incomplete',
      'Field Service completion evidence is required',
      'Field Service customer sign-off is required',
      'Field Service completion summary is required',
      'Completed Field Service work order is terminal',
    ]) expect(migration).toContain(marker);
    expect(smoke).toContain('Incomplete Field Service task was allowed to complete');
    expect(smoke).toContain('Completed Field Service task was reopened');
  });

  it('records materials as evidence without pretending inventory was decremented',()=>{
    expect(migration).toContain("inventory_effect text not null default 'NONE'");
    expect(migration).toContain('until INVENTORY-FULFILLMENT owns stock truth');
    expect(actionRoute).toContain("inventory_effect:'NONE'");
  });

  it('uses private signed evidence storage with bounded file contracts',()=>{
    expect(migration).toContain("'field-service-evidence'");
    expect(migration).toContain('public=false');
    expect(lib).toContain('FIELD_SERVICE_MAX_FILE_BYTES = 15 * 1024 * 1024');
    expect(uploadRoute).toContain('createSignedUploadUrl');
    expect(finalizeRoute).toContain("storage.from(FIELD_SERVICE_BUCKET)");
    expect(downloadRoute).toContain('createSignedUrl');
    expect(downloadRoute).not.toContain('getPublicUrl');
    expect(migration).toContain('field_service_evidence_object_scope_check');
    expect(migration).toContain('SIGNATURE_EVIDENCE sign-off requires same-work-order SIGNATURE evidence');
    expect(actions).toContain('uploadToSignedUrl');
  });

  it('authorizes every evidence URL through canonical Organization and Task scope',()=>{
    expect(uploadRoute).toContain('loadFieldServiceTask');
    expect(uploadRoute).toContain('canManageFieldServiceTask');
    expect(finalizeRoute).toContain('assertFieldServiceObjectPath');
    expect(downloadRoute).toContain('loadFieldServiceTask');
    expect(migration).toContain('alter table public.field_service_evidence enable row level security');
    expect(migration).not.toContain('field_service_evidence_manager_insert');
    expect(migration).toContain('grant select,insert on public.field_service_evidence');
    expect(migration).toContain('to service_role');
    expect(finalizeRoute).toContain("service.from('field_service_evidence')");
    expect(migration).toContain('Field Service structural changes require a manager role');
  });

  it('ships a complete operator surface without a decorative-only page',()=>{
    for(const marker of [
      'Create work order','Checklist','Record material','Upload evidence',
      'Customer sign-off','Complete',
    ]) expect(actions).toContain(marker);
    expect(shell).toContain("['Field Service', '/field-service']");
  });

  it('runs PostgreSQL acceptance after BOOKING-AI in CI',()=>{
    expect(ci).toContain('booking-ai-smoke.sql');
    expect(ci).toContain('field-service-smoke.sql');
    expect(ci.indexOf('booking-ai-smoke.sql')).toBeLessThan(ci.indexOf('field-service-smoke.sql'));
  });
});

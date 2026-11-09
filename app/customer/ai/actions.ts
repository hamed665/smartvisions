'use server';

import { revalidatePath } from 'next/cache';
import { customerStudioScope } from '@/lib/access/customer-studio';
import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import { analyzeStudioKnowledge } from '@/lib/knowledge/studio-analysis';
import { extractKnowledgeFile } from '@/lib/knowledge/ingestion';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type ActionState = {
  status: 'idle' | 'success' | 'error' | 'questions';
  message: string;
  source?: string;
  questions?: string[];
};
const PROFILE_KEY = 'studio-business-profile';
const PDF_LIMIT = 700 * 1024;

export async function stageStudioKnowledge(businessId: string, form: FormData): Promise<ActionState> {
  const scope = await customerStudioScope(businessId);
  const { business, userId } = scope;
  if (!['OWNER', 'ADMIN'].includes(business.organizationRole) || !['OWNER', 'ADMIN'].includes(business.businessRole)) {
    return { status: 'error', message: 'A business manager with organization approval access is required.' };
  }
  const pdf = form.get('pdf');
  const hasPdf = pdf instanceof File && pdf.size > 0;
  const text = String(form.get('text') ?? '').trim();
  if ((hasPdf && text) || (!hasPdf && (text.length < 10 || text.length > 20000))) {
    return { status: 'error', message: 'Enter 10–20,000 characters or upload one PDF.' };
  }
  if (hasPdf && (pdf.size > PDF_LIMIT || !/\.pdf$/i.test(pdf.name))) {
    return { status: 'error', message: 'Choose a PDF under 700 KB.' };
  }

  let extraction;
  try {
    if (hasPdf) extraction = await extractKnowledgeFile(pdf);
  } catch {
    return { status: 'error', message: 'This PDF could not be read. Try a PDF with selectable text or paste its content.' };
  }
  const sourceText = extraction?.text ?? text;
  if (sourceText.length > 20000) return { status: 'error', message: 'Use up to 20,000 characters of relevant business information.' };

  let analysis;
  try {
    analysis = await analyzeStudioKnowledge(business.organizationId, sourceText);
  } catch {
    return { status: 'error', message: 'Analysis could not finish. Your input is still available. Try again when analysis is available.' };
  }
  if (analysis.questions.length) {
    return {
      status: 'questions', message: 'Add the details below and run analysis again.',
      source: sourceText, questions: analysis.questions,
    };
  }

  const service = createSupabaseServiceClient();
  const type = extraction ? 'PDF' : 'TEXT';
  const sourceKey = 'studio-'+business.id+'-'+type.toLowerCase();
  const query = () => service.from('knowledge_sources').select('id,version,status')
    .eq('organization_id', business.organizationId).eq('tenant_business_id', business.id)
    .eq('scope_type', 'BUSINESS').eq('source_key', sourceKey).eq('source_type', type).maybeSingle();
  const existing = await query();
  let source = existing.data;
  if (existing.error) return { status: 'error', message: 'Could not load the business knowledge source.' };
  if (!source) {
    const configured = await service.rpc('configure_knowledge_source_scope_v2', {
      p_organization_id: business.organizationId, p_actor_user_id: userId,
      p_source_key: sourceKey, p_source_type: type, p_title: 'Studio business profile · '+type,
      p_source_locator: null, p_scope_type: 'BUSINESS', p_scope_id: business.id,
      p_sensitivity: 'INTERNAL', p_status: 'ACTIVE', p_refresh_policy: 'MANUAL',
      p_refresh_interval_minutes: null, p_metadata: { surface: 'CUSTOMER_STUDIO' },
      p_expected_version: null, p_request_key: 'studio-source:'+sourceKey,
    });
    if (configured.error) return { status: 'error', message: 'Could not prepare the business source. Refresh and try again.' };
    source = (await query()).data;
  }
  if (!source || source.status !== 'ACTIVE') return { status: 'error', message: 'The business source is not active.' };

  const staged = await service.rpc('stage_knowledge_version_v2', {
    p_organization_id: business.organizationId, p_actor_user_id: userId, p_source_id: source.id,
    p_knowledge_key: PROFILE_KEY, p_payload: { text: analysis.profile },
    p_provenance: {
      surface: 'CUSTOMER_STUDIO', analysis_model: analysis.model, ingestion: extraction?.extraction ?? 'OWNER_TEXT',
      ...(hasPdf ? { fileName: pdf.name.slice(0, 240), fileSize: pdf.size } : {}),
    },
    p_expected_source_version: source.version, p_etag: null, p_last_modified: null,
    p_request_key: 'studio-stage:'+crypto.randomUUID(),
  });
  if (staged.error) return { status: 'error', message: 'Draft could not be staged. Refresh and try again.' };
  revalidatePath('/customer/ai');
  return { status: 'success', message: 'Source processed. Review the resulting draft before publishing it.' };
}

export async function publishStudioKnowledge(businessId: string, versionId: string): Promise<ActionState> {
  const { business, userId, supabase } = await customerStudioScope(businessId);
  if (!normalizeCustomerBusinessId(versionId) || !['OWNER', 'ADMIN'].includes(business.organizationRole)
    || !['OWNER', 'ADMIN'].includes(business.businessRole)) return { status: 'error', message: 'You cannot publish this draft.' };
  const { data, error } = await supabase.from('knowledge_versions').select('id')
    .eq('organization_id', business.organizationId).eq('tenant_business_id', business.id)
    .eq('scope_type', 'BUSINESS').eq('id', versionId).eq('knowledge_key', PROFILE_KEY)
    .eq('approval_status', 'PENDING_REVIEW').maybeSingle();
  if (error || !data) return { status: 'error', message: 'This draft is no longer available for publishing.' };
  const published = await createSupabaseServiceClient().rpc('approve_knowledge_version_v2', {
    p_organization_id: business.organizationId, p_actor_user_id: userId,
    p_version_id: versionId, p_request_key: 'studio-publish:'+versionId,
  });
  if (published.error) return { status: 'error', message: 'Could not publish this draft. Refresh to check its status.' };
  revalidatePath('/customer/ai');
  return { status: 'success', message: 'Knowledge version published.' };
}

export async function reviseStudioKnowledge(businessId: string, versionId: string, form: FormData): Promise<ActionState> {
  const { business, userId, supabase } = await customerStudioScope(businessId);
  if (!normalizeCustomerBusinessId(versionId) || !['OWNER', 'ADMIN'].includes(business.organizationRole)
    || !['OWNER', 'ADMIN'].includes(business.businessRole)) return { status: 'error', message: 'You cannot revise this draft.' };
  const text = String(form.get('revision') ?? '').trim();
  if (text.length < 10 || text.length > 9000) return { status: 'error', message: 'Enter 10–9,000 characters for the profile.' };

  const draft = await supabase.from('knowledge_versions').select('source_id')
    .eq('organization_id', business.organizationId).eq('tenant_business_id', business.id)
    .eq('scope_type', 'BUSINESS').eq('id', versionId).eq('knowledge_key', PROFILE_KEY)
    .eq('approval_status', 'PENDING_REVIEW').maybeSingle();
  if (draft.error || !draft.data?.source_id) return { status: 'error', message: 'This draft is no longer available to revise.' };
  const service = createSupabaseServiceClient();
  const source = await service.from('knowledge_sources').select('version')
    .eq('id', draft.data.source_id).eq('organization_id', business.organizationId).eq('tenant_business_id', business.id)
    .eq('scope_type', 'BUSINESS').eq('status', 'ACTIVE').maybeSingle();
  if (source.error || !source.data) return { status: 'error', message: 'The source is no longer active.' };

  const staged = await service.rpc('stage_knowledge_version_v2', {
    p_organization_id: business.organizationId, p_actor_user_id: userId, p_source_id: draft.data.source_id,
    p_knowledge_key: PROFILE_KEY, p_payload: { text },
    p_provenance: { surface: 'CUSTOMER_STUDIO', ingestion: 'OWNER_REVISION', previous_version_id: versionId },
    p_expected_source_version: source.data.version, p_etag: null, p_last_modified: null,
    p_request_key: 'studio-revision:'+crypto.randomUUID(),
  });
  if (staged.error) return { status: 'error', message: 'The source changed or the revision could not be saved. Refresh to review its status.' };
  revalidatePath('/customer/ai');
  return { status: 'success', message: 'Revision saved. Review the resulting version before publishing.' };
}

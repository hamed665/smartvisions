'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { evaluatePromptCandidate } from '@/lib/agents/prompt-control';

const required = (form: FormData, key: string) => {
  const value = String(form.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};

type PublishedVersion = { id: string; version: number };

function firstPublishedVersion(data: unknown): PublishedVersion {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('Version publish returned no result');
  const id = String((row as Record<string, unknown>).id ?? '').trim();
  const version = Number((row as Record<string, unknown>).version ?? 0);
  if (!id || !Number.isInteger(version) || version < 1) throw new Error('Version publish returned an invalid result');
  return { id, version };
}

export async function createKnowledge(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || !['OWNER','ADMIN'].includes(String(ctx.role))) throw new Error('Owner/Admin permission required');
  const knowledgeKey = required(form, 'knowledge_key');
  const content = required(form, 'content');
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc('publish_manual_knowledge_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_knowledge_key: knowledgeKey,
    p_payload: { text: content },
    p_request_key: ('knowledge-manual:'+crypto.randomUUID()).slice(0,200),
  });
  if (error) throw new Error(`Knowledge publish failed: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;
  if(!row||!String((row as Record<string,unknown>).version_id??''))throw new Error('Knowledge publish returned no result');
  revalidatePath('/knowledge');
}

export async function createPromptVersion(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  const agentName = required(form, 'agent_name');
  const promptText = required(form, 'prompt_text');
  const evaluation = evaluatePromptCandidate(promptText);
  if (evaluation.verdict === 'BLOCK') {
    throw new Error(evaluation.checks.filter((check) => check.level === 'BLOCK').map((check) => check.detail).join(' '));
  }

  const { data, error } = await ctx.supabase.rpc('stage_prompt_version', {
    p_organization_id: ctx.organizationId,
    p_agent_name: agentName,
    p_prompt_text: promptText,
  });
  if (error) throw new Error(`Prompt staging failed: ${error.message}`);
  firstPublishedVersion(data);
  revalidatePath('/agents');
}

export async function configurePromptRollout(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  const agentName = required(form, 'agent_name');
  const mode = required(form, 'mode').toUpperCase();
  const candidateVersion = Number(form.get('candidate_version') ?? 0);
  const canaryPct = Number(form.get('canary_pct') ?? 0);
  if (!['OFF','SHADOW','CANARY'].includes(mode)) throw new Error('Invalid rollout mode');
  if (mode !== 'OFF' && (!Number.isInteger(candidateVersion) || candidateVersion < 1)) {
    throw new Error('Candidate version is required');
  }

  let evaluation = { verdict: 'PASS', checks: [] as Array<{ key: string; level: string; detail: string }> };
  if (mode !== 'OFF') {
    const { data: candidate, error: readError } = await ctx.supabase
      .from('prompt_versions')
      .select('prompt_text')
      .eq('organization_id', ctx.organizationId)
      .eq('agent_name', agentName)
      .eq('version', candidateVersion)
      .eq('active', false)
      .maybeSingle();
    if (readError || !candidate) throw new Error(readError?.message ?? 'Prompt candidate not found');
    evaluation = evaluatePromptCandidate(String(candidate.prompt_text ?? ''));
    if (evaluation.verdict === 'BLOCK') {
      throw new Error(evaluation.checks.filter((check) => check.level === 'BLOCK').map((check) => check.detail).join(' '));
    }
  }

  const { error } = await ctx.supabase.rpc('configure_prompt_rollout', {
    p_organization_id: ctx.organizationId,
    p_agent_name: agentName,
    p_mode: mode,
    p_candidate_version: mode === 'OFF' ? null : candidateVersion,
    p_canary_pct: mode === 'CANARY' ? canaryPct : 0,
    p_evaluation: evaluation,
  });
  if (error) throw new Error(`Prompt rollout update failed: ${error.message}`);
  revalidatePath('/agents');
}

export async function setActivePromptVersion(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  const agentName = required(form, 'agent_name');
  const rawVersion = String(form.get('version') ?? '').trim();
  const version = rawVersion ? Number(rawVersion) : null;
  if (version !== null && (!Number.isInteger(version) || version < 1)) throw new Error('Invalid prompt version');

  const { error } = await ctx.supabase.rpc('set_active_prompt_version', {
    p_organization_id: ctx.organizationId,
    p_agent_name: agentName,
    p_version: version,
  });
  if (error) throw new Error(`Prompt activation failed: ${error.message}`);
  revalidatePath('/agents');
}

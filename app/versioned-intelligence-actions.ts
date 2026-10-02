'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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
  const agentName = required(form, 'agent_name');
  const promptText = required(form, 'prompt_text');

  const { data, error } = await ctx.supabase.rpc('publish_prompt_version', {
    p_organization_id: ctx.organizationId,
    p_agent_name: agentName,
    p_prompt_text: promptText,
  });
  if (error) throw new Error(`Prompt publish failed: ${error.message}`);
  firstPublishedVersion(data);
  revalidatePath('/agents');
}

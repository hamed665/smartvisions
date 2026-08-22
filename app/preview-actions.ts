'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { transitionPreview } from '@/lib/preview/persistence';

export async function approvePreview(formData: FormData) {
  const previewId = String(formData.get('preview_id') ?? '').trim();
  if (!previewId) throw new Error('preview_id is required');
  const { organizationId, userId } = await getCurrentOrganization(true);
  await transitionPreview({ organizationId, previewId, action: 'APPROVE', actorId: userId, metadata: { source: 'preview_studio' } });
  revalidatePath('/preview-studio');
}

export async function markPreviewSent(formData: FormData) {
  const previewId = String(formData.get('preview_id') ?? '').trim();
  if (!previewId) throw new Error('preview_id is required');
  const { organizationId, userId } = await getCurrentOrganization(true);
  await transitionPreview({ organizationId, previewId, action: 'SEND', actorId: userId, metadata: { source: 'preview_studio', manual_share: true } });
  revalidatePath('/preview-studio');
}

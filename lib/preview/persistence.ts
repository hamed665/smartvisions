import { createClient } from '@supabase/supabase-js';
import { canPubliclyViewPreview, nextPreviewStatus, type PreviewLifecycleAction, type PreviewLifecycleStatus } from './lifecycle';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for preview lifecycle');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hasExpired(expiresAt: string | Date) {
  const value = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isFinite(value.getTime()) || value.getTime() <= Date.now();
}

const eventForAction: Partial<Record<PreviewLifecycleAction, string>> = {
  APPROVE: 'APPROVED',
  SEND: 'SENT',
  VIEW: 'VIEWED',
};

export async function transitionPreview(input: {
  organizationId: string;
  previewId: string;
  action: Exclude<PreviewLifecycleAction, 'VIEW'>;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = serviceClient();
  const { data: current, error: readError } = await supabase
    .from('previews')
    .select('id,status,public_token,expires_at')
    .eq('organization_id', input.organizationId)
    .eq('id', input.previewId)
    .maybeSingle();
  if (readError || !current) throw new Error(readError?.message ?? 'Preview not found');

  const currentStatus = current.status as PreviewLifecycleStatus;
  if ((input.action === 'APPROVE' || input.action === 'SEND') && hasExpired(current.expires_at)) {
    const { data: expired, error: expireError } = await supabase
      .from('previews')
      .update({ status: 'EXPIRED' })
      .eq('organization_id', input.organizationId)
      .eq('id', input.previewId)
      .eq('status', currentStatus)
      .select('id')
      .maybeSingle();
    if (expireError) throw new Error(`Preview expiry reconciliation failed: ${expireError.message}`);
    if (!expired) throw new Error('Preview expiry reconciliation lost a concurrency race; reload before retrying');
    await supabase.from('preview_events').insert({
      organization_id: input.organizationId,
      preview_id: input.previewId,
      event_type: 'EXPIRED',
      metadata: { source: 'preview_lifecycle', reason: 'TTL_ELAPSED' },
    });
    throw new Error('Preview expired; generate a new version before approval or sharing');
  }

  const nextStatus = nextPreviewStatus(currentStatus, input.action);
  const patch: Record<string, unknown> = { status: nextStatus };
  if (input.action === 'APPROVE') {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = input.actorId ?? null;
  }
  if (input.action === 'SEND') patch.sent_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('previews')
    .update(patch)
    .eq('organization_id', input.organizationId)
    .eq('id', input.previewId)
    .eq('status', currentStatus)
    .select('id,status,public_token,expires_at')
    .maybeSingle();
  if (updateError) throw new Error(`Preview transition failed: ${updateError.message}`);
  if (!updated) throw new Error('Preview transition lost a concurrency race; reload before retrying');

  let eventPersisted = true;
  const eventType = eventForAction[input.action];
  if (eventType) {
    const { error: eventError } = await supabase.from('preview_events').insert({
      organization_id: input.organizationId,
      preview_id: input.previewId,
      event_type: eventType,
      metadata: input.metadata ?? {},
    });
    eventPersisted = !eventError;
  }

  return { ...updated, eventPersisted, reconciliationRequired: !eventPersisted };
}

export async function loadPublicPreview(publicToken: string) {
  const supabase = serviceClient();
  const { data: preview, error } = await supabase
    .from('previews')
    .select('id,organization_id,status,payload,quality_score,public_token,expires_at,created_at,sent_at')
    .eq('public_token', publicToken)
    .maybeSingle();
  if (error || !preview) return null;
  if (!canPubliclyViewPreview({ status: preview.status, expiresAt: preview.expires_at })) return null;

  if (preview.status === 'SENT') {
    const { data: viewed, error: updateError } = await supabase
      .from('previews')
      .update({ status: 'VIEWED' })
      .eq('id', preview.id)
      .eq('status', 'SENT')
      .select('id')
      .maybeSingle();
    if (updateError) throw new Error(`Preview view transition failed: ${updateError.message}`);
    if (viewed) {
      await supabase.from('preview_events').insert({
        organization_id: preview.organization_id,
        preview_id: preview.id,
        event_type: 'VIEWED',
        metadata: { source: 'public_preview' },
      });
      return { ...preview, status: 'VIEWED' };
    }
  }

  return preview;
}

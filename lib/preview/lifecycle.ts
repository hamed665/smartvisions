export type PreviewLifecycleStatus = 'GENERATED' | 'QUALITY_FAILED' | 'APPROVED' | 'SENT' | 'VIEWED' | 'EXPIRED' | 'ARCHIVED';

export type PreviewLifecycleAction = 'APPROVE' | 'SEND' | 'VIEW' | 'EXPIRE' | 'ARCHIVE';

const transitions: Record<PreviewLifecycleAction, PreviewLifecycleStatus[]> = {
  APPROVE: ['GENERATED'],
  SEND: ['APPROVED'],
  VIEW: ['SENT', 'VIEWED'],
  EXPIRE: ['GENERATED', 'QUALITY_FAILED', 'APPROVED', 'SENT', 'VIEWED'],
  ARCHIVE: ['GENERATED', 'QUALITY_FAILED', 'APPROVED', 'SENT', 'VIEWED', 'EXPIRED'],
};

export function nextPreviewStatus(current: PreviewLifecycleStatus, action: PreviewLifecycleAction): PreviewLifecycleStatus {
  if (!transitions[action].includes(current)) {
    throw new Error(`Invalid preview transition: ${current} -> ${action}`);
  }
  if (action === 'APPROVE') return 'APPROVED';
  if (action === 'SEND') return 'SENT';
  if (action === 'VIEW') return 'VIEWED';
  if (action === 'EXPIRE') return 'EXPIRED';
  return 'ARCHIVED';
}

export function canPubliclyViewPreview(input: { status: string; expiresAt: string | Date; now?: Date }) {
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  const activeStatus = input.status === 'SENT' || input.status === 'VIEWED';
  return activeStatus && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function previewPublicPath(publicToken: string) {
  const token = publicToken.trim();
  if (!token) throw new Error('publicToken is required');
  return `/p/${encodeURIComponent(token)}`;
}

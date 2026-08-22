import { describe, expect, it } from 'vitest';
import { canPubliclyViewPreview, nextPreviewStatus, previewPublicPath } from '@/lib/preview/lifecycle';

describe('preview lifecycle', () => {
  it('requires approval before sharing', () => {
    expect(nextPreviewStatus('GENERATED', 'APPROVE')).toBe('APPROVED');
    expect(nextPreviewStatus('APPROVED', 'SEND')).toBe('SENT');
    expect(() => nextPreviewStatus('GENERATED', 'SEND')).toThrow('Invalid preview transition');
  });

  it('allows a sent preview to become viewed and keeps viewed refreshes idempotent', () => {
    expect(nextPreviewStatus('SENT', 'VIEW')).toBe('VIEWED');
    expect(nextPreviewStatus('VIEWED', 'VIEW')).toBe('VIEWED');
  });

  it('blocks public access before sharing and after expiry', () => {
    const now = new Date('2026-08-22T12:00:00Z');
    expect(canPubliclyViewPreview({ status: 'APPROVED', expiresAt: '2026-08-23T12:00:00Z', now })).toBe(false);
    expect(canPubliclyViewPreview({ status: 'SENT', expiresAt: '2026-08-23T12:00:00Z', now })).toBe(true);
    expect(canPubliclyViewPreview({ status: 'VIEWED', expiresAt: '2026-08-23T12:00:00Z', now })).toBe(true);
    expect(canPubliclyViewPreview({ status: 'SENT', expiresAt: '2026-08-21T12:00:00Z', now })).toBe(false);
  });

  it('builds a stable tokenized public path', () => {
    expect(previewPublicPath('abc-123')).toBe('/p/abc-123');
    expect(() => previewPublicPath('   ')).toThrow('publicToken is required');
  });
});

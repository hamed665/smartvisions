import { describe, expect, it } from 'vitest';
import { isPublicShellPath } from '@/app/app-shell';

describe('public preview shell isolation', () => {
  it('keeps tokenized public previews outside the operator Control Center shell', () => {
    expect(isPublicShellPath('/p/dcf27c1b-cffe-4e0d-affe-df234ce0bb6d')).toBe(true);
  });

  it('preserves existing public auth pages', () => {
    expect(isPublicShellPath('/login')).toBe(true);
    expect(isPublicShellPath('/auth/callback')).toBe(true);
  });

  it('keeps operator routes inside the Control Center shell', () => {
    expect(isPublicShellPath('/preview-studio')).toBe(false);
    expect(isPublicShellPath('/leads')).toBe(false);
    expect(isPublicShellPath('/settings')).toBe(false);
  });
});

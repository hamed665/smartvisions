import { describe, expect, it } from 'vitest';
import { assertInstagramActivationAllowed } from '@/lib/instagram/activation';

describe('Instagram activation gate', () => {
  it('fails closed with evidence blockers', () => {
    expect(() => assertInstagramActivationAllowed({
      ready: false,
      blockers: ['ACTIVE_BINDING_MISSING','LIVE_ACCEPTANCE_EVIDENCE_MISSING'],
      bindingId: null,
      destinationId: null,
      inboxMappingId: null,
    })).toThrow('INSTAGRAM_ACTIVATION_BLOCKED:ACTIVE_BINDING_MISSING,LIVE_ACCEPTANCE_EVIDENCE_MISSING');
  });

  it('allows only an explicitly ready evidence state', () => {
    expect(() => assertInstagramActivationAllowed({
      ready: true,
      blockers: [],
      bindingId: 'binding-1',
      destinationId: 'destination-1',
      inboxMappingId: 'inbox-1',
    })).not.toThrow();
  });
});

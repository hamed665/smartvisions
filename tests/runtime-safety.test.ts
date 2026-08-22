import { describe, expect, it } from 'vitest';
import { assertRuntimeControlsAllow } from '@/lib/reliability/runtime-safety';

const safe = {
  global_kill_switch: false,
  agents_paused: false,
  email_paused: false,
  whatsapp_ai_paused: false,
  shadow_mode: true,
};

describe('runtime safety controls', () => {
  it('blocks every controlled operation under the global kill switch', () => {
    for (const operation of ['AI','DISCOVERY','AUDIT'] as const) {
      expect(() => assertRuntimeControlsAllow({ ...safe, global_kill_switch: true }, operation)).toThrow('global kill switch');
    }
  });

  it('blocks paid AI while agents are paused without blocking discovery/audit policy checks', () => {
    expect(() => assertRuntimeControlsAllow({ ...safe, agents_paused: true }, 'AI')).toThrow('agents are paused');
    expect(() => assertRuntimeControlsAllow({ ...safe, agents_paused: true }, 'DISCOVERY')).not.toThrow();
    expect(() => assertRuntimeControlsAllow({ ...safe, agents_paused: true }, 'AUDIT')).not.toThrow();
  });
});

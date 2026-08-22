import { describe, expect, it } from 'vitest';
import { assertChannelAllowed } from '../lib/reliability/runtime-controls';

describe('runtime controls', () => {
  it('fails closed when controls are unavailable', () => {
    expect(() => assertChannelAllowed(null, 'EMAIL')).toThrow(/unavailable/i);
  });

  it('blocks shadow mode and channel pauses', () => {
    const base = {
      global_kill_switch: false,
      email_paused: false,
      whatsapp_ai_paused: false,
      agents_paused: false,
      shadow_mode: false,
      monthly_budget_usd: 150,
    };
    expect(() => assertChannelAllowed({ ...base, shadow_mode: true }, 'EMAIL')).toThrow(/shadow mode/i);
    expect(() => assertChannelAllowed({ ...base, email_paused: true }, 'EMAIL')).toThrow(/paused/i);
    expect(() => assertChannelAllowed({ ...base, global_kill_switch: true }, 'WHATSAPP')).toThrow(/kill switch/i);
  });
});

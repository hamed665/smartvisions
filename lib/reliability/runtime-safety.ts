import { createClient } from '@supabase/supabase-js';

export type RuntimeOperation = 'AI' | 'DISCOVERY' | 'AUDIT';
export type RuntimeSafetyControls = {
  global_kill_switch: boolean;
  agents_paused: boolean;
  email_paused: boolean;
  whatsapp_ai_paused: boolean;
  shadow_mode: boolean;
};

export function assertRuntimeControlsAllow(controls: RuntimeSafetyControls, operation: RuntimeOperation) {
  if (controls.global_kill_switch) throw new Error('Operation blocked by global kill switch');
  if (operation === 'AI' && controls.agents_paused) throw new Error('AI operation blocked because agents are paused');
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for runtime safety checks');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getRuntimeSafetyControls(organizationId: string): Promise<RuntimeSafetyControls> {
  if (!organizationId) throw new Error('organizationId is required for runtime safety checks');
  const { data, error } = await serviceClient().from('system_controls')
    .select('global_kill_switch,agents_paused,email_paused,whatsapp_ai_paused,shadow_mode')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`Runtime safety controls unavailable: ${error.message}`);
  if (!data) throw new Error('Runtime safety controls are missing; operation blocked');
  return {
    global_kill_switch: Boolean(data.global_kill_switch),
    agents_paused: Boolean(data.agents_paused),
    email_paused: Boolean(data.email_paused),
    whatsapp_ai_paused: Boolean(data.whatsapp_ai_paused),
    shadow_mode: Boolean(data.shadow_mode),
  };
}

export async function assertRuntimeOperationAllowed(organizationId: string, operation: RuntimeOperation) {
  const controls = await getRuntimeSafetyControls(organizationId);
  assertRuntimeControlsAllow(controls, operation);
  return controls;
}

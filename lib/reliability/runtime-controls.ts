import { createClient } from '@supabase/supabase-js';

type RuntimeControls = {
  global_kill_switch: boolean;
  email_paused: boolean;
  whatsapp_ai_paused: boolean;
  agents_paused: boolean;
  shadow_mode: boolean;
  monthly_budget_usd: number | null;
};

export async function getRuntimeControls(organizationId?: string): Promise<RuntimeControls | null> {
  if (!organizationId) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from('system_controls')
    .select('global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode,monthly_budget_usd')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`runtime controls unavailable: ${error.message}`);
  return data as RuntimeControls | null;
}

export function assertChannelAllowed(controls: RuntimeControls | null, channel: 'EMAIL' | 'WHATSAPP' | 'AGENT') {
  if (!controls) return;
  if (controls.global_kill_switch) throw new Error('Global kill switch is enabled');
  if (channel === 'EMAIL' && controls.email_paused) throw new Error('Email sending is paused');
  if (channel === 'WHATSAPP' && controls.whatsapp_ai_paused) throw new Error('WhatsApp AI sending is paused');
  if (channel === 'AGENT' && controls.agents_paused) throw new Error('AI agents are paused');
  if (controls.shadow_mode) throw new Error('Shadow mode requires human review before send');
}

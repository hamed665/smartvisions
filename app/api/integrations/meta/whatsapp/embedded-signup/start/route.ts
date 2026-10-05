import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { normalizeMetaWhatsAppConnectionMode } from '@/lib/whatsapp/meta-onboarding';

export const runtime = 'nodejs';

type StartBody = {
  bindingId?: string;
  expectedVersion?: number;
  connectionMode?: string;
};

function clean(value: unknown, max = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as StartBody;
    const bindingId = clean(body.bindingId);
    const expectedVersion = Number(body.expectedVersion);
    const connectionMode = normalizeMetaWhatsAppConnectionMode(body.connectionMode);

    if (!bindingId || !connectionMode || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: 'Invalid WhatsApp setup request' }, { status: 400 });
    }

    if (connectionMode === 'BUSINESS_APP_COEXISTENCE') {
      return NextResponse.json({
        error: 'Same-number WhatsApp Business App Coexistence is blocked until the official non-destructive activation path is verified. Smart Visions will not fall back to account deletion or destructive migration.',
        blockedExternal: true,
      }, { status: 409 });
    }

    const { data: binding, error: bindingError } = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,organization_id,tenant_business_id,channel,status,version,provider,provider_destination_id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', bindingId)
      .maybeSingle();

    if (bindingError || !binding || binding.channel !== 'WHATSAPP' || binding.status !== 'ACTIVE' || binding.version !== expectedVersion) {
      return NextResponse.json({ error: 'WhatsApp tenant binding is not eligible' }, { status: 409 });
    }

    if (connectionMode === 'EXISTING_API_RECONNECT' && (!binding.provider_destination_id || binding.provider !== 'META')) {
      return NextResponse.json({ error: 'This binding has no existing Meta API destination to reconnect' }, { status: 409 });
    }

    const service = createSupabaseServiceClient();
    const requestKey = `meta-whatsapp-setup-start:${bindingId}:${expectedVersion}:${crypto.randomUUID()}`;
    const purpose = connectionMode === 'EXISTING_API_RECONNECT' ? 'RECONNECT' : 'CONNECT';
    const { data, error } = await service.rpc('start_meta_whatsapp_setup_attempt', {
      p_organization_id: ctx.organizationId,
      p_binding_id: bindingId,
      p_expected_binding_version: expectedVersion,
      p_connection_mode: connectionMode,
      p_purpose: purpose,
      p_actor_user_id: ctx.userId,
      p_request_key: requestKey,
    });

    if (error) return NextResponse.json({ error: 'Unable to start WhatsApp setup safely' }, { status: 409 });

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || row.communication_channel_binding_id !== bindingId) {
      return NextResponse.json({ error: 'WhatsApp setup attempt response is invalid' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      attemptId: row.id,
      bindingId,
      bindingVersion: row.binding_version,
      connectionMode: row.connection_mode,
      expiresAt: row.expires_at,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to start WhatsApp setup' }, { status: 500 });
  }
}

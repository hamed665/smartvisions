import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  WHATSAPP_REMOTE_SETUP_COOKIE,
} from '@/lib/whatsapp/remote-setup';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const sessionSecret = normalizeWhatsAppRemoteSetupSecret(
      request.cookies.get(WHATSAPP_REMOTE_SETUP_COOKIE)?.value,
    );
    if (!sessionSecret) {
      return NextResponse.json({ error: 'No active WhatsApp setup session' }, { status: 401 });
    }

    const service = createSupabaseServiceClient();
    const sessionHash = await hashWhatsAppRemoteSetupSecret(sessionSecret);
    const { data, error } = await service.rpc('get_meta_whatsapp_remote_setup_context', {
      p_session_token_hash: sessionHash,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.attempt_id) {
      return NextResponse.json({ error: 'This WhatsApp setup session is expired or revoked' }, { status: 410 });
    }

    const [{ data: business }, { data: binding }, branchResult] = await Promise.all([
      service.from('tenant_businesses')
        .select('id,name,status')
        .eq('organization_id', row.organization_id)
        .eq('id', row.tenant_business_id)
        .maybeSingle(),
      service.from('communication_channel_bindings')
        .select('id,version,provider_destination_label')
        .eq('organization_id', row.organization_id)
        .eq('id', row.binding_id)
        .maybeSingle(),
      row.branch_id
        ? service.from('branches')
          .select('id,name,status')
          .eq('organization_id', row.organization_id)
          .eq('id', row.branch_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const branch = branchResult.data;

    if (!business || !binding) {
      return NextResponse.json({ error: 'This WhatsApp setup scope is no longer available' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      attemptId: row.attempt_id,
      attemptVersion: row.attempt_version,
      attemptStatus: row.attempt_status,
      bindingId: row.binding_id,
      bindingVersion: row.binding_version,
      currentBindingVersion: row.current_binding_version,
      connectionMode: row.connection_mode,
      purpose: row.purpose,
      businessName: business.name,
      branchName: branch?.name ?? null,
      destinationLabel: row.provider_destination_label ?? binding.provider_destination_label ?? null,
      providerAccountId: row.provider_account_id ?? null,
      providerDestinationId: row.provider_destination_id ?? null,
      sessionExpiresAt: row.session_expires_at,
      capability: 'WHATSAPP_SETUP',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to read WhatsApp setup session' }, { status: 500 });
  }
}

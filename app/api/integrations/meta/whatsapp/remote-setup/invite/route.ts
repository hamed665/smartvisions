import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { normalizeMetaWhatsAppConnectionMode } from '@/lib/whatsapp/meta-onboarding';
import {
  createWhatsAppRemoteSetupSecret,
  hashWhatsAppRemoteSetupSecret,
} from '@/lib/whatsapp/remote-setup';

export const runtime = 'nodejs';

type InviteBody = {
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
    const body = await request.json() as InviteBody;
    const bindingId = clean(body.bindingId);
    const expectedVersion = Number(body.expectedVersion);
    const connectionMode = normalizeMetaWhatsAppConnectionMode(body.connectionMode);

    if (!bindingId || !connectionMode || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: 'Invalid WhatsApp remote setup request' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const purpose = connectionMode === 'EXISTING_API_RECONNECT' ? 'RECONNECT' : 'CONNECT';
    const { data: started, error: startError } = await service.rpc('start_meta_whatsapp_setup_attempt', {
      p_organization_id: ctx.organizationId,
      p_binding_id: bindingId,
      p_expected_binding_version: expectedVersion,
      p_connection_mode: connectionMode,
      p_purpose: purpose,
      p_actor_user_id: ctx.userId,
      p_request_key: `meta-whatsapp-remote-start:${bindingId}:${expectedVersion}:${crypto.randomUUID()}`,
    });
    const attempt = Array.isArray(started) ? started[0] : started;

    if (startError || !attempt?.id || attempt.communication_channel_binding_id !== bindingId) {
      return NextResponse.json({ error: 'Unable to create a bounded WhatsApp setup attempt' }, { status: 409 });
    }

    const inviteSecret = createWhatsAppRemoteSetupSecret();
    const inviteHash = await hashWhatsAppRemoteSetupSecret(inviteSecret);
    const { data: issued, error: issueError } = await service.rpc('issue_meta_whatsapp_remote_setup_invite', {
      p_organization_id: ctx.organizationId,
      p_attempt_id: attempt.id,
      p_binding_id: bindingId,
      p_expected_attempt_version: attempt.version,
      p_invitation_token_hash: inviteHash,
      p_actor_user_id: ctx.userId,
      p_request_key: `meta-whatsapp-remote-invite:${attempt.id}:${crypto.randomUUID()}`,
    });
    const row = Array.isArray(issued) ? issued[0] : issued;

    if (issueError || !row?.remote_setup_invitation_expires_at) {
      return NextResponse.json({ error: 'Unable to issue the WhatsApp setup invitation safely' }, { status: 409 });
    }

    const setupPath = `/setup/whatsapp#${inviteSecret}`;

    return NextResponse.json({
      ok: true,
      attemptId: row.id,
      attemptVersion: row.version,
      bindingId,
      bindingVersion: row.binding_version,
      connectionMode: row.connection_mode,
      purpose: row.purpose,
      expiresAt: row.remote_setup_invitation_expires_at,
      setupPath,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to create WhatsApp remote setup link' }, { status: 500 });
  }
}

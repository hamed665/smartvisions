import { NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  createWhatsAppRemoteSetupSecret,
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  whatsappRemoteSetupCookieOptions,
  WHATSAPP_REMOTE_SETUP_COOKIE,
} from '@/lib/whatsapp/remote-setup';

export const runtime = 'nodejs';

type RedeemBody = { token?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json() as RedeemBody;
    const inviteSecret = normalizeWhatsAppRemoteSetupSecret(body.token);
    if (!inviteSecret) {
      return NextResponse.json({ error: 'This WhatsApp setup link is invalid' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const inviteHash = await hashWhatsAppRemoteSetupSecret(inviteSecret);
    const sessionSecret = createWhatsAppRemoteSetupSecret();
    const sessionHash = await hashWhatsAppRemoteSetupSecret(sessionSecret);

    const { data, error } = await service.rpc('redeem_meta_whatsapp_remote_setup_invite', {
      p_invitation_token_hash: inviteHash,
      p_session_token_hash: sessionHash,
      p_request_key: `meta-whatsapp-remote-redeem:${crypto.randomUUID()}`,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.remote_setup_session_expires_at) {
      return NextResponse.json({
        error: 'This setup link has expired, was already used, or was revoked. Ask the business owner for a new link.',
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    const response = NextResponse.json({
      ok: true,
      expiresAt: row.remote_setup_session_expires_at,
    }, { headers: { 'Cache-Control': 'no-store' } });

    response.cookies.set(
      WHATSAPP_REMOTE_SETUP_COOKIE,
      sessionSecret,
      whatsappRemoteSetupCookieOptions(row.remote_setup_session_expires_at),
    );
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to open this WhatsApp setup link safely' }, { status: 500 });
  }
}

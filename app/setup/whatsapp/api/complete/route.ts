import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  exchangeMetaAuthorizationCode,
  metaGraphVersion,
  safeMetaWhatsAppCompletionError,
  verifyMetaWhatsAppSelectedAssets,
} from '@/lib/whatsapp/meta-onboarding';
import {
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  WHATSAPP_REMOTE_SETUP_COOKIE,
} from '@/lib/whatsapp/remote-setup';

export const runtime = 'nodejs';

type CompleteBody = {
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
};

function clean(value: unknown, max = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

export async function POST(request: NextRequest) {
  try {
    const sessionSecret = normalizeWhatsAppRemoteSetupSecret(
      request.cookies.get(WHATSAPP_REMOTE_SETUP_COOKIE)?.value,
    );
    if (!sessionSecret) {
      return NextResponse.json({ error: 'No active WhatsApp setup session' }, { status: 401 });
    }

    const service = createSupabaseServiceClient();
    const sessionHash = await hashWhatsAppRemoteSetupSecret(sessionSecret);
    const { data: contextData, error: contextError } = await service.rpc(
      'get_meta_whatsapp_remote_setup_context',
      { p_session_token_hash: sessionHash },
    );
    const context = Array.isArray(contextData) ? contextData[0] : contextData;

    if (contextError || !context?.attempt_id) {
      return NextResponse.json({ error: 'This WhatsApp setup session is expired or revoked' }, { status: 410 });
    }

    if (context.attempt_status === 'COMPLETED') {
      return NextResponse.json({
        ok: true,
        completed: true,
        replayed: true,
        displayPhoneNumber: context.provider_destination_label ?? null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (context.attempt_status !== 'AUTHORIZED') {
      return NextResponse.json({ error: 'This WhatsApp setup session is not ready for Meta authorization' }, { status: 409 });
    }

    if (context.connection_mode === 'BUSINESS_APP_COEXISTENCE') {
      return NextResponse.json({
        error: 'Same-number WhatsApp Business App Coexistence remains fail-closed until the official provider path is verified. Your existing WhatsApp stays untouched.',
      }, { status: 409 });
    }

    const body = await request.json() as CompleteBody;
    const code = clean(body.code, 4096);
    const wabaId = clean(body.wabaId);
    const phoneNumberId = clean(body.phoneNumberId);
    if (!code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: 'Meta authorization did not return the required WhatsApp selection' }, { status: 400 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Smart Visions Meta provider configuration is not ready' }, { status: 503 });
    }

    const accessToken = await exchangeMetaAuthorizationCode({ code, appId, appSecret });
    const assets = await verifyMetaWhatsAppSelectedAssets({
      graphVersion: metaGraphVersion(),
      accessToken,
      wabaId,
      phoneNumberId,
    });

    const { data: configured, error: configureError } = await service.rpc(
      'complete_meta_whatsapp_remote_setup_attempt',
      {
        p_attempt_id: context.attempt_id,
        p_binding_id: context.binding_id,
        p_expected_binding_version: context.binding_version,
        p_session_token_hash: sessionHash,
        p_waba_id: wabaId,
        p_phone_number_id: phoneNumberId,
        p_display_phone_number: assets.displayPhoneNumber,
        p_access_token: accessToken,
        p_request_key: `meta-whatsapp-remote-complete:${context.attempt_id}`,
      },
    );

    if (configureError) {
      return NextResponse.json({ error: 'WhatsApp credential could not be committed safely' }, { status: 409 });
    }

    const row = Array.isArray(configured) ? configured[0] : configured;
    return NextResponse.json({
      ok: true,
      completed: true,
      replayed: false,
      version: row?.version ?? context.binding_version + 1,
      displayPhoneNumber: assets.displayPhoneNumber,
      verifiedName: assets.verifiedName,
      businessName: assets.wabaName,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: safeMetaWhatsAppCompletionError(error) }, { status: 500 });
  }
}

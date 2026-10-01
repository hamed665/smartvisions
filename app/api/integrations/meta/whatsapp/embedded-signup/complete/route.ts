import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  exchangeMetaAuthorizationCode,
  metaGraphVersion,
  safeMetaWhatsAppCompletionError,
  verifyMetaWhatsAppSelectedAssets,
} from '@/lib/whatsapp/meta-onboarding';

export const runtime = 'nodejs';

type CompleteBody = {
  attemptId?: string;
  bindingId?: string;
  expectedVersion?: number;
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
};

function clean(value: unknown, max = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as CompleteBody;
    const attemptId = clean(body.attemptId);
    const bindingId = clean(body.bindingId);
    const code = clean(body.code, 4096);
    const wabaId = clean(body.wabaId);
    const phoneNumberId = clean(body.phoneNumberId);
    const expectedVersion = Number(body.expectedVersion);

    if (
      !attemptId
      || !bindingId
      || !code
      || !wabaId
      || !phoneNumberId
      || !Number.isInteger(expectedVersion)
      || expectedVersion < 1
    ) {
      return NextResponse.json({ error: 'Invalid Embedded Signup completion payload' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data: attempt, error: attemptError } = await service
      .from('communication_channel_setup_attempts')
      .select('id,organization_id,communication_channel_binding_id,binding_version,status,expires_at,provider_destination_label')
      .eq('organization_id', ctx.organizationId)
      .eq('id', attemptId)
      .eq('communication_channel_binding_id', bindingId)
      .maybeSingle();

    if (attemptError || !attempt || attempt.binding_version !== expectedVersion) {
      return NextResponse.json({ error: 'WhatsApp setup attempt is missing or stale' }, { status: 409 });
    }

    if (attempt.status === 'COMPLETED') {
      const { data: completedBinding } = await service
        .from('communication_channel_bindings')
        .select('id,version,provider_destination_label')
        .eq('organization_id', ctx.organizationId)
        .eq('id', bindingId)
        .maybeSingle();

      if (completedBinding) {
        return NextResponse.json({
          ok: true,
          bindingId,
          version: completedBinding.version,
          displayPhoneNumber: completedBinding.provider_destination_label ?? attempt.provider_destination_label ?? null,
          replayed: true,
        });
      }
    }

    if (attempt.status !== 'STARTED' || new Date(attempt.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'WhatsApp setup attempt has expired or was superseded' }, { status: 409 });
    }

    const { data: binding, error: bindingError } = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,organization_id,tenant_business_id,branch_id,integration_connection_id,channel,status,version')
      .eq('organization_id', ctx.organizationId)
      .eq('id', bindingId)
      .maybeSingle();

    if (
      bindingError
      || !binding
      || binding.channel !== 'WHATSAPP'
      || binding.status !== 'ACTIVE'
      || binding.version !== expectedVersion
    ) {
      return NextResponse.json({ error: 'WhatsApp tenant binding is not eligible' }, { status: 409 });
    }

    const [{ data: business }, { data: integration }] = await Promise.all([
      ctx.supabase
        .from('tenant_businesses')
        .select('id,status')
        .eq('organization_id', ctx.organizationId)
        .eq('id', binding.tenant_business_id)
        .maybeSingle(),
      ctx.supabase
        .from('integration_connections')
        .select('id,provider,channel,enabled')
        .eq('organization_id', ctx.organizationId)
        .eq('id', binding.integration_connection_id)
        .maybeSingle(),
    ]);

    if (
      business?.status !== 'ACTIVE'
      || integration?.provider !== 'META'
      || integration?.channel !== 'WHATSAPP'
      || integration.enabled !== true
    ) {
      return NextResponse.json({ error: 'Canonical Meta WhatsApp scope is not active' }, { status: 409 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Meta provider app is not configured' }, { status: 503 });
    }

    const accessToken = await exchangeMetaAuthorizationCode({ code, appId, appSecret });
    const assets = await verifyMetaWhatsAppSelectedAssets({
      graphVersion: metaGraphVersion(),
      accessToken,
      wabaId,
      phoneNumberId,
    });

    const requestKey = `meta-whatsapp-setup-complete:${attemptId}`;
    const { data: configured, error: configureError } = await service.rpc(
      'complete_meta_whatsapp_setup_attempt',
      {
        p_organization_id: ctx.organizationId,
        p_attempt_id: attemptId,
        p_binding_id: bindingId,
        p_expected_binding_version: expectedVersion,
        p_waba_id: wabaId,
        p_phone_number_id: phoneNumberId,
        p_display_phone_number: assets.displayPhoneNumber,
        p_access_token: accessToken,
        p_actor_user_id: ctx.userId,
        p_request_key: requestKey,
      },
    );

    if (configureError) {
      return NextResponse.json({ error: 'WhatsApp credential could not be committed safely' }, { status: 409 });
    }

    const row = Array.isArray(configured) ? configured[0] : configured;
    return NextResponse.json({
      ok: true,
      bindingId,
      version: row?.version ?? expectedVersion + 1,
      displayPhoneNumber: assets.displayPhoneNumber,
      verifiedName: assets.verifiedName,
      wabaName: assets.wabaName,
    });
  } catch (error) {
    return NextResponse.json({ error: safeMetaWhatsAppCompletionError(error) }, { status: 500 });
  }
}

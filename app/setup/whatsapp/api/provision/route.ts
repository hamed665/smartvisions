import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import {
  provisionMetaWhatsAppBinding,
  registerMetaWhatsAppPhone,
  safeMetaWhatsAppProvisioningError,
} from '@/lib/whatsapp/meta-provisioning';
import {
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  WHATSAPP_REMOTE_SETUP_COOKIE,
} from '@/lib/whatsapp/remote-setup';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';

export const runtime = 'nodejs';

type RemoteProvisioningContext = {
  attempt_id: string;
  attempt_status: string;
  connection_mode: string;
  organization_id: string;
  tenant_business_id: string;
  branch_id: string | null;
  binding_id: string;
  provider_account_id: string | null;
  provider_destination_id: string | null;
};

type ProvisionBody = { pin?: string };

export async function POST(request: NextRequest) {
  const service = createSupabaseServiceClient();
  let context: RemoteProvisioningContext | null = null;

  try {
    const body = await request.json().catch(() => ({})) as ProvisionBody;
    const secret = normalizeWhatsAppRemoteSetupSecret(
      request.cookies.get(WHATSAPP_REMOTE_SETUP_COOKIE)?.value,
    );
    if (!secret) {
      return NextResponse.json({ error: 'No active WhatsApp setup session' }, { status: 401 });
    }

    const sessionHash = await hashWhatsAppRemoteSetupSecret(secret);
    const { data, error } = await service.rpc('get_meta_whatsapp_remote_setup_context', {
      p_session_token_hash: sessionHash,
    });
    context = (Array.isArray(data) ? data[0] : data) as RemoteProvisioningContext | null;

    if (error || !context?.attempt_id) {
      return NextResponse.json({ error: 'This WhatsApp setup session is expired or revoked' }, { status: 410 });
    }
    if (context.attempt_status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Meta authorization must complete before provider provisioning' }, { status: 409 });
    }
    if (context.connection_mode === 'BUSINESS_APP_COEXISTENCE') {
      return NextResponse.json({
        error: 'Same-number WhatsApp Business App Coexistence remains fail-closed until the official provider path is verified. Your existing WhatsApp stays untouched.',
      }, { status: 409 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    if (!appId) {
      return NextResponse.json({ error: 'Smart Visions Meta provider configuration is not ready' }, { status: 503 });
    }

    const resolved = await resolveMetaWhatsAppProvider({
      service,
      organizationId: context.organization_id,
      tenantBusinessId: context.tenant_business_id,
      branchId: context.branch_id,
    });

    if (
      resolved.bindingId !== context.binding_id
      || resolved.wabaId !== context.provider_account_id
      || resolved.phoneNumberId !== context.provider_destination_id
    ) {
      return NextResponse.json({ error: 'Canonical WhatsApp binding no longer matches the completed setup' }, { status: 409 });
    }

    const evidence = await provisionMetaWhatsAppBinding({
      graphVersion: metaGraphVersion(),
      accessToken: resolved.accessToken,
      appId,
      wabaId: resolved.wabaId || '',
      phoneNumberId: resolved.phoneNumberId,
    });

    let registrationConfirmed = context.connection_mode !== 'API_NEW_NUMBER';
    if (context.connection_mode === 'API_NEW_NUMBER') {
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
      if (!pin) {
        await service
          .from('communication_channel_bindings')
          .update({
            last_error_code: 'META_PHONE_REGISTRATION_REQUIRED',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', context.organization_id)
          .eq('id', context.binding_id);
        return NextResponse.json({
          ok: false,
          provisioned: false,
          subscriptionConfirmed: true,
          registrationRequired: true,
          displayPhoneNumber: evidence.displayPhoneNumber,
          message: 'Choose a 6-digit WhatsApp two-step verification PIN to finish Cloud API registration.',
        }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }

      await registerMetaWhatsAppPhone({
        graphVersion: metaGraphVersion(),
        accessToken: resolved.accessToken,
        phoneNumberId: resolved.phoneNumberId,
        pin,
      });
      registrationConfirmed = true;
    }

    const now = new Date().toISOString();
    const { error: bindingError } = await service
      .from('communication_channel_bindings')
      .update({
        last_verified_at: now,
        last_error_code: null,
        updated_at: now,
      })
      .eq('organization_id', context.organization_id)
      .eq('id', context.binding_id)
      .eq('provider', 'META')
      .eq('provider_destination_id', evidence.phoneNumberId);
    if (bindingError) throw new Error('Meta provisioning evidence could not be committed');

    const { error: auditError } = await service.from('audit_logs').insert({
      organization_id: context.organization_id,
      actor_type: 'REMOTE_SETUP',
      actor_id: 'WHATSAPP_SETUP',
      action: 'META_WHATSAPP_PROVIDER_PROVISIONED',
      entity_type: 'communication_channel_binding',
      entity_id: context.binding_id,
      tenant_business_id: context.tenant_business_id,
      branch_id: context.branch_id,
      after_data: {
        attempt_id: context.attempt_id,
        binding_id: context.binding_id,
        waba_id: evidence.wabaId,
        phone_number_id: evidence.phoneNumberId,
        subscription_confirmed: evidence.subscriptionConfirmed,
        subscription_created: evidence.subscriptionCreated,
        registration_confirmed: registrationConfirmed,
        quality_rating: evidence.qualityRating,
        platform_type: evidence.platformType,
        code_verification_status: evidence.codeVerificationStatus,
        verified_at: now,
      },
    });
    if (auditError) throw new Error('Meta provisioning audit evidence could not be committed');

    return NextResponse.json({
      ok: true,
      provisioned: true,
      subscriptionConfirmed: true,
      registrationRequired: false,
      registrationConfirmed,
      displayPhoneNumber: evidence.displayPhoneNumber,
      verifiedName: evidence.verifiedName,
      qualityRating: evidence.qualityRating,
      platformType: evidence.platformType,
      codeVerificationStatus: evidence.codeVerificationStatus,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (context?.organization_id && context?.binding_id) {
      const now = new Date().toISOString();
      await service
        .from('communication_channel_bindings')
        .update({
          last_error_code: 'META_PROVISIONING_NOT_CONFIRMED',
          updated_at: now,
        })
        .eq('organization_id', context.organization_id)
        .eq('id', context.binding_id);
    }
    return NextResponse.json({ error: safeMetaWhatsAppProvisioningError(error) }, { status: 503 });
  }
}

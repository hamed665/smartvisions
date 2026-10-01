import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import {
  provisionMetaWhatsAppBinding,
  registerMetaWhatsAppPhone,
  safeMetaWhatsAppProvisioningError,
} from '@/lib/whatsapp/meta-provisioning';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';

export const runtime = 'nodejs';

type Body = { bindingId?: string; attemptId?: string; pin?: string };

function clean(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 200 ? text : null;
}

export async function POST(request: Request) {
  const service = createSupabaseServiceClient();
  let organizationId: string | null = null;
  let bindingId: string | null = null;

  try {
    const ctx = await getCurrentOrganization(true);
    organizationId = ctx.organizationId;
    const body = await request.json() as Body;
    bindingId = clean(body.bindingId);
    const attemptId = clean(body.attemptId);
    if (!bindingId || !attemptId) return NextResponse.json({ error: 'Invalid WhatsApp provisioning request' }, { status: 400 });

    const { data: binding, error } = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,tenant_business_id,branch_id,channel,status,provider,provider_account_id,provider_destination_id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', bindingId)
      .maybeSingle();

    if (
      error || !binding || binding.channel !== 'WHATSAPP' || binding.status !== 'ACTIVE'
      || binding.provider !== 'META' || !binding.provider_account_id || !binding.provider_destination_id
    ) {
      return NextResponse.json({ error: 'WhatsApp binding is not ready for provider provisioning' }, { status: 409 });
    }

    const { data: attempt, error: attemptError } = await service
      .from('communication_channel_setup_attempts')
      .select('id,status,connection_mode,communication_channel_binding_id,provider_account_id,provider_destination_id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', attemptId)
      .eq('communication_channel_binding_id', binding.id)
      .maybeSingle();

    if (
      attemptError || !attempt || attempt.status !== 'COMPLETED'
      || attempt.provider_account_id !== binding.provider_account_id
      || attempt.provider_destination_id !== binding.provider_destination_id
    ) {
      return NextResponse.json({ error: 'Completed WhatsApp setup attempt no longer matches this binding' }, { status: 409 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    if (!appId) return NextResponse.json({ error: 'Smart Visions Meta provider configuration is not ready' }, { status: 503 });

    const resolved = await resolveMetaWhatsAppProvider({
      service,
      organizationId: ctx.organizationId,
      tenantBusinessId: binding.tenant_business_id,
      branchId: binding.branch_id,
    });
    if (
      resolved.bindingId !== binding.id
      || resolved.wabaId !== binding.provider_account_id
      || resolved.phoneNumberId !== binding.provider_destination_id
    ) {
      return NextResponse.json({ error: 'Canonical WhatsApp credential does not match this binding' }, { status: 409 });
    }

    const evidence = await provisionMetaWhatsAppBinding({
      graphVersion: metaGraphVersion(),
      accessToken: resolved.accessToken,
      appId,
      wabaId: binding.provider_account_id,
      phoneNumberId: binding.provider_destination_id,
    });

    let registrationConfirmed = attempt.connection_mode !== 'API_NEW_NUMBER';
    if (attempt.connection_mode === 'API_NEW_NUMBER') {
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
      if (!pin) {
        await service
          .from('communication_channel_bindings')
          .update({
            last_error_code: 'META_PHONE_REGISTRATION_REQUIRED',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', binding.id);
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
        phoneNumberId: binding.provider_destination_id,
        pin,
      });
      registrationConfirmed = true;
    }

    const now = new Date().toISOString();
    const { error: bindingError } = await service
      .from('communication_channel_bindings')
      .update({ last_verified_at: now, last_error_code: null, updated_at: now })
      .eq('organization_id', ctx.organizationId)
      .eq('id', binding.id);
    if (bindingError) throw new Error('Meta provisioning evidence could not be committed');

    const { error: auditError } = await service.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_PROVIDER_PROVISIONED',
      entity_type: 'communication_channel_binding',
      entity_id: binding.id,
      tenant_business_id: binding.tenant_business_id,
      branch_id: binding.branch_id,
      after_data: {
        binding_id: binding.id,
        waba_id: evidence.wabaId,
        phone_number_id: evidence.phoneNumberId,
        subscription_confirmed: evidence.subscriptionConfirmed,
        subscription_created: evidence.subscriptionCreated,
        registration_confirmed: registrationConfirmed,
        quality_rating: evidence.qualityRating,
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
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (organizationId && bindingId) {
      const now = new Date().toISOString();
      await service.from('communication_channel_bindings')
        .update({ last_error_code: 'META_PROVISIONING_NOT_CONFIRMED', updated_at: now })
        .eq('organization_id', organizationId)
        .eq('id', bindingId);
    }
    return NextResponse.json({ error: safeMetaWhatsAppProvisioningError(error) }, { status: 503 });
  }
}

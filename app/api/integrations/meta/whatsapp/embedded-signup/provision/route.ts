import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import {
  provisionMetaWhatsAppBinding,
  safeMetaWhatsAppProvisioningError,
} from '@/lib/whatsapp/meta-provisioning';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';

export const runtime = 'nodejs';

type Body = { bindingId?: string };

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
    if (!bindingId) return NextResponse.json({ error: 'Invalid WhatsApp binding' }, { status: 400 });

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
      displayPhoneNumber: evidence.displayPhoneNumber,
      verifiedName: evidence.verifiedName,
      qualityRating: evidence.qualityRating,
      platformType: evidence.platformType,
      codeVerificationStatus: evidence.codeVerificationStatus,
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

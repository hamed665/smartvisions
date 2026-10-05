import { NextResponse } from 'next/server';

import {
  loadCustomerBusinessAccessContext,
  normalizeCustomerBusinessId,
} from '@/lib/access/customer-business-scope';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const runtime = 'nodejs';

type Body = {
  businessId?: string;
};

function providerConfigured() {
  const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const configurationId = process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  return Boolean(appId && appSecret && configurationId);
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json().catch(() => ({})) as Body;
    const businessId = normalizeCustomerBusinessId(body.businessId);

    if (!businessId) {
      return NextResponse.json({ error: 'A valid Business is required.' }, { status: 400 });
    }

    if (!providerConfigured()) {
      return NextResponse.json({
        error: 'Smart Visions Meta provider configuration is not ready for customer authorization.',
      }, { status: 503 });
    }

    const access = await loadCustomerBusinessAccessContext({
      requestedBusinessId: businessId,
      supabase: ctx.supabase,
    });
    const business = access.selectedBusiness;

    if (!business || business.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: 'Business is not accessible.' }, { status: 404 });
    }

    let { data: integration, error: integrationError } = await ctx.supabase
      .from('integration_connections')
      .select('id,provider,channel,enabled,status,last_error')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', 'META')
      .eq('channel', 'WHATSAPP')
      .maybeSingle();

    if (integrationError) {
      return NextResponse.json({ error: 'Unable to read the canonical WhatsApp integration.' }, { status: 503 });
    }

    if (!integration) {
      const created = await ctx.supabase
        .from('integration_connections')
        .insert({
          organization_id: ctx.organizationId,
          provider: 'META',
          channel: 'WHATSAPP',
          enabled: true,
          status: 'CONNECTED',
          account_label: 'WhatsApp Business',
          last_checked_at: new Date().toISOString(),
          last_error: null,
          config: {},
        })
        .select('id,provider,channel,enabled,status,last_error')
        .single();

      if (created.error || !created.data) {
        return NextResponse.json({ error: 'Unable to prepare the canonical WhatsApp integration.' }, { status: 409 });
      }
      integration = created.data;
    } else if (integration.status === 'PAUSED' || integration.status === 'ERROR' || integration.status === 'DEGRADED') {
      return NextResponse.json({
        error: 'The canonical WhatsApp integration requires operator reconciliation before a new connection can start.',
      }, { status: 409 });
    } else if (!integration.enabled || integration.status !== 'CONNECTED') {
      const updated = await ctx.supabase
        .from('integration_connections')
        .update({
          enabled: true,
          status: 'CONNECTED',
          last_checked_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', ctx.organizationId)
        .eq('id', integration.id)
        .select('id,provider,channel,enabled,status,last_error')
        .single();

      if (updated.error || !updated.data) {
        return NextResponse.json({ error: 'Unable to activate the canonical WhatsApp integration.' }, { status: 409 });
      }
      integration = updated.data;
    }

    const existingResult = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,version,tenant_business_id,provider_destination_label,integration_connection_id')
      .eq('organization_id', ctx.organizationId)
      .eq('tenant_business_id', business.id)
      .eq('channel', 'WHATSAPP')
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(2);

    if (existingResult.error) {
      return NextResponse.json({ error: 'Unable to read the canonical WhatsApp binding.' }, { status: 503 });
    }

    const existing = existingResult.data ?? [];
    if (existing.length > 1) {
      return NextResponse.json({
        error: 'Multiple active WhatsApp bindings require reconciliation before self-service setup can continue.',
      }, { status: 409 });
    }

    if (existing.length === 1) {
      const row = existing[0];
      return NextResponse.json({
        ok: true,
        replayed: true,
        binding: {
          id: row.id,
          version: row.version,
          tenantBusinessId: business.id,
          businessName: business.name,
          branchName: null,
          destinationLabel: row.provider_destination_label ?? null,
        },
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const occupied = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,tenant_business_id')
      .eq('organization_id', ctx.organizationId)
      .eq('integration_connection_id', integration.id)
      .eq('channel', 'WHATSAPP')
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();

    if (occupied.error) {
      return NextResponse.json({ error: 'Unable to validate the WhatsApp integration slot.' }, { status: 503 });
    }
    if (occupied.data && occupied.data.tenant_business_id !== business.id) {
      return NextResponse.json({
        error: 'This Organization WhatsApp integration is already bound to another Business and must be reconciled before self-service setup.',
      }, { status: 409 });
    }

    const { data, error } = await ctx.supabase.rpc('create_communication_channel_binding', {
      p_organization_id: ctx.organizationId,
      p_tenant_business_id: business.id,
      p_branch_id: null,
      p_integration_connection_id: integration.id,
      p_channel: 'WHATSAPP',
      p_request_key: `customer-whatsapp-bootstrap:${business.id}:${crypto.randomUUID()}`,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (
      error
      || !row?.id
      || row.organization_id !== ctx.organizationId
      || row.tenant_business_id !== business.id
      || row.channel !== 'WHATSAPP'
      || row.status !== 'ACTIVE'
    ) {
      return NextResponse.json({ error: 'Unable to create the canonical WhatsApp binding safely.' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      replayed: false,
      binding: {
        id: row.id,
        version: row.version,
        tenantBusinessId: business.id,
        businessName: business.name,
        branchName: null,
        destinationLabel: row.provider_destination_label ?? null,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to prepare WhatsApp self-service setup.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const runtime = 'nodejs';

type CompleteBody = {
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

function graphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
}

async function metaJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Meta request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as CompleteBody;
    const bindingId = clean(body.bindingId);
    const code = clean(body.code, 4096);
    const wabaId = clean(body.wabaId);
    const phoneNumberId = clean(body.phoneNumberId);
    const expectedVersion = Number(body.expectedVersion);

    if (!bindingId || !code || !wabaId || !phoneNumberId || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: 'Invalid Embedded Signup completion payload' }, { status: 400 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Meta provider app is not configured' }, { status: 503 });
    }

    const { data: binding, error: bindingError } = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,organization_id,tenant_business_id,branch_id,integration_connection_id,channel,status,version')
      .eq('organization_id', ctx.organizationId)
      .eq('id', bindingId)
      .maybeSingle();

    if (bindingError || !binding || binding.channel !== 'WHATSAPP' || binding.status !== 'ACTIVE' || binding.version !== expectedVersion) {
      return NextResponse.json({ error: 'WhatsApp tenant binding is not eligible' }, { status: 409 });
    }

    const [{ data: business }, { data: integration }] = await Promise.all([
      ctx.supabase.from('tenant_businesses').select('id,status').eq('organization_id', ctx.organizationId).eq('id', binding.tenant_business_id).maybeSingle(),
      ctx.supabase.from('integration_connections').select('id,provider,channel,enabled').eq('organization_id', ctx.organizationId).eq('id', binding.integration_connection_id).maybeSingle(),
    ]);

    if (business?.status !== 'ACTIVE' || integration?.provider !== 'META' || integration?.channel !== 'WHATSAPP' || integration.enabled !== true) {
      return NextResponse.json({ error: 'Canonical Meta WhatsApp scope is not active' }, { status: 409 });
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', code);

    const token = await metaJson<{ access_token?: string }>(tokenUrl.toString());
    if (!token.access_token || token.access_token.length < 20) {
      throw new Error('Meta code exchange returned no access token');
    }

    const auth = { Authorization: `Bearer ${token.access_token}` };
    const [phone, waba] = await Promise.all([
      metaJson<{ id?: string; display_phone_number?: string; verified_name?: string }>(
        `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
        { headers: auth },
      ),
      metaJson<{ id?: string; name?: string }>(
        `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(wabaId)}?fields=id,name`,
        { headers: auth },
      ),
    ]);

    if (phone.id !== phoneNumberId || waba.id !== wabaId) {
      throw new Error('Meta returned assets that do not match the customer-selected Embedded Signup assets');
    }

    const requestKey = `meta-embedded-signup:${bindingId}:${expectedVersion}`;
    const { data: configured, error: configureError } = await ctx.supabase.rpc('configure_meta_whatsapp_binding', {
      p_organization_id: ctx.organizationId,
      p_binding_id: bindingId,
      p_expected_version: expectedVersion,
      p_waba_id: wabaId,
      p_phone_number_id: phoneNumberId,
      p_display_phone_number: phone.display_phone_number ?? null,
      p_access_token: token.access_token,
      p_request_key: requestKey,
    });
    if (configureError) throw new Error(`Meta binding persistence failed: ${configureError.message}`);

    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_EMBEDDED_SIGNUP_COMPLETED',
      entity_type: 'communication_channel_binding',
      entity_id: bindingId,
      after_data: {
        tenant_business_id: binding.tenant_business_id,
        branch_id: binding.branch_id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: phone.display_phone_number ?? null,
        verified_name: phone.verified_name ?? null,
        waba_name: waba.name ?? null,
        credential_storage: 'SUPABASE_VAULT',
      },
    });

    const row = Array.isArray(configured) ? configured[0] : configured;
    return NextResponse.json({
      ok: true,
      bindingId,
      version: row?.version ?? expectedVersion + 1,
      displayPhoneNumber: phone.display_phone_number ?? null,
      verifiedName: phone.verified_name ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedded Signup completion failed';
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  }
}

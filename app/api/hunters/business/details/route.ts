import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { controlledGooglePlaceDetails } from '@/lib/hunters/business/google-places-controlled';
import { assertValidGooglePlaceId } from '@/lib/hunters/business/selective-enrichment';
import { requireInternalApiKey } from '@/lib/security/internal-api';

const SOURCE_TYPE = 'GOOGLE_PLACE_DETAILS';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for idempotent Place Details');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = (await request.json()) as { organizationId?: string; placeId?: string; countryCode?: string; city?: string };
  if (!body.organizationId || !body.placeId || !body.countryCode || !body.city) {
    return NextResponse.json({ error: 'organizationId, placeId, countryCode and city are required' }, { status: 400 });
  }

  let placeId: string;
  try {
    placeId = assertValidGooglePlaceId(body.placeId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Google Place ID' }, { status: 400 });
  }

  const supabase = serviceClient();
  const readExisting = async () => supabase.from('discovery_records')
    .select('id,raw_payload,discovered_at')
    .eq('organization_id', body.organizationId)
    .eq('source_type', SOURCE_TYPE)
    .eq('source_id', placeId)
    .maybeSingle();

  const replay = (row: { id: string; raw_payload: unknown } | null) => {
    if (!row) return null;
    const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
    if (payload.status === 'COMPLETED' && payload.result) return NextResponse.json({ ...(payload.result as Record<string, unknown>), cached: true, providerCalls: 0 });
    if (payload.status === 'PROCESSING') return NextResponse.json({ error: 'Place Details for this Place ID is already processing; automatic duplicate blocked', discoveryRecordId: row.id }, { status: 409 });
    return NextResponse.json({ error: 'Previous Place Details attempt failed or requires reconciliation; blind automatic retry is blocked', discoveryRecordId: row.id }, { status: 409 });
  };

  const existing = await readExisting();
  if (existing.error) return NextResponse.json({ error: `Discovery journal lookup failed: ${existing.error.message}` }, { status: 500 });
  if (existing.data) return replay(existing.data)!;

  const { data: claimed, error: claimError } = await supabase.from('discovery_records').insert({
    organization_id: body.organizationId,
    source_type: SOURCE_TYPE,
    source_id: placeId,
    raw_payload: { status: 'PROCESSING', countryCode: body.countryCode.toUpperCase(), city: body.city },
  }).select('id').single();
  if (claimError) {
    if (claimError.code === '23505') {
      const raced = await readExisting();
      if (raced.error) return NextResponse.json({ error: `Discovery journal race lookup failed: ${raced.error.message}` }, { status: 500 });
      if (raced.data) return replay(raced.data)!;
    }
    return NextResponse.json({ error: `Place Details claim failed: ${claimError.message}` }, { status: 500 });
  }

  try {
    const business = await controlledGooglePlaceDetails({
      organizationId: body.organizationId,
      placeId,
      countryCode: body.countryCode.toUpperCase(),
      city: body.city,
    });
    const { error: persistError } = await supabase.from('discovery_records').update({
      raw_payload: { status: 'COMPLETED', result: business },
      discovered_at: new Date().toISOString(),
    }).eq('organization_id', body.organizationId).eq('id', claimed.id);
    if (persistError) return NextResponse.json({ ...business, cached: false, providerCalls: 1, reconciliationRequired: true, discoveryRecordId: claimed.id }, { status: 202 });
    return NextResponse.json({ ...business, cached: false, providerCalls: 1, discoveryRecordId: claimed.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Place Details failed';
    await supabase.from('discovery_records').update({ raw_payload: { status: 'FAILED', error: message.slice(0, 600), automatic_retry: false } })
      .eq('organization_id', body.organizationId).eq('id', claimed.id);
    const status = message.includes('not configured') ? 503 : message.includes('blocked') || message.includes('budget') ? 429 : 502;
    return NextResponse.json({ error: message, automaticRetry: false, discoveryRecordId: claimed.id }, { status });
  }
}

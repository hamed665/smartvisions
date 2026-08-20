'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { getCostGuardState } from '@/lib/reliability/cost-guard';
import { controlledGooglePlacesIdSearch } from '@/lib/hunters/business/google-places-controlled';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const safeMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : 'Google Places controlled sample failed';
  return message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]').slice(0, 240);
};

async function updateGooglePlacesHealth(
  ctx: Awaited<ReturnType<typeof getCurrentOrganization>>,
  input: { status: 'NOT_CONFIGURED'|'READY'|'CONNECTED'|'ERROR'; error?: string | null; enabled?: boolean },
) {
  await ctx.supabase
    .from('integration_connections')
    .update({
      status: input.status,
      enabled: input.enabled ?? false,
      last_checked_at: new Date().toISOString(),
      last_error: input.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'GOOGLE_PLACES')
    .eq('channel', 'DISCOVERY');
}

export async function runGooglePlacesControlledSample(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const city = text(form, 'city') || 'Muscat';
  const industry = text(form, 'industry') || 'dental clinic';
  const requestedLimit = Math.min(3, Math.max(1, Number(text(form, 'limit') || 3)));
  let destination = '/hunters/google-places';

  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      await updateGooglePlacesHealth(ctx, { status: 'NOT_CONFIGURED', error: 'GOOGLE_PLACES_API_KEY is not configured', enabled: false });
      throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    }

    const state = await getCostGuardState(ctx.organizationId);
    if (!state) throw new Error('Cost Guard state is unavailable; discovery blocked');

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count: discoveredToday, error: countError } = await ctx.supabase
      .from('discovery_records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('source_type', 'google_places')
      .gte('discovered_at', start.toISOString());
    if (countError) throw countError;

    const remainingDaily = Math.max(0, Number(state.settings.daily_new_leads) - Number(discoveredToday ?? 0));
    const limit = Math.min(requestedLimit, remainingDaily);
    if (limit < 1) throw new Error('Daily new-lead quota reached; Google Places sample blocked');

    const query = { countryCode: 'OM', city, industry, limit };
    const result = await controlledGooglePlacesIdSearch({ organizationId: ctx.organizationId, query });
    const uniqueIds = [...new Set(result.placeIds)].slice(0, limit);

    const { data: existingRows, error: existingError } = uniqueIds.length
      ? await ctx.supabase
          .from('discovery_records')
          .select('source_id')
          .eq('organization_id', ctx.organizationId)
          .eq('source_type', 'google_places')
          .in('source_id', uniqueIds)
      : { data: [], error: null };
    if (existingError) throw existingError;

    const existingIds = new Set((existingRows ?? []).map((row) => String(row.source_id)));
    const newIds = uniqueIds.filter((id) => !existingIds.has(id));

    if (newIds.length) {
      const { error: insertError } = await ctx.supabase.from('discovery_records').insert(
        newIds.map((placeId) => ({
          organization_id: ctx.organizationId,
          campaign_id: null,
          source_type: 'google_places',
          source_id: placeId,
          source_url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          raw_payload: {
            provider: 'GOOGLE_PLACES',
            operation: 'TEXT_SEARCH_IDS_ONLY',
            countryCode: 'OM',
            city,
            industry,
            placeId,
            controlledSample: true,
          },
        })),
      );
      if (insertError) throw insertError;
    }

    await updateGooglePlacesHealth(ctx, { status: 'CONNECTED', error: null, enabled: true });
    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'GOOGLE_PLACES_CONTROLLED_SAMPLE',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: {
        countryCode: 'OM',
        city,
        industry,
        requestedLimit: limit,
        returnedCount: result.placeIds.length,
        uniqueCount: uniqueIds.length,
        insertedCount: newIds.length,
        duplicateCount: uniqueIds.length - newIds.length,
        latencyMs: result.latencyMs,
        outreachTriggered: false,
      },
    });

    destination = `/hunters/google-places?result=success&returned=${result.placeIds.length}&inserted=${newIds.length}&duplicates=${uniqueIds.length - newIds.length}`;
  } catch (error) {
    const message = safeMessage(error);
    if (process.env.GOOGLE_PLACES_API_KEY) {
      await updateGooglePlacesHealth(ctx, { status: 'ERROR', error: message, enabled: false });
    }
    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'GOOGLE_PLACES_CONTROLLED_SAMPLE_FAILED',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: { error: message, outreachTriggered: false },
    });
    destination = `/hunters/google-places?result=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/hunters');
  revalidatePath('/hunters/google-places');
  revalidatePath('/integrations');
  revalidatePath('/cost-usage');
  redirect(destination);
}

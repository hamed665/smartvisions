'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { controlledGooglePlaceDetails } from '@/lib/hunters/business/google-places-controlled';

const CACHE_DAYS = 30;

export async function refreshGoogleBusinessIntelligence(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const leadId = String(form.get('leadId') ?? '').trim();
  if (!leadId) throw new Error('leadId is required');

  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('id,business_id,businesses(id,name,country_code,city,google_place_id,google_intelligence_retrieved_at)')
    .eq('organization_id', ctx.organizationId)
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead?.business_id) throw new Error('Lead has no business');

  const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
  const placeId = String(business?.google_place_id ?? '').trim();
  if (!placeId) throw new Error('Business has no Google Place ID');

  const retrievedAt = business?.google_intelligence_retrieved_at ? new Date(String(business.google_intelligence_retrieved_at)).getTime() : 0;
  if (retrievedAt && Date.now() - retrievedAt < CACHE_DAYS * 86_400_000) {
    redirect(`/leads/${encodeURIComponent(leadId)}?intel=cached`);
  }

  const intelligence = await controlledGooglePlaceDetails({
    organizationId: ctx.organizationId,
    placeId,
    countryCode: String(business?.country_code ?? 'OM'),
    city: String(business?.city ?? 'Muscat'),
  });

  const { error: updateError } = await ctx.supabase
    .from('businesses')
    .update({
      name: intelligence.name,
      category: intelligence.category ?? null,
      official_website: intelligence.officialWebsite ?? null,
      phone: intelligence.phone ?? null,
      international_phone: intelligence.internationalPhone ?? null,
      formatted_address: intelligence.formattedAddress ?? null,
      google_maps_uri: intelligence.googleMapsUri ?? null,
      google_rating: intelligence.rating ?? null,
      google_user_rating_count: intelligence.userRatingCount ?? null,
      google_business_status: intelligence.businessStatus ?? null,
      google_price_level: intelligence.priceLevel ?? null,
      google_primary_type_display_name: intelligence.primaryTypeDisplayName ?? null,
      google_opening_hours: intelligence.openingHours ?? {},
      google_reviews: intelligence.reviews ?? [],
      google_review_summary: intelligence.reviewSummary ?? null,
      google_intelligence_retrieved_at: intelligence.retrievedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', lead.business_id);
  if (updateError) throw updateError;

  const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'GOOGLE_BUSINESS_INTELLIGENCE_REFRESH',
    entity_type: 'lead',
    entity_id: leadId,
    after_data: {
      placeId,
      rating: intelligence.rating ?? null,
      totalRatingCount: intelligence.userRatingCount ?? null,
      returnedReviewSubsetCount: intelligence.reviews?.length ?? 0,
      outreachTriggered: false,
    },
  });
  if (auditError) throw auditError;

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  revalidatePath('/cost-usage');
  redirect(`/leads/${encodeURIComponent(leadId)}?intel=success`);
}

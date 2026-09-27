import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetaInstagramRoute } from './tenant-routing';
import type { NormalizedInstagramEvent } from './webhook';

export type InstagramBusinessResolution =
  | { status: 'NO_MATCH' }
  | { status: 'MATCH'; businessId: string; identityId: string };

export async function resolveInstagramInboundBusiness(input: {
  service: SupabaseClient;
  route: MetaInstagramRoute;
  event: NormalizedInstagramEvent;
}): Promise<InstagramBusinessResolution> {
  if (!input.event.senderId) return { status: 'NO_MATCH' };
  const { data, error } = await input.service.rpc('resolve_instagram_provider_business', {
    p_organization_id: input.route.organizationId,
    p_binding_id: input.route.bindingId,
    p_provider_user_id: input.event.senderId,
  });
  if (error) throw new Error(`Instagram canonical identity resolution failed: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return { status: 'NO_MATCH' };
  if (data.length !== 1) throw new Error('Instagram canonical identity resolution was not unique');
  return {
    status: 'MATCH',
    businessId: String(data[0].business_id),
    identityId: String(data[0].identity_id),
  };
}

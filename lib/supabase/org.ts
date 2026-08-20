import { createClient } from '@/lib/supabase/server';

export async function getCurrentOrganization(requireOwner = false) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Authentication required');

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (error || !membership) throw new Error('Organization membership required');
  if (requireOwner && membership.role !== 'OWNER') throw new Error('Owner permission required');

  return { supabase, organizationId: membership.organization_id as string, role: membership.role as string };
}

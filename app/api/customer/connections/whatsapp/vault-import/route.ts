import { NextResponse } from 'next/server';
import { POST as bootstrapWhatsApp } from '../bootstrap/route';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import { importMetaWhatsAppVaultAsset } from '@/lib/whatsapp/vault-import';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json().catch(() => ({})) as { businessId?: string };
    const businessId = normalizeCustomerBusinessId(body.businessId);
    if (!businessId) return NextResponse.json({ error: 'A valid Business is required.' }, { status: 400 });
    const business = await ctx.supabase.from('tenant_businesses').select('id,status')
      .eq('organization_id', ctx.organizationId).eq('id', businessId).maybeSingle();
    if (business.error || business.data?.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Business is not accessible.' }, { status: 404 });
    }
    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    if (!appId) return NextResponse.json({ error: 'Meta app is not configured.' }, { status: 503 });
    const result = await importMetaWhatsAppVaultAsset({
      service: createSupabaseServiceClient(), organizationId: ctx.organizationId,
      tenantBusinessId: businessId, actorUserId: ctx.userId, appId,
      bootstrap: async () => {
        // Reuse the existing authenticated OWNER bootstrap rather than a new binding writer.
        const response = await bootstrapWhatsApp(new Request(request.url, {
          method: 'POST', headers: request.headers, body: JSON.stringify({ businessId }),
        }));
        const output = await response.json() as {
          binding?: { id: string; version: number; tenantBusinessId: string };
        };
        if (!response.ok || !output.binding) throw new Error('Canonical bootstrap failed.');
        return output.binding;
      },
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    // Provider errors and credential-bearing RPC details must never reach the browser.
    return NextResponse.json({ error: 'Unable to connect the prepared registered API number safely. Operator reconciliation is required.' },
      { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

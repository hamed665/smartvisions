import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import addonsJson from '@/lib/config/addons.json';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateCanonicalQuote, type CanonicalAddonLine } from '@/lib/outreach/canonical-pricing';
import type { MarketCode } from '@/lib/outreach/scheduler';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for canonical quoting');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
type AddonCatalog = Record<string, { name: string; prices: Partial<Record<MarketCode, number>> }>;

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    serviceId?: string;
    marketCode?: MarketCode;
    requestedDiscountPct?: number;
    addons?: string[];
  };
  if (!body.serviceId || !body.marketCode) {
    return NextResponse.json({ error: 'serviceId and marketCode are required' }, { status: 400 });
  }

  try {
    const supabase = serviceClient();
    const countryCode = String(body.marketCode).toUpperCase();
    let organizationId = body.organizationId?.trim();

    if (!organizationId) {
      const { data: candidates, error: candidateError } = await supabase.from('service_prices')
        .select('organization_id')
        .eq('service_id', body.serviceId)
        .eq('country_code', countryCode)
        .limit(2);
      if (candidateError) throw new Error(candidateError.message);
      const organizations = [...new Set((candidates ?? []).map((row) => String(row.organization_id)).filter(Boolean))];
      if (organizations.length !== 1) throw new Error('organizationId is required when canonical price ownership is ambiguous');
      organizationId = organizations[0];
    }

    const [{ data: service, error: serviceError }, { data: price, error: priceError }] = await Promise.all([
      supabase.from('services')
        .select('id,name,enabled,config')
        .eq('organization_id', organizationId)
        .eq('id', body.serviceId)
        .maybeSingle(),
      supabase.from('service_prices')
        .select('service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
        .eq('organization_id', organizationId)
        .eq('service_id', body.serviceId)
        .eq('country_code', countryCode)
        .maybeSingle(),
    ]);
    if (serviceError || !service) throw new Error(serviceError?.message ?? 'Canonical service not found');
    if (!service.enabled) throw new Error('Service is disabled');
    if (priceError || !price) throw new Error(priceError?.message ?? 'Canonical market price not found');

    const catalog = addonsJson as AddonCatalog;
    const addonLines: CanonicalAddonLine[] = (body.addons ?? []).map((addonId) => {
      const addon = catalog[addonId];
      if (!addon) throw new Error(`Unknown addon: ${addonId}`);
      const addonPrice = addon.prices[body.marketCode!];
      if (addonPrice == null) throw new Error(`No configured addon price for ${addonId}/${countryCode}`);
      return { addonId, name: addon.name, price: Number(addonPrice) };
    });

    const config = rec(service.config);
    return NextResponse.json(evaluateCanonicalQuote({
      serviceId: String(service.id),
      serviceName: String(service.name),
      servicePrice: Number(price.price),
      currency: String(price.currency),
      minimumPrice: Number(price.minimum_price ?? 0),
      maxAutoDiscountPct: Number(price.max_auto_discount_pct ?? 0),
      maxDiscountWithApprovalPct: Number(price.max_discount_with_approval_pct ?? 0),
      requestedDiscountPct: body.requestedDiscountPct,
      addons: addonLines,
      startingFrom: config.startingFrom === true,
      requiresCustomQuote: config.requiresCustomQuote === true,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to quote' }, { status: 400 });
  }
}

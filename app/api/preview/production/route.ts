import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { generateProductionAsset } from '@/lib/preview/production-service';
import { isSiteLanguage, isSiteLanguageSource } from '@/lib/preview/production';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    leadId?: string;
    explicitRequest?: boolean;
    ownerApprovedHeavyGeneration?: boolean;
    siteLanguage?: string;
    siteLanguageSource?: string;
  };
  if (!body.organizationId || !body.leadId) {
    return NextResponse.json({ error: 'organizationId and leadId are required' }, { status: 400 });
  }
  if (body.siteLanguage !== undefined && !isSiteLanguage(body.siteLanguage)) {
    return NextResponse.json({ error: 'siteLanguage must be ar, en, or bilingual' }, { status: 400 });
  }
  if (body.siteLanguageSource !== undefined && !isSiteLanguageSource(body.siteLanguageSource)) {
    return NextResponse.json({ error: 'siteLanguageSource must be customer, owner, or internal_test' }, { status: 400 });
  }

  try {
    const result = await generateProductionAsset({
      organizationId: body.organizationId,
      leadId: body.leadId,
      explicitRequest: Boolean(body.explicitRequest),
      ownerApprovedHeavyGeneration: Boolean(body.ownerApprovedHeavyGeneration),
      siteLanguage: isSiteLanguage(body.siteLanguage) ? body.siteLanguage : undefined,
      siteLanguageSource: isSiteLanguageSource(body.siteLanguageSource) ? body.siteLanguageSource : undefined,
    });
    if (!result.eligible) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Production asset generation failed';
    const status = message.includes('not found') ? 404 : message.includes('disabled') || message.includes('required before') || message.includes('SITE_LANGUAGE') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

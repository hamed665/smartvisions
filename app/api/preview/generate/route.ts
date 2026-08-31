import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { generatePreview, isPreviewEligible } from '@/lib/preview/engine';
import { evaluatePreviewQuality } from '@/lib/preview/quality';
import { isSiteLanguage, isSiteLanguageSource } from '@/lib/preview/production';
import type { PreviewInput } from '@/lib/preview/types';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const input = await request.json() as PreviewInput;
  if (!input.businessName || !input.vertical || !input.countryCode || !isSiteLanguage(input.language) || !isSiteLanguageSource(input.languageSource)) {
    return NextResponse.json({ error: 'businessName, vertical, countryCode, explicit language and languageSource are required' }, { status: 400 });
  }

  const eligibility = isPreviewEligible(input);
  if (!eligibility.eligible) {
    return NextResponse.json({ eligible: false, reasons: eligibility.reasons }, { status: 409 });
  }

  const preview = generatePreview(input);
  const quality = evaluatePreviewQuality(preview);
  return NextResponse.json({
    eligible: true,
    preview,
    quality,
    requiresHumanApproval: true,
    sendAllowed: false,
  });
}

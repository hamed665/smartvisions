import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { assertCanonicalSendAllowed } from '@/lib/outreach/canonical-send-gate';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp sending');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    leadId?: string;
    conversationId?: string;
    to?: string;
    text?: string;
    replyToMessageId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    templateName?: string;
    templateLanguageCode?: string;
    templateBodyParameters?: string[];
  };

  if (!body.organizationId || !body.leadId || !body.conversationId || !body.to) {
    return NextResponse.json({ error: 'organizationId, leadId, conversationId and to are required' }, { status: 400 });
  }

  const supabase = serviceClient();
  try {
    await assertCanonicalSendAllowed({
      supabase,
      organizationId: body.organizationId,
      leadId: body.leadId,
      conversationId: body.conversationId,
      channel: 'WHATSAPP',
      recipient: body.to,
      templateName: body.templateName,
    });
    const costState = await getCostGuardState(body.organizationId);
    assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Canonical safety block' }, { status: 409 });
  }

  let finalGate: Awaited<ReturnType<typeof assertCanonicalSendAllowed>>;
  try {
    // The durable inbound timestamp, DNC/suppression state and runtime controls are
    // re-read immediately before the provider call. Request body safety hints are ignored.
    finalGate = await assertCanonicalSendAllowed({
      supabase,
      organizationId: body.organizationId,
      leadId: body.leadId,
      conversationId: body.conversationId,
      channel: 'WHATSAPP',
      recipient: body.to,
      templateName: body.templateName,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Final canonical safety block' }, { status: 409 });
  }

  const whatsappPolicy = finalGate.whatsappPolicy;
  if (!whatsappPolicy?.allowed) {
    return NextResponse.json({ error: 'WhatsApp canonical send policy blocks sending', whatsappPolicy }, { status: 409 });
  }
  if (whatsappPolicy.mode === 'FREEFORM' && !body.text) {
    return NextResponse.json({ error: 'text is required inside the customer service window' }, { status: 400 });
  }
  if (whatsappPolicy.mode === 'TEMPLATE' && (!body.templateName || !body.templateLanguageCode)) {
    return NextResponse.json({ error: 'templateName and templateLanguageCode are required for template sends' }, { status: 400 });
  }

  const provider = new MetaCloudWhatsAppProvider();
  const result = whatsappPolicy.mode === 'TEMPLATE'
    ? await provider.sendTemplate({ to: body.to, templateName: body.templateName!, languageCode: body.templateLanguageCode!, bodyParameters: body.templateBodyParameters })
    : await provider.sendText({ to: body.to, text: body.text!, replyToMessageId: body.replyToMessageId });

  const pricingStatus = whatsappPolicy.mode === 'FREEFORM'
    ? 'FINAL_FREE_SERVICE_WINDOW'
    : 'PENDING_TEMPLATE_CATEGORY_RECONCILIATION';
  await recordUsage({
    organizationId: body.organizationId,
    provider: 'WHATSAPP',
    operation: whatsappPolicy.mode === 'TEMPLATE' ? 'SEND_TEMPLATE' : 'SEND_TEXT',
    costUsd: 0,
    units: 1,
    leadId: body.leadId,
    metadata: {
      pricing_status: pricingStatus,
      whatsapp_mode: whatsappPolicy.mode,
      canonical_last_inbound_at: finalGate.lastInboundAt,
      ...(whatsappPolicy.mode === 'TEMPLATE' ? {
        pricing_note: 'Template charge depends on Meta template category and destination market; zero is not asserted as final invoice cost',
        template_name: body.templateName,
      } : {}),
    },
  });
  return NextResponse.json({ ...result, whatsappPolicy });
}

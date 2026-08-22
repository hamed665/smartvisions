import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';
import { assertChannelAllowed, getRuntimeControls } from '@/lib/reliability/runtime-controls';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    to?: string;
    text?: string;
    marketCode?: MarketCode;
    leadTimezone?: string;
    agentMode?: 'AUTO' | 'PAUSED' | 'HUMAN';
    shadowMode?: boolean;
    doNotContact?: boolean;
    replyToMessageId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    leadId?: string;
    lastCustomerMessageAt?: string;
    templateName?: string;
    templateLanguageCode?: string;
  };

  if (!body.to || !body.marketCode) {
    return NextResponse.json({ error: 'to and marketCode are required' }, { status: 400 });
  }
  if (body.doNotContact) return NextResponse.json({ error: 'Lead is marked do-not-contact' }, { status: 409 });
  if (body.agentMode === 'HUMAN') return NextResponse.json({ error: 'AI sending is blocked during human takeover' }, { status: 409 });
  if (body.agentMode === 'PAUSED') return NextResponse.json({ error: 'AI sending is paused' }, { status: 409 });
  if (body.shadowMode) return NextResponse.json({ error: 'Shadow mode requires human review before send' }, { status: 409 });

  const whatsappPolicy = evaluateWhatsAppSendPolicy({
    lastCustomerMessageAt: body.lastCustomerMessageAt,
    templateName: body.templateName,
  });
  if (!whatsappPolicy.allowed) {
    return NextResponse.json({ error: 'WhatsApp free-form send is outside the 24-hour customer service window; an approved template is required', whatsappPolicy }, { status: 409 });
  }
  if (whatsappPolicy.mode === 'FREEFORM' && !body.text) {
    return NextResponse.json({ error: 'text is required inside the customer service window' }, { status: 400 });
  }
  if (whatsappPolicy.mode === 'TEMPLATE' && (!body.templateName || !body.templateLanguageCode)) {
    return NextResponse.json({ error: 'templateName and templateLanguageCode are required for template sends' }, { status: 400 });
  }

  try {
    const [controls, costState] = await Promise.all([
      getRuntimeControls(body.organizationId),
      getCostGuardState(body.organizationId),
    ]);
    assertChannelAllowed(controls, 'WHATSAPP');
    assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Runtime safety block' }, { status: 409 });
  }

  const window = evaluateLocalWindow({ marketCode: body.marketCode, leadTimezone: body.leadTimezone });
  if (!window.allowed) return NextResponse.json({ error: 'Outside recipient local send window', window }, { status: 409 });

  const provider = new MetaCloudWhatsAppProvider();
  const result = whatsappPolicy.mode === 'TEMPLATE'
    ? await provider.sendTemplate({ to: body.to, templateName: body.templateName!, languageCode: body.templateLanguageCode! })
    : await provider.sendText({ to: body.to, text: body.text!, replyToMessageId: body.replyToMessageId });

  if (body.organizationId) {
    await recordUsage({
      organizationId: body.organizationId,
      provider: 'WHATSAPP',
      operation: whatsappPolicy.mode === 'TEMPLATE' ? 'SEND_TEMPLATE' : 'SEND_TEXT',
      costUsd: 0,
      units: 1,
      leadId: body.leadId,
      metadata: { pricing_status: 'PENDING_RECONCILIATION', whatsapp_mode: whatsappPolicy.mode },
    });
  }
  return NextResponse.json({ ...result, whatsappPolicy });
}

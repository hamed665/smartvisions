import { NextResponse } from 'next/server';

import {
  ChatwootProvisioningError,
} from '@/lib/chatwoot/provisioning';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { provisionWhatsAppChatwootProjection } from '@/lib/whatsapp/chatwoot-projection';

export const runtime = 'nodejs';

type Body = { bindingId?: string };

function clean(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 200 ? text : null;
}

function statusFor(error: unknown) {
  if (!(error instanceof ChatwootProvisioningError)) return 503;
  if (error.code === 'INVALID_INPUT') return 400;
  if (error.code === 'ACTIVATION_BLOCKED') return 409;
  if (
    error.code === 'DUPLICATE_MATCH'
    || error.code === 'IDENTITY_CONFLICT'
    || error.code === 'RECONCILIATION_REQUIRED'
    || error.code === 'UPSTREAM_MISMATCH'
  ) return 409;
  return 503;
}

function safeMessage(error: unknown) {
  if (!(error instanceof ChatwootProvisioningError)) {
    return 'Communication Inbox provisioning is temporarily unavailable.';
  }
  if (error.code === 'ACTIVATION_BLOCKED') {
    return 'The Smart Visions communication plane is not enabled for automatic provisioning yet.';
  }
  if (error.code === 'INVALID_INPUT') {
    return 'This WhatsApp connection is not eligible for Chatwoot projection.';
  }
  return 'The WhatsApp connection is saved, but the communication Inbox needs reconciliation before it can be marked ready.';
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json() as Body;
    const bindingId = clean(body.bindingId);

    if (!bindingId) {
      return NextResponse.json({
        error: 'Invalid WhatsApp binding',
        correlationId,
      }, { status: 400 });
    }

    const projection = await provisionWhatsAppChatwootProjection({
      supabase: ctx.supabase,
      organizationId: ctx.organizationId,
      bindingId,
    });

    return NextResponse.json({
      ok: true,
      ready: true,
      bindingId: projection.bindingId,
      outcome: projection.outcome,
      correlationId,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('WhatsApp Chatwoot projection failed', {
      correlationId,
      code: error instanceof ChatwootProvisioningError ? error.code : 'UNKNOWN',
    });

    return NextResponse.json({
      error: safeMessage(error),
      correlationId,
    }, { status: statusFor(error) });
  }
}

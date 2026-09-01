import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { notifyTelegramOwner, notifyTelegramOwnerNewLead } from '@/lib/telegram/notifications';
import type { TelegramNotificationType } from '@/lib/telegram/contracts';

const ALLOWED_TYPES = new Set<TelegramNotificationType>(['NEW_LEAD','HOT_LEAD','SALES_HANDOFF','DISCOUNT_REQUEST','CONSULTATION_REQUEST','SYSTEM_ALERT']);

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = await request.json() as {
    eventKey?: string;
    notificationType?: TelegramNotificationType;
    text?: string;
    entityType?: string;
    entityId?: string;
    organizationId?: string;
    leadId?: string;
    payload?: Record<string, unknown>;
  };

  if (body.notificationType === 'NEW_LEAD' && body.organizationId && body.leadId) {
    const result = await notifyTelegramOwnerNewLead({ organizationId: body.organizationId, leadId: body.leadId });
    return NextResponse.json(result);
  }

  if (!body.eventKey || !body.notificationType || !ALLOWED_TYPES.has(body.notificationType) || !body.text) {
    return NextResponse.json({ error: 'eventKey, allowed notificationType and text are required' }, { status: 400 });
  }

  const result = await notifyTelegramOwner({
    eventKey: body.eventKey,
    notificationType: body.notificationType,
    text: body.text,
    entityType: body.entityType,
    entityId: body.entityId,
    payload: body.payload,
  });
  return NextResponse.json(result);
}

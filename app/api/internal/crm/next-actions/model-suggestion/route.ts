import { NextResponse } from 'next/server';

import { recordCrmTaskNextActionModelSuggestion } from '@/lib/crm/next-actions';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['CALL','EMAIL','WHATSAPP','MEETING','REVIEW','FOLLOW_UP','OTHER']);

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validSuggestion(value: unknown): value is Record<string, unknown> | null {
  if (value === null) return true;
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.some(key => !['action','rationale','confidence','model','modelVersion'].includes(key))) return false;
  if (!ACTIONS.has(String(value.action))) return false;
  if (typeof value.model !== 'string' || value.model.trim().length < 1 || value.model.trim().length > 120) return false;
  if (typeof value.modelVersion !== 'string' || value.modelVersion.trim().length < 1 || value.modelVersion.trim().length > 120) return false;
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
  if (value.rationale !== undefined && (typeof value.rationale !== 'string' || value.rationale.length > 1200)) return false;
  return true;
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const taskId = body.taskId;
  const actorUserId = body.actorUserId;
  const suggestion = body.suggestion;

  if (!isUuid(organizationId)
      || !isUuid(taskId)
      || !isUuid(actorUserId)
      || !validSuggestion(suggestion)) {
    return NextResponse.json({ error: 'Invalid next-action model suggestion payload' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const result = await recordCrmTaskNextActionModelSuggestion({
      supabase,
      organizationId,
      taskId,
      actorUserId,
      suggestion,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('CRM next-action model suggestion failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /not permitted|permission denied/i.test(message) ? 403 : 409;
    return NextResponse.json({ error: message.slice(0, 500) }, { status });
  }
}

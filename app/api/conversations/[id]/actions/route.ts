import { NextResponse } from 'next/server';

import {
  getUnifiedInboxConversationActionOptions,
  parseUnifiedInboxConversationActionBody,
  parseUnifiedInboxInternalNoteBody,
  performUnifiedInboxConversationAction,
  performUnifiedInboxInternalNote,
  UnifiedInboxActionError,
} from '@/lib/chatwoot/conversation-actions';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { getCurrentOrganization } from '@/lib/supabase/org';

function statusFor(error: unknown) {
  if (error instanceof SyntaxError) return 400;
  if (error instanceof UnifiedInboxActionError) {
    if (error.code === 'INVALID_INPUT') return 400;
    if (error.code === 'FORBIDDEN') return 403;
    if (error.code === 'NOT_READY') return 409;
    if (error.code === 'ACTIVATION_BLOCKED') return 503;
    if (error.code === 'RECONCILIATION_REQUIRED') return 409;
    return 502;
  }
  if (error instanceof ChatwootHttpError) {
    if (error.code === 'PROVISIONING_DISABLED' || error.code === 'CONFIG_INVALID') return 503;
    if (error.code === 'AUTH_FAILED') return 502;
    if (error.code === 'NOT_FOUND') return 409;
    if (error.code === 'VALIDATION_FAILED') return 409;
    return 502;
  }
  return 500;
}


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, organizationId } = await getCurrentOrganization();
    const options = await getUnifiedInboxConversationActionOptions({
      supabase,
      organizationId,
      conversationId: id,
    });
    return NextResponse.json(options, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const status = statusFor(error);
    const message = error instanceof UnifiedInboxActionError
      ? error.message
      : error instanceof ChatwootHttpError
        ? 'Chatwoot action options could not be loaded safely'
        : 'Unified Inbox action options failed';

    return NextResponse.json(
      {
        error: message,
        ...(error instanceof UnifiedInboxActionError ? { code: error.code } : {}),
      },
      { status },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { supabase, organizationId, userId } = await getCurrentOrganization();
    const actionName = body && typeof body === 'object' && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).action === 'string'
      ? String((body as Record<string, unknown>).action).trim().toUpperCase()
      : '';

    const result = actionName === 'INTERNAL_NOTE'
      ? await performUnifiedInboxInternalNote({
        supabase,
        organizationId,
        userId,
        request: parseUnifiedInboxInternalNoteBody(id, body),
      })
      : await performUnifiedInboxConversationAction({
        supabase,
        organizationId,
        userId,
        request: parseUnifiedInboxConversationActionBody(id, body),
      });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const status = statusFor(error);
    const message = error instanceof UnifiedInboxActionError
      ? error.message
      : error instanceof ChatwootHttpError
        ? 'Chatwoot action could not be completed safely'
        : error instanceof SyntaxError
          ? 'Invalid JSON body'
          : 'Unified Inbox action failed';

    return NextResponse.json(
      {
        error: message,
        ...(error instanceof UnifiedInboxActionError ? { code: error.code } : {}),
      },
      { status },
    );
  }
}

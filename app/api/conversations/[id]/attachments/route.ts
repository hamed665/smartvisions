import { NextResponse } from 'next/server';

import {
  getUnifiedInboxAttachments,
  UnifiedInboxActionError,
} from '@/lib/chatwoot/conversation-actions';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function statusFor(error: unknown) {
  if (error instanceof UnifiedInboxActionError) {
    if (error.code === 'INVALID_INPUT') return 400;
    if (error.code === 'FORBIDDEN') return 403;
    if (error.code === 'NOT_READY' || error.code === 'RECONCILIATION_REQUIRED') return 409;
    if (error.code === 'ACTIVATION_BLOCKED') return 503;
    return 502;
  }
  if (error instanceof ChatwootHttpError) {
    if (error.code === 'PROVISIONING_DISABLED' || error.code === 'CONFIG_INVALID') return 503;
    if (error.code === 'NOT_FOUND') return 404;
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
    const result = await getUnifiedInboxAttachments({
      supabase,
      organizationId,
      conversationId: id,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof UnifiedInboxActionError
          ? error.message
          : 'Attachment list could not be loaded safely',
      },
      {
        status: statusFor(error),
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

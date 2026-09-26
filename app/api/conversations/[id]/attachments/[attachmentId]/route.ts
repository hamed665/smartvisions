import { NextResponse } from 'next/server';

import {
  downloadUnifiedInboxAttachment,
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
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const { id, attachmentId } = await params;
    const numericAttachmentId = Number(attachmentId);
    const { supabase, organizationId, userId } = await getCurrentOrganization();
    const result = await downloadUnifiedInboxAttachment({
      supabase,
      organizationId,
      userId,
      conversationId: id,
      attachmentId: numericAttachmentId,
    });

    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (result.contentLength !== null) {
      headers.set('Content-Length', String(result.contentLength));
    }
    return new Response(result.body, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof UnifiedInboxActionError
          ? error.message
          : 'Attachment download could not be completed safely',
      },
      {
        status: statusFor(error),
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}

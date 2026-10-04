import { NextResponse } from 'next/server';

import { buildGovernedDataExport, normalizeDataExportFormat } from '@/lib/analytics/export';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function optionalId(value: string | null) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, 100) : null;
}

export async function GET(request: Request) {
  try {
    const current = await getCurrentOrganization();
    const url = new URL(request.url);
    const rawFormat = url.searchParams.get('format');

    if (String(rawFormat ?? '').trim().toUpperCase() === 'GOOGLE_SHEETS') {
      return NextResponse.json({
        status: 'BLOCKED_EXTERNAL',
        blocker: 'GOOGLE_SHEETS_CONNECTION_NOT_CONFIGURED',
        detail: 'No canonical Google Sheets connection authority is configured. Use XLSX or CSV without creating a parallel credential path.',
      }, { status: 409 });
    }

    const format = normalizeDataExportFormat(rawFormat);
    if (!format) {
      return NextResponse.json({ error: 'format must be CSV, JSON, XLSX or PDF' }, { status: 400 });
    }

    const artifact = await buildGovernedDataExport({
      supabase: current.supabase,
      organizationId: current.organizationId,
      format,
      days: url.searchParams.get('days'),
      requestedTenantBusinessId: optionalId(url.searchParams.get('business')),
      requestedBranchId: optionalId(url.searchParams.get('branch')),
    });

    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': artifact.mimeType,
        'Content-Disposition': `attachment; filename="${artifact.filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Smart-Visions-Export-Scope': artifact.snapshot.scope.level,
        'X-Smart-Visions-Export-Window': String(artifact.snapshot.window.days),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Data export failed';
    const status = /Authentication required|membership required/i.test(message)
      ? 401
      : /scope is not available|does not belong/i.test(message)
        ? 403
        : /format|window|required|valid date/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ error: message.slice(0, 600) }, { status });
  }
}

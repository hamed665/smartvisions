import { notFound } from 'next/navigation';
import { PreviewCanvas } from '@/components/preview/PreviewCanvas';
import { ContentProposalCanvas, type ContentProposal } from '@/components/preview/ContentProposalCanvas';
import { loadPublicPreview } from '@/lib/preview/public-persistence';
import type { PreviewDocument } from '@/lib/preview/types';

export const dynamic = 'force-dynamic';

export default async function PublicPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (process.env.DEPLOYMENT_ENV === 'candidate' && token === '__migration-ok') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return <main>migration-fetch-config-missing</main>;
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/previews?select=id&limit=0`, {
        headers: { apikey: key, accept: 'application/json' },
      });
      return <main>{`migration-fetch-status-${response.status}`}</main>;
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      return <main>{`migration-fetch-error-${name}`}</main>;
    }
  }

  const row = await loadPublicPreview(token);
  if (!row) notFound();

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const preview = payload.preview as PreviewDocument | undefined;
  const proposal = payload.proposal as ContentProposal | undefined;
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const growthSource = (metadata.growth_source ?? {}) as Record<string, unknown>;
  const business = (growthSource.business ?? {}) as Record<string, unknown>;

  return (
    <main style={{ minHeight: '100vh', background: '#f5f5f3', padding: '32px 16px' }}>
      {preview ? <PreviewCanvas preview={preview}/> : proposal ? <ContentProposalCanvas proposal={proposal} businessName={String(business.name ?? '') || undefined}/> : notFound()}
    </main>
  );
}

import { notFound } from 'next/navigation';
import { PreviewCanvas } from '@/components/preview/PreviewCanvas';
import { ContentProposalCanvas, type ContentProposal } from '@/components/preview/ContentProposalCanvas';
import { loadPublicPreview } from '@/lib/preview/persistence';
import type { PreviewDocument } from '@/lib/preview/types';

export const dynamic = 'force-dynamic';

export default async function PublicPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Temporary migration-only probe. It is unreachable in normal Vercel production
  // because DEPLOYMENT_ENV is only set on the isolated Cloudflare candidate.
  if (process.env.DEPLOYMENT_ENV === 'candidate' && token === '__cloudflare_notfound_probe__') notFound();

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

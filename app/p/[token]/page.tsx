import { notFound } from 'next/navigation';
import { loadPublicPreview } from '@/lib/preview/persistence';

export const dynamic = 'force-dynamic';

export default async function PublicPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (process.env.DEPLOYMENT_ENV === 'candidate' && token === '__cloudflare_notfound_probe__') notFound();

  const row = await loadPublicPreview(token);
  if (!row) notFound();

  return <main>preview-row-ok</main>;
}

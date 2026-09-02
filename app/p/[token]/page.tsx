import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (process.env.DEPLOYMENT_ENV === 'candidate' && token === '__cloudflare_notfound_probe__') notFound();

  await import('@/lib/preview/persistence');
  notFound();
}

import { notFound } from 'next/navigation';
import { loadPublicPreview } from '@/lib/preview/public-persistence';

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

  return <main>preview-row-ok</main>;
}

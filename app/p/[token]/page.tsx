import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  await params;
  notFound();
}

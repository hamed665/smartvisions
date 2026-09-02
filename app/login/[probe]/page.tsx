import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DynamicLoginNotFoundProbePage({
  params,
}: {
  params: Promise<{ probe: string }>;
}) {
  await params;
  notFound();
}

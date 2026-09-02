import { notFound } from 'next/navigation';

export default async function DynamicLoginNotFoundProbePage({
  params,
}: {
  params: Promise<{ probe: string }>;
}) {
  await params;
  notFound();
}

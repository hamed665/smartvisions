import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CustomerMorePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const params = await searchParams;
  const scopedConnectionsHref = params.businessId
    ? `/customer/connections?businessId=${encodeURIComponent(params.businessId)}`
    : '/customer/connections';

  return <div><div className="headerRow"><div><p className="eyebrow">BUSINESS WORKSPACE</p><h1>More</h1><p className="muted">Business tools available to this customer workspace.</p></div></div><section className="panel"><div className="quickActions"><Link href={scopedConnectionsHref}>Connections</Link><Link href="/auth/forgot-password">Account recovery</Link></div></section></div>;
}

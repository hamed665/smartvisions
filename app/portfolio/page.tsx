import { AdminSection } from '@/app/admin-section';

export default function PortfolioPage() {
  return <AdminSection title="Portfolio" description="Approved work samples that agents may safely reference in sales conversations." cards={[
    { title: 'Approved', value: '0', note: 'Portfolio items cleared for outreach use.' },
    { title: 'Draft', value: '0', note: 'Items awaiting operator review.' },
    { title: 'Restricted', value: '0', note: 'Items blocked from automated claims.' },
  ]} />;
}

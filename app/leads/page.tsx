import { AdminSection } from '@/app/admin-section';

export default function LeadsPage() {
  return <AdminSection title="Leads" description="All discovered and qualified business opportunities in one workspace." cards={[
    { title: 'New', value: '0', note: 'Fresh leads awaiting enrichment.' },
    { title: 'Qualified', value: '0', note: 'Leads that passed qualification rules.' },
    { title: 'Contacted', value: '0', note: 'Prospects with outreach activity.' },
  ]} />;
}

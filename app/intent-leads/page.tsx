import { AdminSection } from '@/app/admin-section';

export default function IntentLeadsPage() {
  return <AdminSection title="Intent Leads" description="Prospects showing explicit demand for websites, automation, apps, or AI content." cards={[
    { title: 'High intent', value: '0', note: 'Strong buying signals detected.' },
    { title: 'Fresh', value: '0', note: 'Recently detected opportunities.' },
    { title: 'Needs review', value: '0', note: 'Ambiguous opportunities awaiting validation.' },
  ]} />;
}

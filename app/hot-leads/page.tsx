import { AdminSection } from '@/app/admin-section';

export default function HotLeadsPage() {
  return <AdminSection title="Hot Leads" description="High-intent prospects that deserve immediate commercial attention." cards={[
    { title: 'Hot', value: '0', note: 'Strong purchase intent.' },
    { title: 'Closing', value: '0', note: 'Discussing payment, invoice, or final terms.' },
    { title: 'Needs human', value: '0', note: 'Commercial or risk boundary requires review.' },
  ]} />;
}

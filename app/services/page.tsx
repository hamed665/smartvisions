import { AdminSection } from '@/app/admin-section';

export default function ServicesPage() {
  return <AdminSection title="Services" description="Service catalog used by the sales agents and quotation rules." cards={[
    { title: 'Enabled services', value: '6', note: 'Current production service catalog.' },
    { title: 'AI content', value: '2', note: 'Configured AI reel packages.' },
    { title: 'Automation', value: '1', note: 'WhatsApp AI setup offering.' },
  ]} />;
}

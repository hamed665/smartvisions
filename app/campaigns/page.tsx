import { AdminSection } from '@/app/admin-section';

export default function CampaignsPage() {
  return <AdminSection title="Campaigns" description="Outbound campaigns, timing rules, and delivery progress." cards={[
    { title: 'Draft', value: '0', note: 'Campaigns not yet activated.' },
    { title: 'Running', value: '0', note: 'Active campaigns inside local send windows.' },
    { title: 'Paused', value: '0', note: 'Campaigns stopped by policy or operator.' },
  ]} />;
}

import { AdminSection } from '@/app/admin-section';

export default function MarketsPage() {
  return <AdminSection title="Markets" description="Country, timezone, currency, language, and local messaging configuration." cards={[
    { title: 'Active markets', value: '6', note: 'Oman, UAE, Saudi Arabia, Qatar, UK, and USA.' },
    { title: 'Local send window', value: '09–19', note: 'Applied in each market’s local time.' },
    { title: 'Arabic locales', value: '4', note: 'Omani, Emirati, Saudi, and Qatari profiles.' },
  ]} />;
}

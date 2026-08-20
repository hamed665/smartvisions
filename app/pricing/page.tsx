import { AdminSection } from '@/app/admin-section';

export default function PricingPage() {
  return <AdminSection title="Pricing" description="Country-specific prices, discount limits, and approval boundaries." cards={[
    { title: 'Price entries', value: '36', note: 'Six services across six MVP markets.' },
    { title: 'Auto discount ceiling', value: '5%', note: 'Where configured, agents cannot exceed this autonomously.' },
    { title: 'Approval ceiling', value: '10%', note: 'Higher discounts require operator approval.' },
  ]} />;
}

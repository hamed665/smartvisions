import { AdminSection } from '@/app/admin-section';

export default function SystemPage() {
  return <AdminSection title="System" description="Operational safety controls, automation state, and production guardrails." cards={[
    { title: 'Global kill switch', value: 'OFF', note: 'Production system is not globally stopped.' },
    { title: 'Shadow mode', value: 'ON', note: 'Autonomous outbound actions remain observable before full release.' },
    { title: 'Security advisor', value: '0', note: 'No current Supabase security lint findings.' },
  ]} />;
}

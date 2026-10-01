import type { Metadata } from 'next';

import { RemoteWhatsAppSetup } from './remote-whatsapp-setup';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'WhatsApp Business setup',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function WhatsAppSetupPage() {
  return <RemoteWhatsAppSetup />;
}

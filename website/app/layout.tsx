import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com'),
  title: {
    default: 'Smart Visions | AI, Digital & Growth',
    template: '%s | Smart Visions',
  },
  description: 'Smart Visions builds digital products, AI systems and growth infrastructure for ambitious businesses.',
  applicationName: 'Smart Visions',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

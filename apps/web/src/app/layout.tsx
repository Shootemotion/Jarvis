import type { Metadata, Viewport } from 'next';
import { Orbitron, JetBrains_Mono, Inter } from 'next/font/google';
import './globals.css';

// Sci-fi wordmark, technical HUD labels, and a clean body sans.
const brand = Orbitron({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-brand',
  display: 'swap',
});
const hud = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-hud',
  display: 'swap',
});
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JARVIS',
  description: 'Personal AI assistant',
  applicationName: 'JARVIS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'JARVIS',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

// Mobile-first: fit the viewport (incl. notches) and set the theme color.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${brand.variable} ${hud.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import '../public/style.css';

export const metadata: Metadata = {
  title: 'RodSync — Modern Rod Inventory & Smart Cut Optimizer',
  description: 'Professional rod stock management system with exact diameter matching, optimal length calculation, and real-time inventory tracking.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#f5f7fb',
};

import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-jetbrains',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="RodSync" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './branding.css';
import './marketplace.css';
import './tools.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Crop Life AI | Farmer Assistance',
  description: 'AI-assisted crop inspection and approved Crop Life Science product discovery for farmers.',
  openGraph: {
    title: 'Crop Life AI',
    description: 'Understand your crop. Act with confidence.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Crop Life AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crop Life AI',
    description: 'Understand your crop. Act with confidence.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

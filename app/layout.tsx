import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './branding.css';
import './marketplace.css';
import './tools.css';
import './dark-mode.css';
import './admin-portal.css';
import './admin-enhancements.css';

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
  applicationName: 'Crop Life AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Crop Life AI' },
  icons: { icon: '/clsl-logo.png', apple: '/clsl-logo.png' },
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fffefa',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('crop-life-ai-theme-v1');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:'light'}catch(e){document.documentElement.dataset.theme='light'}" }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

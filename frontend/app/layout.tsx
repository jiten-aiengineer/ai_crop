import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './branding.css';
import './marketplace.css';
import './tools.css';
import './dark-mode.css';
import './admin-portal.css';
import './admin-enhancements.css';
import './admin-catalogue-enhancements.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CLSL AI | Crop Protection',
  description: 'Crop protection guidance, crop inspection and Crop Life Science product discovery.',
  applicationName: 'CLSL AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CLSL AI' },
  icons: { icon: '/clsl-logo.png', apple: '/clsl-logo.png' },
  openGraph: {
    title: 'CLSL AI',
    description: 'Crop protection by Crop Life Science.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'CLSL AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLSL AI',
    description: 'Crop protection by Crop Life Science.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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

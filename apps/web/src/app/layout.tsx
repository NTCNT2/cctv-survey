import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-sans-thai',
  subsets: ['thai', 'latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CCTV Site Survey',
  description: 'ระบบสำรวจหน้างานและออกแบบตำแหน่งกล้องวงจรปิด',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

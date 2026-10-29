import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'HSP Production Control - cloud demo', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}

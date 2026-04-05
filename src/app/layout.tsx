import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Office Drama',
  description: 'HydraDB-powered NPC investigation game'
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Pipeline Observability',
  description: 'Developer tool to trigger and inspect the Agents 00-07 pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden antialiased">{children}</body>
    </html>
  );
}

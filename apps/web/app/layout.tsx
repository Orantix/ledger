import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orantix Ledger',
  description: 'Self-hosted books, FS generation & owner dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="brand">Orantix Ledger</span>
          <Link href="/">Captures</Link>
          <Link href="/capture/new">New capture</Link>
          <Link href="/trial-balance">Trial balance</Link>
        </nav>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}

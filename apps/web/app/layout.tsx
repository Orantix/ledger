import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orantix Ledger',
  description: 'Self-hosted books, FS generation & owner dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>
            <Nav />
            <div className="shell">{children}</div>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

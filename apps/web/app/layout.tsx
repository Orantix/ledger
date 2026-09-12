import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

// Bundled at build time and served from this app — no runtime request to
// Google, consistent with the project's self-hosted, zero-external-deps stance.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans-loaded', display: 'swap' });

export const metadata: Metadata = {
  title: 'Orantix Ledger',
  description: 'Self-hosted books, FS generation & owner dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <AuthProvider>
            <div className="app-shell">
              <Sidebar />
              <main className="main-content">
                <div className="content-inner">{children}</div>
              </main>
            </div>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

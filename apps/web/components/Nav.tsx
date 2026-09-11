'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const ROLE_LINKS: { href: string; label: string; roles?: string[] }[] = [
  { href: '/', label: 'Captures' },
  { href: '/capture/new', label: 'New capture' },
  { href: '/trial-balance', label: 'Trial balance' },
  { href: '/periods', label: 'Financial statements', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/fs-mappings', label: 'FS mappings', roles: ['ACCOUNTANT', 'ADMIN'] },
  { href: '/users', label: 'Users', roles: ['ADMIN'] },
];

export function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const links = ROLE_LINKS.filter((l) => !l.roles || l.roles.includes(user.role));

  return (
    <nav className="nav">
      <span className="brand">Orantix Ledger</span>

      <div className={`nav-links ${open ? 'open' : ''}`}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined} onClick={() => setOpen(false)}>
            {l.label}
          </Link>
        ))}
      </div>

      <button type="button" className="secondary nav-toggle" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
        {open ? '✕' : '☰'}
      </button>

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/account" className="subtitle" style={{ margin: 0 }}>
          {user.name} · {user.role}
        </Link>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            logout();
            router.replace('/login');
          }}
        >
          Sign out
        </button>
      </span>
    </nav>
  );
}

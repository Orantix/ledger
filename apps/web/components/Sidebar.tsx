'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS: { href: string; label: string; roles?: string[] }[] = [
  { href: '/', label: 'Captures' },
  { href: '/capture/new', label: 'New capture' },
  { href: '/trial-balance', label: 'Trial balance' },
  { href: '/periods', label: 'Financial statements', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/fs-mappings', label: 'FS mappings', roles: ['ACCOUNTANT', 'ADMIN'] },
  { href: '/users', label: 'Users', roles: ['ADMIN'] },
  { href: '/settings', label: 'Settings', roles: ['OWNER', 'ADMIN'] },
];

function Brand() {
  return (
    <div className="sidebar-brand">
      <span className="sidebar-mark" />
      Orantix Ledger
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const links = LINKS.filter((l) => !l.roles || l.roles.includes(user.role));

  const nav = (
    <>
      <div className="sidebar-links">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={pathname === l.href ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div className="sidebar-footer">
        <Link href="/account" className="sidebar-user" onClick={() => setOpen(false)}>
          <strong>{user.name}</strong>
          <span>{user.role}</span>
        </Link>
        <button
          type="button"
          className="sidebar-signout"
          onClick={() => {
            logout();
            router.replace('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="mobile-topbar">
        <Brand />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? '✕' : '☰'}
        </button>
      </div>

      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />
        {nav}
      </aside>
    </>
  );
}

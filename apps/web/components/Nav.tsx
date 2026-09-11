'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const ROLE_LINKS: { href: string; label: string; roles?: string[] }[] = [
  { href: '/', label: 'Captures' },
  { href: '/capture/new', label: 'New capture' },
  { href: '/trial-balance', label: 'Trial balance' },
  { href: '/periods', label: 'Financial statements', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] },
  { href: '/fs-mappings', label: 'FS mappings', roles: ['ACCOUNTANT', 'ADMIN'] },
];

export function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <nav className="nav">
      <span className="brand">Orantix Ledger</span>
      {ROLE_LINKS.filter((l) => !l.roles || l.roles.includes(user.role)).map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="subtitle" style={{ margin: 0 }}>
          {user.name} · {user.role}
        </span>
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

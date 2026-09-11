'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { AppUser, Role } from '@/lib/api';

const ROLES: Role[] = ['STAFF', 'BOOKKEEPER', 'ACCOUNTANT', 'OWNER', 'ADMIN'];

export default function UsersPage() {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [creating, setCreating] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<{ email: string; password: string } | null>(null);

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }

  useEffect(() => {
    if (!ready || !token) return;
    load();
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { user, temporaryPassword } = await api.createUser({ email, name, role });
      setRevealedPassword({ email: user.email, password: temporaryPassword });
      setName('');
      setEmail('');
      setRole('STAFF');
      load();
      toast.show(`${user.name} added.`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function onToggleActive(user: AppUser) {
    const updated = await api.updateUser(user.id, { isActive: !user.isActive });
    load();
    toast.show(updated.isActive ? `${user.name} enabled.` : `${user.name} disabled.`, 'success');
  }

  async function onChangeRole(user: AppUser, newRole: Role) {
    await api.updateUser(user.id, { role: newRole });
    load();
    toast.show(`${user.name}'s role changed to ${newRole}.`, 'success');
  }

  async function onResetPassword(user: AppUser) {
    const { temporaryPassword } = await api.resetUserPassword(user.id);
    setRevealedPassword({ email: user.email, password: temporaryPassword });
  }

  if (!ready || !token) return null;

  return (
    <>
      <h1>Users</h1>
      <p className="subtitle">Add and manage who can access the ledger, and what they can do.</p>

      {error && <p className="error">{error}</p>}

      {revealedPassword && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <p style={{ margin: 0 }}>
            Temporary password for <strong>{revealedPassword.email}</strong>:{' '}
            <code style={{ userSelect: 'all' }}>{revealedPassword.password}</code>
          </p>
          <p className="subtitle">Shown once — copy it now and share it with them out of band.</p>
          <button type="button" className="secondary" onClick={() => setRevealedPassword(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => onChangeRole(u, e.target.value as Role)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'posted' : 'draft'}`}>{u.isActive ? 'Active' : 'Disabled'}</span>
                </td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="secondary" onClick={() => onResetPassword(u)}>
                    Reset password
                  </button>
                  <button type="button" className="secondary" onClick={() => onToggleActive(u)}>
                    {u.isActive ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Add a user</h2>
        <form onSubmit={onCreate}>
          <div className="row">
            <label>
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Email
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </div>
    </>
  );
}

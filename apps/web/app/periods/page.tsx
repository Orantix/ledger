'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { FiscalPeriod } from '@/lib/api';

export default function PeriodsPage() {
  const { ready, token, user } = useRequireAuth();
  const api = useApi();
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = user && ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(user.role);

  function load() {
    api.listPeriods().then(setPeriods).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
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
      await api.createPeriod({ label, startDate, endDate });
      setLabel('');
      setStartDate('');
      setEndDate('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create period');
    } finally {
      setCreating(false);
    }
  }

  if (!ready || !token) return null;

  return (
    <>
      <h1>Financial statements</h1>
      <p className="subtitle">Pick a reporting period to generate statements, or create a new one.</p>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {periods.length === 0 ? (
          <p className="empty">No fiscal periods yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/periods/${p.id}`}>{p.label}</Link>
                  </td>
                  <td>{new Date(p.startDate).toLocaleDateString()}</td>
                  <td>{new Date(p.endDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${p.status === 'FINAL' ? 'posted' : 'draft'}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canCreate && (
        <div className="card">
          <h2>New period</h2>
          <form onSubmit={onCreate}>
            <label>
              Label
              <input required placeholder="e.g. FY2026" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <div className="row">
              <label>
                Start date
                <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                End date
                <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create period'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

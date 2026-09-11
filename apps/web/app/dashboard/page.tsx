'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { ready, token, user } = useRequireAuth();
  const api = useApi();

  const [cashflow, setCashflow] = useState<{ months: { month: string; netChange: number }[]; note?: string } | null>(null);
  const [capital, setCapital] = useState<{ shareholderName: string; committed: number; paidIn: number; shortfall: number }[]>([]);
  const [relatedParty, setRelatedParty] = useState<{ shareholderName: string; owed: number }[]>([]);
  const [burn, setBurn] = useState<{ burnRate: number | null; currentCashBalance: number; runwayMonths: number | null; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shareholderName, setShareholderName] = useState('');
  const [committedAmount, setCommittedAmount] = useState('');
  const [addingCommitment, setAddingCommitment] = useState(false);
  const canManageCapital = user && ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(user.role);

  function load() {
    Promise.all([api.getCashflowDashboard(), api.getCapitalDashboard(), api.getRelatedParty(), api.getBurnRate()])
      .then(([cf, cap, rp, b]) => {
        setCashflow(cf);
        setCapital(cap);
        setRelatedParty(rp);
        setBurn(b);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }

  useEffect(() => {
    if (!ready || !token) return;
    load();
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onAddCommitment(e: FormEvent) {
    e.preventDefault();
    setAddingCommitment(true);
    try {
      await api.createCapitalCommitment({ shareholderName, committedAmount: Number(committedAmount) });
      setShareholderName('');
      setCommittedAmount('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add commitment');
    } finally {
      setAddingCommitment(false);
    }
  }

  if (!ready || !token) return null;
  if (error) return <p className="error">{error}</p>;
  if (!cashflow || !burn) return <p className="empty">Loading…</p>;

  const maxAbs = Math.max(1, ...cashflow.months.map((m) => Math.abs(m.netChange)));

  return (
    <>
      <h1>Owner dashboard</h1>
      <p className="subtitle">Real cash-basis view of the business — distinct from the accrual income statement.</p>

      <div className="card">
        <h2>Cash flow (last {cashflow.months.length} months)</h2>
        {cashflow.note ? (
          <p className="subtitle">{cashflow.note}</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
            {cashflow.months.map((m) => (
              <div key={m.month} style={{ textAlign: 'center', flex: 1 }}>
                <div
                  style={{
                    height: `${Math.max(4, (Math.abs(m.netChange) / maxAbs) * 90)}px`,
                    background: m.netChange >= 0 ? 'var(--ok)' : '#b3261e',
                    borderRadius: 3,
                    marginBottom: 4,
                  }}
                  title={`${m.month}: ${fmt(m.netChange)}`}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.month.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row">
        <div className="card">
          <h2>Burn rate & runway</h2>
          {burn.note ? (
            <p className="subtitle">{burn.note}</p>
          ) : (
            <>
              <p>
                Monthly burn: <strong>{fmt(burn.burnRate ?? 0)}</strong>
              </p>
              <p>
                Cash balance: <strong>{fmt(burn.currentCashBalance)}</strong>
              </p>
              <p>
                Runway:{' '}
                <strong>
                  {burn.runwayMonths === null ? 'Not burning cash' : burn.runwayMonths === 0 ? 'Out of cash' : `${fmt(burn.runwayMonths)} months`}
                </strong>
              </p>
            </>
          )}
        </div>

        <div className="card">
          <h2>Related-party balances</h2>
          <p className="subtitle">What the company owes each director from personal-draw payments.</p>
          {relatedParty.length === 0 ? (
            <p className="empty">None.</p>
          ) : (
            <table>
              <tbody>
                {relatedParty.map((r) => (
                  <tr key={r.shareholderName}>
                    <td>{r.shareholderName}</td>
                    <td className="num">{fmt(r.owed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Capital: committed vs paid-in</h2>
        {capital.length === 0 ? (
          <p className="empty">No capital commitments recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Shareholder</th>
                <th className="num">Committed</th>
                <th className="num">Paid in</th>
                <th className="num">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {capital.map((c) => (
                <tr key={c.shareholderName}>
                  <td>{c.shareholderName}</td>
                  <td className="num">{fmt(c.committed)}</td>
                  <td className="num">{fmt(c.paidIn)}</td>
                  <td className="num">{c.shortfall > 0 ? <span style={{ color: '#b3261e' }}>{fmt(c.shortfall)}</span> : fmt(c.shortfall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canManageCapital && (
          <form onSubmit={onAddCommitment} className="row" style={{ marginTop: 16 }}>
            <input
              required
              placeholder="Shareholder name"
              value={shareholderName}
              onChange={(e) => setShareholderName(e.target.value)}
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder="Committed amount"
              value={committedAmount}
              onChange={(e) => setCommittedAmount(e.target.value)}
            />
            <button type="submit" disabled={addingCommitment} style={{ flex: 'none' }}>
              Add commitment
            </button>
          </form>
        )}
      </div>
    </>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CashflowChart({ months }: { months: { month: string; netChange: number }[] }) {
  const width = 680;
  const height = 190;
  const labelPad = 22;
  const plotHeight = height - labelPad;
  const baseline = plotHeight * 0.58;
  const positiveSpace = baseline - 14;
  const negativeSpace = plotHeight - baseline - 14;
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.netChange)));

  const slot = width / months.length;
  const barWidth = Math.min(46, slot * 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: 'block' }}>
      <line x1={0} y1={baseline} x2={width} y2={baseline} stroke="var(--border)" strokeWidth={1} />
      {months.map((m, i) => {
        const cx = i * slot + slot / 2;
        const isPos = m.netChange >= 0;
        const barHeight = Math.max(3, (Math.abs(m.netChange) / maxAbs) * (isPos ? positiveSpace : negativeSpace));
        const y = isPos ? baseline - barHeight : baseline;
        const color = isPos ? 'var(--chart-pos)' : 'var(--chart-neg)';
        const labelY = isPos ? y - 6 : y + barHeight + 14;
        return (
          <g key={m.month}>
            <rect x={cx - barWidth / 2} y={y} width={barWidth} height={barHeight} rx={4} fill={color} />
            <text x={cx} y={labelY} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
              {m.netChange !== 0 ? fmt(m.netChange) : ''}
            </text>
            <text x={cx} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--muted-2)">
              {m.month.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
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

  const runwayLabel =
    burn.runwayMonths === null ? 'Not burning cash' : burn.runwayMonths === 0 ? 'Out of cash' : `${fmt(burn.runwayMonths)} mo`;

  return (
    <>
      <h1>Owner dashboard</h1>
      <p className="subtitle">Real cash-basis view of the business — distinct from the accrual income statement.</p>

      {!burn.note && (
        <div className="card-row">
          <div className="stat-card" style={{ ['--accent-bar' as string]: 'var(--accent)' }}>
            <p className="stat-label">Cash balance</p>
            <p className={`stat-value ${burn.currentCashBalance < 0 ? 'negative' : ''}`}>{fmt(burn.currentCashBalance)}</p>
          </div>
          <div className="stat-card" style={{ ['--accent-bar' as string]: 'var(--warn)' }}>
            <p className="stat-label">Monthly burn</p>
            <p className="stat-value">{fmt(burn.burnRate ?? 0)}</p>
          </div>
          <div className="stat-card" style={{ ['--accent-bar' as string]: burn.runwayMonths === 0 ? 'var(--danger)' : 'var(--ok)' }}>
            <p className="stat-label">Runway</p>
            <p className={`stat-value ${burn.runwayMonths === 0 ? 'negative' : ''}`}>{runwayLabel}</p>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Cash flow (last {cashflow.months.length} months)</h2>
        {cashflow.note ? <p className="subtitle">{cashflow.note}</p> : <CashflowChart months={cashflow.months} />}
      </div>

      <div className="card-row">
        <div className="card" style={{ marginBottom: 0 }}>
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

        <div className="card" style={{ marginBottom: 0 }}>
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
                    <td className="num">
                      {c.shortfall > 0 ? <span style={{ color: 'var(--danger)' }}>{fmt(c.shortfall)}</span> : fmt(c.shortfall)}
                    </td>
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
                Add
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

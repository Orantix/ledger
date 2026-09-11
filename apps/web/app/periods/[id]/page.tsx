'use client';

import { Fragment, FormEvent, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import {
  BalanceSheetSide,
  FiscalPeriod,
  IncomeStatementSide,
  VarianceFlag,
} from '@/lib/api';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Tab = 'income' | 'balance' | 'equity' | 'cashflow' | 'variance';

export default function PeriodDetailPage({ params }: { params: { id: string } }) {
  const { ready, token, user } = useRequireAuth();
  const api = useApi();
  const toast = useToast();
  const periodId = params.id;

  const [tab, setTab] = useState<Tab>('income');
  const [period, setPeriod] = useState<FiscalPeriod | null>(null);
  const [income, setIncome] = useState<{ current: IncomeStatementSide } | null>(null);
  const [balance, setBalance] = useState<{ asOf: BalanceSheetSide } | null>(null);
  const [equity, setEquity] = useState<Awaited<ReturnType<typeof api.getChangesInEquity>> | null>(null);
  const [cashflow, setCashflow] = useState<Awaited<ReturnType<typeof api.getCashFlow>> | null>(null);
  const [flags, setFlags] = useState<VarianceFlag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canFinalize = user && ['OWNER', 'ADMIN'].includes(user.role);
  const canExplain = user && ['BOOKKEEPER', 'ACCOUNTANT', 'OWNER', 'ADMIN'].includes(user.role);

  function loadAll() {
    Promise.all([
      api.getIncomeStatement(periodId),
      api.getBalanceSheet(periodId),
      api.getChangesInEquity(periodId),
      api.getCashFlow(periodId),
      api.listVarianceFlags(periodId),
    ])
      .then(([i, b, e, c, f]) => {
        setPeriod(i.period);
        setIncome(i);
        setBalance(b);
        setEquity(e);
        setCashflow(c);
        setFlags(f);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(() => {
    if (!ready || !token) return;
    loadAll();
  }, [ready, token, periodId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onScan() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.scanPeriod(periodId);
      setFlags(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function onFinalize() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.finalizePeriod(periodId);
      setPeriod(updated);
      toast.show(`${updated.label} finalized — locked against new postings.`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finalize');
    } finally {
      setBusy(false);
    }
  }

  async function onExplain(flagId: string, explanation: string) {
    await api.explainFlag(flagId, explanation);
    const updated = await api.listVarianceFlags(periodId);
    setFlags(updated);
    toast.show('Flag explained.', 'success');
  }

  if (!ready || !token) return null;
  if (error) return <p className="error">{error}</p>;
  if (!period || !income || !balance || !equity || !cashflow) return <p className="empty">Loading…</p>;

  const openFlags = flags.filter((f) => f.status === 'OPEN');

  return (
    <>
      <h1>
        {period.label} <span className={`badge ${period.status === 'FINAL' ? 'posted' : 'draft'}`}>{period.status}</span>
      </h1>
      <p className="subtitle">
        {new Date(period.startDate).toLocaleDateString()} – {new Date(period.endDate).toLocaleDateString()}
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <a href={api.exportUrl(periodId, 'xlsx')}>
          <button type="button" className="secondary">
            Export Excel
          </button>
        </a>
        <a href={api.exportUrl(periodId, 'pdf')}>
          <button type="button" className="secondary">
            Export PDF
          </button>
        </a>
        {canFinalize && period.status === 'DRAFT' && (
          <button type="button" onClick={onFinalize} disabled={busy}>
            Finalize period
          </button>
        )}
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 6 }}>
        {(['income', 'balance', 'equity', 'cashflow', 'variance'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? '' : 'secondary'}
            onClick={() => setTab(t)}
            style={{ flex: 'none' }}
          >
            {t === 'income' && 'Income Statement'}
            {t === 'balance' && 'Balance Sheet'}
            {t === 'equity' && 'Changes in Equity'}
            {t === 'cashflow' && 'Cash Flow'}
            {t === 'variance' && `Variance (${openFlags.length})`}
          </button>
        ))}
      </div>

      {tab === 'income' && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Section / Account</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {income.current.bySection.map((s) => (
                <Fragment key={s.section}>
                  <tr>
                    <td>
                      <strong>{s.section}</strong>
                    </td>
                    <td />
                  </tr>
                  {s.rows.map((r) => (
                    <tr key={r.accountId}>
                      <td style={{ paddingLeft: 20 }}>{r.noteLabel}</td>
                      <td className="num">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 20 }}>
                      <em>Total {s.section}</em>
                    </td>
                    <td className="num">
                      <em>{fmt(s.total)}</em>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Net Income</th>
                <th className="num">{fmt(income.current.netIncome)}</th>
              </tr>
            </tfoot>
          </table>
          {income.current.unmapped.length > 0 && (
            <p className="error">{income.current.unmapped.length} account(s) with activity have no FS mapping yet.</p>
          )}
        </div>
      )}

      {tab === 'balance' && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Section / Account</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {balance.asOf.bySection.map((s) => (
                <Fragment key={s.section}>
                  <tr>
                    <td>
                      <strong>{s.section}</strong>
                    </td>
                    <td />
                  </tr>
                  {s.rows.map((r) => (
                    <tr key={r.accountId}>
                      <td style={{ paddingLeft: 20 }}>{r.noteLabel}</td>
                      <td className="num">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 20 }}>
                      <em>Total {s.section}</em>
                    </td>
                    <td className="num">
                      <em>{fmt(s.total)}</em>
                    </td>
                  </tr>
                </Fragment>
              ))}
              <tr>
                <td style={{ paddingLeft: 20 }}>Retained earnings (cumulative)</td>
                <td className="num">{fmt(balance.asOf.retainedEarnings)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th>Total Assets</th>
                <th className="num">{fmt(balance.asOf.totalAssets)}</th>
              </tr>
              <tr>
                <th>Total Liabilities + Equity</th>
                <th className="num">{fmt(balance.asOf.totalLiabilities + balance.asOf.totalEquity)}</th>
              </tr>
            </tfoot>
          </table>
          {!balance.asOf.balances && <p className="error">Balance sheet does not balance — this should never happen.</p>}
          {balance.asOf.unmapped.length > 0 && (
            <p className="error">{balance.asOf.unmapped.length} account(s) with activity have no FS mapping yet.</p>
          )}
        </div>
      )}

      {tab === 'equity' && (
        <div className="card">
          <table>
            <tbody>
              <tr>
                <td>Opening Equity</td>
                <td className="num">{fmt(equity.openingEquity)}</td>
              </tr>
              {equity.movements.map((m) => (
                <tr key={m.accountId}>
                  <td>{m.name}</td>
                  <td className="num">{fmt(m.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>Net Income for Period</td>
                <td className="num">{fmt(equity.netIncomeForPeriod)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th>Closing Equity</th>
                <th className="num">{fmt(equity.closingEquity)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'cashflow' && (
        <div className="card">
          {cashflow.note && <p className="subtitle">{cashflow.note}</p>}
          <table>
            <tbody>
              <tr>
                <td>Opening Cash</td>
                <td className="num">{fmt(cashflow.openingCash)}</td>
              </tr>
              <tr>
                <td>Operating Activities</td>
                <td className="num">{fmt(cashflow.operating)}</td>
              </tr>
              <tr>
                <td>Investing Activities</td>
                <td className="num">{fmt(cashflow.investing)}</td>
              </tr>
              <tr>
                <td>Financing Activities</td>
                <td className="num">{fmt(cashflow.financing)}</td>
              </tr>
              <tr>
                <td>Net Change in Cash</td>
                <td className="num">{fmt(cashflow.netChange)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th>Closing Cash</th>
                <th className="num">{fmt(cashflow.closingCash)}</th>
              </tr>
            </tfoot>
          </table>
          {!cashflow.reconciles && <p className="error">Cash flow does not reconcile to the balance sheet — check for entries outside the period.</p>}
        </div>
      )}

      {tab === 'variance' && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <button type="button" className="secondary" onClick={onScan} disabled={busy} style={{ flex: 'none' }}>
              {busy ? 'Scanning…' : 'Scan for issues'}
            </button>
          </div>
          {flags.length === 0 ? (
            <p className="empty">No variance flags. Run a scan, or finalize (which scans automatically).</p>
          ) : (
            flags.map((f) => <VarianceRow key={f.id} flag={f} canExplain={!!canExplain} onExplain={onExplain} />)
          )}
        </div>
      )}
    </>
  );
}

function VarianceRow({
  flag,
  canExplain,
  onExplain,
}: {
  flag: VarianceFlag;
  canExplain: boolean;
  onExplain: (id: string, explanation: string) => Promise<void>;
}) {
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onExplain(flag.id, explanation);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
      <p style={{ margin: '0 0 4px' }}>
        <span className={`badge ${flag.status === 'OPEN' ? 'review' : 'posted'}`}>{flag.status}</span> {flag.description}
        {flag.amount != null && ` (${fmt(flag.amount)})`}
      </p>
      {flag.explanation && <p className="subtitle">Explanation: {flag.explanation}</p>}
      {flag.status === 'OPEN' && canExplain && (
        <form onSubmit={submit} className="row" style={{ marginTop: 6 }}>
          <input
            required
            placeholder="Explain this gap…"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
          <button type="submit" disabled={submitting} style={{ flex: 'none' }}>
            Explain
          </button>
        </form>
      )}
    </div>
  );
}

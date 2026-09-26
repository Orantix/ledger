'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { AccountLedger } from '@/lib/api';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountLedgerPage({ params }: { params: { accountId: string } }) {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    api
      .getAccountLedger(params.accountId)
      .then(setLedger)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load account'));
  }, [ready, token, params.accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !token) return null;
  if (error) return <p className="error">{error}</p>;
  if (!ledger) return <p className="empty">Loading…</p>;

  const { account } = ledger;

  return (
    <>
      <p style={{ margin: '0 0 var(--space-3)' }}>
        <Link href="/trial-balance">← Trial balance</Link>
      </p>
      <h1>
        {account.code} · {account.name}
      </h1>
      <p className="subtitle">
        {account.type.charAt(0) + account.type.slice(1).toLowerCase()} account — every line posted to it, oldest
        first. Reversed entries and their reversals both stay listed so this always adds up to the trial balance.
      </p>

      <div className="card">
        <div className="ledger-summary">
          <div>
            <span>Total debit</span>
            <strong>{fmt(ledger.totalDebit)}</strong>
          </div>
          <div>
            <span>Total credit</span>
            <strong>{fmt(ledger.totalCredit)}</strong>
          </div>
          <div>
            <span>Balance (debit − credit)</span>
            <strong>{fmt(ledger.balance)}</strong>
          </div>
        </div>

        {ledger.lines.length === 0 ? (
          <p className="empty">Nothing has been posted to this account yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Status</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Running balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.lines.map((l) => (
                <tr key={l.id} className={l.entryStatus === 'REVERSED' ? 'muted-row' : undefined}>
                  <td>{new Date(l.date).toLocaleDateString()}</td>
                  <td>
                    {l.capture ? <Link href={`/captures/${l.capture.id}`}>{l.description}</Link> : l.description}
                  </td>
                  <td>
                    {l.entryStatus === 'REVERSED' ? (
                      <span className="badge reversed">Reversed</span>
                    ) : l.isReversal ? (
                      <span className="badge draft">Reversal</span>
                    ) : (
                      <span className="badge posted">Posted</span>
                    )}
                  </td>
                  <td className="num">{l.debit ? fmt(l.debit) : ''}</td>
                  <td className="num">{l.credit ? fmt(l.credit) : ''}</td>
                  <td className="num">{fmt(l.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

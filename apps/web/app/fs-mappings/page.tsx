'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { Account, AccountFsMapping, CashFlowCategory, FsStatement } from '@/lib/api';

interface Row {
  account: Account;
  statement: FsStatement;
  section: string;
  noteLabel: string;
  cashFlowCategory: CashFlowCategory;
  sortOrder: number;
  dirty: boolean;
}

export default function FsMappingsPage() {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    Promise.all([api.listAccounts(), api.listFsMappings()])
      .then(([accounts, mappings]) => {
        const byAccount = new Map(mappings.map((m: AccountFsMapping) => [m.account.id, m]));
        setRows(
          accounts.map((account) => {
            const m = byAccount.get(account.id);
            const defaultStatement: FsStatement = ['REVENUE', 'EXPENSE'].includes(account.type)
              ? 'INCOME_STATEMENT'
              : 'BALANCE_SHEET';
            return {
              account,
              statement: m?.statement ?? defaultStatement,
              section: m?.section ?? '',
              noteLabel: m?.noteLabel ?? account.name,
              cashFlowCategory: m?.cashFlowCategory ?? 'NONE',
              sortOrder: m?.sortOrder ?? 0,
              dirty: false,
            };
          }),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(accountId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.account.id === accountId ? { ...r, ...patch, dirty: true } : r)));
  }

  async function save(row: Row) {
    setSavingId(row.account.id);
    setError(null);
    try {
      await api.upsertFsMapping({
        accountId: row.account.id,
        statement: row.statement,
        section: row.section,
        noteLabel: row.noteLabel,
        cashFlowCategory: row.cashFlowCategory,
        sortOrder: row.sortOrder,
      });
      setRows((prev) => prev.map((r) => (r.account.id === row.account.id ? { ...r, dirty: false } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  if (!ready || !token) return null;

  return (
    <>
      <h1>FS mappings</h1>
      <p className="subtitle">
        Configure which statement, section and note each account rolls up into. Re-mapping is versioned — nothing
        gets silently rewritten.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Statement</th>
              <th>Section</th>
              <th>Note label</th>
              <th>Cash flow</th>
              <th>Sort</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id}>
                <td>
                  {r.account.code} · {r.account.name}
                </td>
                <td>
                  <select
                    value={r.statement}
                    onChange={(e) => update(r.account.id, { statement: e.target.value as FsStatement })}
                  >
                    <option value="INCOME_STATEMENT">Income Statement</option>
                    <option value="BALANCE_SHEET">Balance Sheet</option>
                  </select>
                </td>
                <td>
                  <input value={r.section} onChange={(e) => update(r.account.id, { section: e.target.value })} />
                </td>
                <td>
                  <input value={r.noteLabel} onChange={(e) => update(r.account.id, { noteLabel: e.target.value })} />
                </td>
                <td>
                  <select
                    value={r.cashFlowCategory}
                    onChange={(e) => update(r.account.id, { cashFlowCategory: e.target.value as CashFlowCategory })}
                  >
                    <option value="NONE">—</option>
                    <option value="OPERATING">Operating</option>
                    <option value="INVESTING">Investing</option>
                    <option value="FINANCING">Financing</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 60 }}
                    value={r.sortOrder}
                    onChange={(e) => update(r.account.id, { sortOrder: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!r.dirty || savingId === r.account.id}
                    onClick={() => save(r)}
                  >
                    {savingId === r.account.id ? 'Saving…' : r.dirty ? 'Save' : 'Saved'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

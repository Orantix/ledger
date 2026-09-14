'use client';

import { useEffect, useState } from 'react';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { JournalEntry } from '@/lib/api';

const REVERSE_ROLES = ['BOOKKEEPER', 'ADMIN'];

export default function JournalEntriesPage() {
  const { ready, token } = useRequireAuth();
  const { user } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);

  function load() {
    api
      .listJournalEntries()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!ready || !token) return;
    load();
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onReverse(entry: JournalEntry) {
    setReversingId(entry.id);
    try {
      await api.reverseJournalEntry(entry.id);
      toast.show('Entry reversed.', 'success');
      setConfirmingId(null);
      load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Failed to reverse', 'error');
    } finally {
      setReversingId(null);
    }
  }

  if (!ready || !token) return null;
  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="error">{error}</p>;

  const canReverse = !!user && REVERSE_ROLES.includes(user.role);

  return (
    <>
      <h1>Journal entries</h1>
      <p className="subtitle">
        Every posting to the ledger, in order. Nothing here is ever edited — a mistake is corrected by reversing
        the entry, which posts an equal-and-opposite entry and leaves both in the record.
      </p>

      {entries.length === 0 ? (
        <p className="empty">No journal entries yet.</p>
      ) : (
        entries.map((entry) => (
          <div className="card" key={entry.id}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0 }}>{entry.description}</h2>
                <p className="subtitle" style={{ margin: 0 }}>
                  {new Date(entry.date).toLocaleDateString()}
                  {entry.capture ? ` · from capture: ${entry.capture.description}` : ''}
                </p>
              </div>
              <span className={`badge ${entry.status === 'REVERSED' ? 'reversed' : 'posted'}`}>
                {entry.status === 'REVERSED' ? 'Reversed' : 'Posted'}
              </span>
            </div>

            {entry.reversalOfId && <p className="subtitle">Reverses a prior entry.</p>}
            {entry.reversedBy && <p className="subtitle">Reversed — see the offsetting entry above/below.</p>}

            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.account.code} · {line.account.name}
                    </td>
                    <td className="num">{Number(line.debit) > 0 ? Number(line.debit).toFixed(2) : ''}</td>
                    <td className="num">{Number(line.credit) > 0 ? Number(line.credit).toFixed(2) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {canReverse && entry.status === 'POSTED' && (
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                {confirmingId === entry.id ? (
                  <>
                    <span className="subtitle" style={{ margin: 0 }}>
                      Post an equal-and-opposite entry to cancel this out?
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onReverse(entry)}
                      disabled={reversingId === entry.id}
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    >
                      {reversingId === entry.id ? 'Reversing…' : 'Confirm reversal'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setConfirmingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="secondary" onClick={() => setConfirmingId(entry.id)}>
                    Reverse this entry
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}

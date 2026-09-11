'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Account, api, Capture } from '@/lib/api';

export default function CaptureDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getCapture(params.id), api.listAccounts()])
      .then(([c, a]) => {
        setCapture(c);
        setAccounts(a);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!capture) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.classifyCapture(capture.id, { expenseAccountId, paymentAccountId, saveAsRule });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!capture) return <p className="empty">Not found.</p>;

  return (
    <>
      <h1>Review capture</h1>
      <p className="subtitle">
        No classification rule matched &ldquo;{capture.category}&rdquo; paid via {capture.paymentMethod}.
        Pick the accounts to post this to.
      </p>

      <div className="card">
        <h2>{capture.description}</h2>
        <p>
          {capture.currency} {Number(capture.amount).toFixed(2)} · {new Date(capture.date).toLocaleDateString()}
          {capture.notes ? ` · ${capture.notes}` : ''}
        </p>
        {capture.attachments.length > 0 && (
          <p className="subtitle">{capture.attachments.length} attachment(s) on file.</p>
        )}
      </div>

      {capture.status !== 'PENDING_REVIEW' ? (
        <div className="card">
          <p>This capture is already {capture.status.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={onSubmit}>
            <label>
              Debit account (expense/asset)
              <select required value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Credit account (how it was paid)
              <select required value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={saveAsRule} onChange={(e) => setSaveAsRule(e.target.checked)} />
              Remember this mapping for &ldquo;{capture.category}&rdquo; + {capture.paymentMethod}
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? 'Posting…' : 'Post to ledger'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

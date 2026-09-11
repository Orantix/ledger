'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { Account, Capture, ReviewReason } from '@/lib/api';

const REASON_LABEL: Record<ReviewReason, string> = {
  NO_RULE: 'No classification rule matched this category and payment method.',
  SENSITIVE_ACCOUNT: 'This touches an equity/related-party account, which always needs a human sign-off.',
  UNUSUAL_AMOUNT: 'This amount is unusually large compared to past captures in this category.',
};

export default function CaptureDetailPage({ params }: { params: { id: string } }) {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const router = useRouter();
  const toast = useToast();

  const [capture, setCapture] = useState<Capture | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    Promise.all([api.getCapture(params.id), api.listAccounts()])
      .then(([c, a]) => {
        setCapture(c);
        setAccounts(a);
        if (c.appliedRule) {
          setExpenseAccountId(c.appliedRule.expenseAccount.id);
          setPaymentAccountId(c.appliedRule.paymentAccount.id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [ready, token, params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!capture) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.classifyCapture(capture.id, { expenseAccountId, paymentAccountId, saveAsRule });
      toast.show('Posted to the ledger.', 'success');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  if (!ready || !token) return null;
  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!capture) return <p className="empty">Not found.</p>;

  return (
    <>
      <h1>Review capture</h1>
      <p className="subtitle">{capture.reviewReason ? REASON_LABEL[capture.reviewReason] : 'Pick the accounts to post this to.'}</p>

      <div className="card">
        <h2>{capture.description}</h2>
        <p>
          {capture.currency} {Number(capture.amount).toFixed(2)} · {new Date(capture.date).toLocaleDateString()}
          {capture.notes ? ` · ${capture.notes}` : ''}
        </p>
        {capture.shareholderName && <p className="subtitle">Related party: {capture.shareholderName}</p>}
        {capture.attachments.length > 0 && (
          <p className="subtitle">
            {capture.attachments.map((a) => (
              <a key={a.id} href={api.attachmentFileUrl(a.id)} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
                📎 {a.filename}
              </a>
            ))}
          </p>
        )}
        {capture.appliedRule && (
          <p className="subtitle">
            Suggested (from a matching rule): {capture.appliedRule.expenseAccount.code} · {capture.appliedRule.expenseAccount.name} /{' '}
            {capture.appliedRule.paymentAccount.code} · {capture.appliedRule.paymentAccount.name} — still requires your confirmation.
          </p>
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

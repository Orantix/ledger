'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { Account, Capture, PaymentMethod, ReviewReason } from '@/lib/api';

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
  const [baseCurrency, setBaseCurrency] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable copy of the capture's own fields — separate from `capture`
  // itself so "Cancel" can discard changes without a re-fetch.
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [currency, setCurrency] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [shareholderName, setShareholderName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function loadFieldsFrom(c: Capture) {
    setDescription(c.description);
    setAmount(String(c.amount));
    setDate(c.date.slice(0, 10));
    setCurrency(c.currency);
    setExchangeRate(String(c.exchangeRate));
    setPaymentMethod(c.paymentMethod);
    setCategory(c.category);
    setNotes(c.notes ?? '');
    setShareholderName(c.shareholderName ?? '');
  }

  useEffect(() => {
    if (!ready || !token) return;
    Promise.all([api.getCapture(params.id), api.listAccounts(), api.getSettings()])
      .then(([c, a, s]) => {
        setCapture(c);
        setAccounts(a);
        setBaseCurrency(s.baseCurrency);
        loadFieldsFrom(c);
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

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!capture) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await api.updateCapture(capture.id, {
        description,
        amount: Number(amount),
        date,
        paymentMethod,
        category,
        notes: notes || undefined,
        currency,
        exchangeRate: currency !== baseCurrency ? Number(exchangeRate) : 1,
        shareholderName: paymentMethod === 'PERSONAL' && shareholderName ? shareholderName : undefined,
      });
      setCapture(updated);
      loadFieldsFrom(updated);
      setEditing(false);
      toast.show('Capture updated.', 'success');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  }

  function onCancelEdit() {
    if (capture) loadFieldsFrom(capture);
    setEditError(null);
    setEditing(false);
  }

  if (!ready || !token) return null;
  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!capture) return <p className="empty">Not found.</p>;

  const canEdit = capture.status !== 'POSTED';

  return (
    <>
      <h1>Review capture</h1>
      <p className="subtitle">{capture.reviewReason ? REASON_LABEL[capture.reviewReason] : 'Pick the accounts to post this to.'}</p>

      <div className="card">
        {!editing ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h2 style={{ margin: 0 }}>{capture.description}</h2>
              {canEdit && (
                <button type="button" className="secondary" onClick={() => setEditing(true)}>
                  Edit details
                </button>
              )}
            </div>
            <p>
              {capture.currency} {Number(capture.amount).toFixed(2)}
              {capture.currency !== baseCurrency && (
                <> (rate {Number(capture.exchangeRate)} → {baseCurrency})</>
              )}{' '}
              · {new Date(capture.date).toLocaleDateString()}
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
          </>
        ) : (
          <form onSubmit={onSaveEdit}>
            <label>
              What was this for?
              <input required value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <div className="row">
              <label>
                Amount
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                Date
                <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>

            <div className="row">
              <label>
                Currency
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </label>
              {currency !== baseCurrency && (
                <label>
                  Exchange rate to {baseCurrency}
                  <input
                    required
                    type="number"
                    step="0.000001"
                    min="0.000001"
                    placeholder="e.g. 300.50"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </label>
              )}
            </div>

            <label>
              How was it paid?
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="BANK">Company bank</option>
                <option value="PERSONAL">My own money (personal draw)</option>
                <option value="CREDIT">Unpaid / on credit</option>
              </select>
            </label>

            {paymentMethod === 'PERSONAL' && (
              <label>
                Whose money was this?
                <input value={shareholderName} onChange={(e) => setShareholderName(e.target.value)} />
              </label>
            )}

            <label>
              Category
              <input required value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>

            <label>
              Notes (optional)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            {editError && <p className="error">{editError}</p>}

            <div className="row">
              <button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="secondary" onClick={onCancelEdit} disabled={savingEdit}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {editing ? null : capture.status !== 'PENDING_REVIEW' ? (
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

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiUploadUrl, PaymentMethod } from '@/lib/api';

const TODAY = new Date().toISOString().slice(0, 10);

export default function NewCapturePage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(TODAY);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const capture = await api.createCapture({
        description,
        amount: Number(amount),
        date,
        paymentMethod,
        category,
        notes: notes || undefined,
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(apiUploadUrl(capture.id), { method: 'POST', body: formData });
        if (!res.ok) {
          throw new Error(`Capture saved, but attachment upload failed: ${await res.text()}`);
        }
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>New capture</h1>
      <p className="subtitle">
        What was it for, how much, and how did you pay? No accounting knowledge needed — we handle the
        ledger side.
      </p>

      <div className="card">
        <form onSubmit={onSubmit}>
          <label>
            What was this for?
            <input
              required
              placeholder="e.g. AWS hosting for October"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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

          <label>
            How was it paid?
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="BANK">Company bank</option>
              <option value="PERSONAL">My own money (personal draw)</option>
              <option value="CREDIT">Unpaid / on credit</option>
            </select>
          </label>

          <label>
            Category
            <input
              required
              list="category-options"
              placeholder="e.g. hosting, legal fees, travel"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="category-options">
              <option value="hosting" />
              <option value="subscriptions" />
              <option value="legal fees" />
              <option value="office supplies" />
              <option value="software" />
              <option value="travel" />
            </datalist>
          </label>

          <label>
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <label>
            Attach receipt / invoice / bill (optional)
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save capture'}
          </button>
        </form>
      </div>
    </>
  );
}

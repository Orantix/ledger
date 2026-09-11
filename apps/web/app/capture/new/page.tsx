'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { Attachment, PaymentMethod } from '@/lib/api';

const TODAY = new Date().toISOString().slice(0, 10);
const BASE_CURRENCY = 'LKR';
const CONFIDENCE_THRESHOLD = 0.6;

export default function NewCapturePage() {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const router = useRouter();
  const toast = useToast();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(TODAY);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [exchangeRate, setExchangeRate] = useState('1');
  const [shareholderName, setShareholderName] = useState('');

  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready || !token) return null;

  async function onFileSelected(file: File | null) {
    if (!file) {
      setAttachment(null);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await api.uploadAttachment(file);
      setAttachment(uploaded);

      const conf = uploaded.extractionConfidence;
      if (!description && uploaded.extractedVendor && (conf?.vendor ?? 0) >= CONFIDENCE_THRESHOLD) {
        setDescription(uploaded.extractedVendor);
      }
      if (!amount && uploaded.extractedAmount && (conf?.amount ?? 0) >= CONFIDENCE_THRESHOLD) {
        setAmount(uploaded.extractedAmount);
      }
      if (uploaded.extractedDate && (conf?.date ?? 0) >= CONFIDENCE_THRESHOLD) {
        setDate(uploaded.extractedDate.slice(0, 10));
      }
      if (uploaded.extractedCurrency && (conf?.currency ?? 0) >= CONFIDENCE_THRESHOLD) {
        setCurrency(uploaded.extractedCurrency);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createCapture({
        description,
        amount: Number(amount),
        date,
        paymentMethod,
        category,
        notes: notes || undefined,
        currency,
        exchangeRate: currency !== BASE_CURRENCY ? Number(exchangeRate) : 1,
        shareholderName: paymentMethod === 'PERSONAL' && shareholderName ? shareholderName : undefined,
        attachmentIds: attachment ? [attachment.id] : undefined,
      });
      toast.show(
        created.status === 'POSTED' ? 'Capture posted to the ledger.' : 'Saved — no rule matched, sent to the review queue.',
        created.status === 'POSTED' ? 'success' : 'info',
      );
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const lowConfidence = (field: 'vendor' | 'amount' | 'date' | 'currency') =>
    attachment?.extractionConfidence && attachment.extractionConfidence[field] > 0 && attachment.extractionConfidence[field] < CONFIDENCE_THRESHOLD;

  return (
    <>
      <h1>New capture</h1>
      <p className="subtitle">
        Attach a receipt to pre-fill the details, or just type them. Either way, tell us how it was paid — no
        accounting knowledge needed.
      </p>

      <div className="card">
        <label>
          Attach receipt / invoice / bill (optional — extracts details automatically)
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
        </label>
        {uploading && <p className="subtitle">Reading document…</p>}
        {uploadError && <p className="error">{uploadError}</p>}
        {attachment && attachment.extractionStatus === 'COMPLETE' && (
          <p className="subtitle">Extracted what we could — please confirm the fields below before saving.</p>
        )}
        {attachment && attachment.extractionStatus === 'UNSUPPORTED' && (
          <p className="subtitle">Couldn&apos;t read this file automatically (likely a scanned PDF) — fill in the fields by hand.</p>
        )}
      </div>

      <div className="card">
        <form onSubmit={onSubmit}>
          <label>
            What was this for? {lowConfidence('vendor') && <em>(low-confidence guess — please check)</em>}
            <input
              required
              placeholder="e.g. AWS hosting for October"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="row">
            <label>
              Amount {lowConfidence('amount') && <em>(low-confidence guess — please check)</em>}
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
              Date {lowConfidence('date') && <em>(low-confidence guess — please check)</em>}
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div className="row">
            <label>
              Currency
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </label>
            {currency !== BASE_CURRENCY && (
              <label>
                Exchange rate to {BASE_CURRENCY}
                <input
                  required
                  type="number"
                  step="0.000001"
                  min="0.000001"
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
              Whose money was this? (optional, tracks the related-party balance)
              <input
                placeholder="e.g. Abdul Faris"
                value={shareholderName}
                onChange={(e) => setShareholderName(e.target.value)}
              />
            </label>
          )}

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

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={submitting || uploading}>
            {submitting ? 'Saving…' : 'Save capture'}
          </button>
        </form>
      </div>
    </>
  );
}

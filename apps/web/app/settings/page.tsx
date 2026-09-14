'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';

export default function SettingsPage() {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const toast = useToast();

  const [baseCurrency, setBaseCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    api
      .getSettings()
      .then((s) => setBaseCurrency(s.baseCurrency))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSettings({ baseCurrency: baseCurrency.toUpperCase() });
      setBaseCurrency(updated.baseCurrency);
      toast.show(`Base currency set to ${updated.baseCurrency}.`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !token) return null;
  if (loading) return <p className="empty">Loading…</p>;

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">Entity-wide configuration that applies across the whole ledger.</p>

      <div className="card">
        <h2>Base currency</h2>
        <p className="subtitle">
          Every capture in a different currency needs an exchange rate to this one — it&apos;s what the trial
          balance, financial statements, and dashboard are all denominated in. Changing it doesn&apos;t convert
          past entries; set it once, before real data goes in.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            ISO currency code
            <input
              required
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              minLength={3}
              pattern="[A-Za-z]{3}"
              placeholder="e.g. LKR, USD, EUR"
              style={{ maxWidth: 160 }}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </>
  );
}

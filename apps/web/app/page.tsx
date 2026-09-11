'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { Capture } from '@/lib/api';

function StatusBadge({ status }: { status: Capture['status'] }) {
  const cls = status === 'POSTED' ? 'posted' : status === 'PENDING_REVIEW' ? 'review' : 'draft';
  const label = status === 'PENDING_REVIEW' ? 'Needs review' : status === 'POSTED' ? 'Posted' : 'Draft';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function CapturesPage() {
  const { ready, token } = useRequireAuth();
  const api = useApi();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !token) return;
    api
      .listCaptures()
      .then(setCaptures)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load captures'))
      .finally(() => setLoading(false));
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !token) return null;

  return (
    <>
      <h1>Captures</h1>
      <p className="subtitle">
        Every transaction entered in plain language, and where it stands in the pipeline.
      </p>

      {error && <p className="error">{error}</p>}
      {loading && !error && <p className="empty">Loading…</p>}

      {!error && !loading && (
        <div className="card">
          {captures.length === 0 ? (
            <p className="empty">No captures yet. Start with &ldquo;New capture&rdquo;.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Paid via</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {captures.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.date).toLocaleDateString()}</td>
                    <td>
                      {c.status === 'PENDING_REVIEW' ? (
                        <Link href={`/captures/${c.id}`}>{c.description}</Link>
                      ) : (
                        c.description
                      )}
                    </td>
                    <td>{c.category}</td>
                    <td>{c.paymentMethod}</td>
                    <td className="num">
                      {c.currency} {Number(c.amount).toFixed(2)}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

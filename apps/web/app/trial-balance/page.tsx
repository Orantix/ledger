import { api, TrialBalance } from '@/lib/api';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TrialBalancePage() {
  let tb: TrialBalance | null = null;
  let error: string | null = null;
  try {
    tb = await api.getTrialBalance();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load trial balance';
  }

  return (
    <>
      <h1>Trial balance</h1>
      <p className="subtitle">Every posted journal entry, summed by account. Debits should equal credits.</p>

      {error && <p className="error">{error}</p>}

      {tb && (
        <div className="card">
          {tb.rows.length === 0 ? (
            <p className="empty">No posted entries yet.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r) => (
                    <tr key={r.accountId}>
                      <td>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.type}</td>
                      <td className="num">{r.totalDebit ? fmt(r.totalDebit) : ''}</td>
                      <td className="num">{r.totalCredit ? fmt(r.totalCredit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total</th>
                    <th className="num">{fmt(tb.totalDebit)}</th>
                    <th className="num">{fmt(tb.totalCredit)}</th>
                  </tr>
                </tfoot>
              </table>
              {Math.round((tb.totalDebit - tb.totalCredit) * 100) !== 0 && (
                <p className="error">Out of balance by {fmt(tb.totalDebit - tb.totalCredit)} — this should never happen.</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

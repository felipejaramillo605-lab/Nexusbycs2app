import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState, SurfaceCard } from '../design';
import { formatCOPMinor as money } from '../../lib/currency';

const PENDING_STATUSES = ['draft', 'issued', 'pending', 'overdue'];
const BUCKETS = [
  { key: 'current', label: 'Al día' },
  { key: 'd1_30', label: '1-30 días' },
  { key: 'd31_60', label: '31-60 días' },
  { key: 'd60_plus', label: 'Más de 60 días' },
];

const daysOverdue = (dueAt) => {
  if (!dueAt) return 0;
  const due = new Date(dueAt.slice(0, 10));
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.floor((today - due) / 86400000);
};

const bucketFor = (days) => {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  return 'd60_plus';
};

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 8): the first real Cartera delivery
// beyond just aliasing OwnerSubscriptions to a new URL -- an aging summary
// for the organization already selected on this page, computed entirely
// from `invoices`, which this page already fetches. Deliberately does NOT
// aggregate across organizations: that "vista global de cartera" needs a
// real backend endpoint that doesn't exist yet (plan PR 14), so building it
// here would mean either a fake number or an expensive per-org fetch loop
// neither the plan nor the existing API surface supports honestly.
export default function CarteraAgingCard({ invoices }) {
  const { totals, counts, currency } = useMemo(() => {
    const totals = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
    const counts = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
    let currency = 'COP';
    invoices.filter((row) => PENDING_STATUSES.includes(row.status)).forEach((row) => {
      const bucket = bucketFor(daysOverdue(row.due_at));
      totals[bucket] += row.amount_minor || 0;
      counts[bucket] += 1;
      currency = row.currency || currency;
    });
    return { totals, counts, currency };
  }, [invoices]);

  const totalPending = BUCKETS.reduce((sum, { key }) => sum + totals[key], 0);
  const hasPending = BUCKETS.some(({ key }) => counts[key] > 0);

  return (
    <SurfaceCard>
      <h2>Antigüedad de cartera</h2>
      <p>Saldo pendiente de esta organización, agrupado por días de vencimiento.</p>
      {!hasPending ? (
        <EmptyState icon={AlertTriangle} title="Sin saldo pendiente" description="Esta organización no tiene facturas abiertas." />
      ) : (
        <>
          <div className="nexus-table-wrap">
            <table className="nexus-table">
              <thead>
                <tr>{BUCKETS.map(({ key, label }) => <th key={key}>{label}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  {BUCKETS.map(({ key }) => (
                    <td key={key}>{money(totals[key], currency)} <span>({counts[key]})</span></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p><strong>Total pendiente:</strong> {money(totalPending, currency)}</p>
        </>
      )}
    </SurfaceCard>
  );
}

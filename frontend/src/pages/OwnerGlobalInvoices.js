import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Receipt, Search } from 'lucide-react';
import { toast } from 'sonner';
import { billingAPI, subscriptionAPI } from '../api';
import { ActionButton, AnimatedNumber, EmptyState, MetricCard, MotionPage, PageHeader, ResponsiveDataView, SegmentedControl, StatusBadge, SurfaceCard } from '../components/design';
import { formatCOPMinor as money } from '../lib/currency';

const invoiceLabels = { draft: 'Borrador', issued: 'Emitida', pending: 'Pendiente', paid: 'Pagada', overdue: 'Vencida', void: 'Anulada', refunded: 'Reembolsada' };
// Matches InvoicesTableCard's exact tone logic (paid=success, overdue=danger,
// everything else=warning) so a status reads the same color across both pages.
const toneFor = (status) => (status === 'paid' ? 'success' : status === 'overdue' ? 'danger' : 'warning');
const safeDetail = (e) => e.response?.data?.detail || 'No fue posible cargar las facturas';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 17): the first browsable global
// invoices view -- everything before this either showed one organization's
// invoices at a time (InvoicesTableCard, inside OwnerSubscriptions) or only
// bucketed totals with no individual rows (CarteraAgingCard is per-org too;
// billing/summary from plan PR 14 had no frontend consumer at all until this
// page). Read-only: pay/void/refund actions stay on the per-organization
// page where they already have the audit-trail context (organizationName,
// reload wiring) this page doesn't have reason to duplicate.
export default function OwnerGlobalInvoices() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('all');
  const [invoiceType, setInvoiceType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await subscriptionAPI.getAllInvoices({
        page,
        page_size: 25,
        search: applied || undefined,
        status: status === 'all' ? undefined : status,
        invoice_type: invoiceType === 'all' ? undefined : invoiceType,
      });
      setRows(r.data.items || []);
      setMeta(r.data);
    } catch (e) {
      toast.error(safeDetail(e));
    } finally {
      setLoading(false);
    }
  }, [page, applied, status, invoiceType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    subscriptionAPI.getBillingSummary().then((r) => setSummary(r.data)).catch(() => setSummary(null));
  }, []);

  const search = (e) => { e.preventDefault(); setPage(1); setApplied(query.trim()); };
  const changeStatus = (v) => { setStatus(v); setPage(1); };
  const changeType = (v) => { setInvoiceType(v); setPage(1); };

  const downloadInvoice = async (row) => {
    setBusy(row.invoice_id);
    try {
      const response = await billingAPI.downloadPdf(row.invoice_id, { organization_id: row.organization_id });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${row.invoice_number || row.invoice_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(safeDetail(e));
    } finally {
      setBusy('');
    }
  };

  const columns = [
    { key: 'organization', label: 'Organización', render: (x) => <strong>{x.buyer_snapshot?.organization_name || x.buyer_snapshot?.legal_name || x.organization_id}</strong> },
    { key: 'number', label: 'Número', render: (x) => x.invoice_number || x.invoice_id },
    { key: 'type', label: 'Tipo', render: (x) => x.invoice_type === 'premium_surcharge' ? 'Excedente Premium' : 'Mensual' },
    { key: 'issued', label: 'Emitida', render: (x) => x.issued_at?.slice(0, 10) || '—' },
    { key: 'due', label: 'Vence', render: (x) => x.due_at?.slice(0, 10) || '—' },
    { key: 'amount', label: 'Valor', render: (x) => money(x.amount_minor, x.currency) },
    { key: 'status', label: 'Estado', render: (x) => <StatusBadge tone={toneFor(x.status)}>{invoiceLabels[x.status] || x.status}</StatusBadge> },
    { key: 'actions', label: 'Acción', align: 'right', render: (x) => <ActionButton variant="secondary" icon={Download} loading={busy === x.invoice_id} onClick={() => downloadInvoice(x)}>PDF</ActionButton> },
  ];

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader eyebrow="Cartera y facturación" title="Facturas globales" description="Busca y filtra facturas de todas las organizaciones en un solo lugar." />
      {summary && (
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Saldo pendiente" value={money(summary.total_pending_minor, summary.currency)} icon={Receipt} />
          <MetricCard label="Organizaciones con saldo" value={<AnimatedNumber value={summary.organizations_with_balance || 0} format={(v) => Math.round(v)} />} icon={Receipt} />
          <MetricCard label="Facturas pendientes" value={<AnimatedNumber value={summary.invoice_count || 0} format={(v) => Math.round(v)} />} icon={Receipt} />
          <MetricCard label="Más de 60 días vencidas" value={<AnimatedNumber value={summary.buckets?.d60_plus?.count || 0} format={(v) => Math.round(v)} />} icon={Receipt} />
        </section>
      )}
      <SurfaceCard>
        <div className="nexus-owner-toolbar">
          <form onSubmit={search}>
            <label><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar organización o número de factura" /></label>
          </form>
          <SegmentedControl value={status} onChange={changeStatus} options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'pending', label: 'Pendiente' },
            { value: 'overdue', label: 'Vencida' },
            { value: 'paid', label: 'Pagada' },
            { value: 'void', label: 'Anulada' },
            { value: 'refunded', label: 'Reembolsada' },
          ]} />
          <SegmentedControl value={invoiceType} onChange={changeType} options={[
            { value: 'all', label: 'Todos los tipos' },
            { value: 'premium_surcharge', label: 'Excedente Premium' },
          ]} />
        </div>
        {loading ? (
          <div className="nexus-loading-state"><div className="nexus-skeleton-row" /><div className="nexus-skeleton-row" /></div>
        ) : (
          <ResponsiveDataView
            items={rows}
            columns={columns}
            rowKey={(x) => x.invoice_id}
            empty={<EmptyState icon={FileText} title="Sin facturas" description="Ajusta la búsqueda o los filtros." />}
            renderCard={(x) => (
              <div>
                <div className="flex justify-between gap-3">
                  <strong>{x.buyer_snapshot?.organization_name || x.organization_id}</strong>
                  <StatusBadge tone={toneFor(x.status)}>{invoiceLabels[x.status] || x.status}</StatusBadge>
                </div>
                <p>{x.invoice_number || x.invoice_id} · {money(x.amount_minor, x.currency)}</p>
                <small>Vence {x.due_at?.slice(0, 10) || '—'}</small>
              </div>
            )}
          />
        )}
        <div className="flex justify-between items-center gap-3 mt-5">
          <small>Página {meta.page || 1} de {meta.total_pages || 1} · {meta.total || 0} resultado(s)</small>
          <div className="flex gap-2">
            <ActionButton variant="secondary" icon={ChevronLeft} disabled={!meta.has_previous || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</ActionButton>
            <ActionButton variant="secondary" icon={ChevronRight} disabled={!meta.has_next || loading} onClick={() => setPage((p) => p + 1)}>Siguiente</ActionButton>
          </div>
        </div>
      </SurfaceCard>
    </MotionPage>
  );
}

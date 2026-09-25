import React, { useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { billingAPI, subscriptionAPI } from '../../api';
import { AccessibleModal, ActionButton, EmptyState, StatusBadge, SurfaceCard } from '../design';
import { formatCOPMinor as money } from '../../lib/currency';

const invoiceLabels = { draft: 'Borrador', issued: 'Emitida', pending: 'Pendiente', paid: 'Pagada', overdue: 'Vencida', void: 'Anulada', refunded: 'Reembolsada' };
const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6, eighth and final increment). This is the most delicate piece of the
// whole decomposition -- it's the one with the most pre-existing regression
// coverage (4 of the 5 original OwnerSubscriptions.test.jsx tests exercise it:
// PDF download, void/refund reason dialog, payment idempotency-key reuse on
// retry, and the Premium-lock 409 message). Those tests render the parent page
// and interact through the DOM, so as long as this card renders the identical
// markup and wires the identical handlers, they keep passing without changes.
//
// `busy`, `invoiceAction`, `paymentReference`, `actionReason` and the
// idempotency-key ref were only ever read/written by these three handlers in
// the original file -- nothing else in OwnerSubscriptions.js touched them, so
// moving all of it here in one piece is a pure relocation, not a behavior change.
export default function InvoicesTableCard({ invoices, organizationId, organizationName, onReload }) {
  const [busy, setBusy] = useState('');
  const [invoiceAction, setInvoiceAction] = useState(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [actionReason, setActionReason] = useState('');
  const requestIds = useRef({});

  const stableRequestId = (key) => {
    if (!requestIds.current[key]) {
      requestIds.current[key] = `owner-${key}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    }
    return requestIds.current[key];
  };

  const pay = async () => {
    const row = invoiceAction?.row, reference = paymentReference.trim();
    if (!row || reference.length < 3) {
      toast.error('La referencia debe tener al menos 3 caracteres');
      return;
    }
    setBusy(row.invoice_id);
    try {
      await subscriptionAPI.confirmManualPayment(organizationId, row.invoice_id, {
        amount_minor: row.amount_minor,
        currency: row.currency,
        provider_reference: reference,
        idempotency_key: stableRequestId(`pay-${row.invoice_id}`),
        notes: 'Confirmado desde administración Owner',
      });
      delete requestIds.current[`pay-${row.invoice_id}`];
      toast.success('Pago confirmado');
      setInvoiceAction(null);
      setPaymentReference('');
      await onReload();
    } catch (err) {
      toast.error(detail(err, 'No fue posible confirmar el pago'));
    } finally {
      setBusy('');
    }
  };

  const changeInvoiceState = async () => {
    const { row, status } = invoiceAction || {};
    const reason = actionReason.trim();
    if (!row || reason.length < 3 || reason.length > 500) {
      toast.error('El motivo debe tener entre 3 y 500 caracteres');
      return;
    }
    setBusy(row.invoice_id);
    try {
      await subscriptionAPI.changeInvoiceState(organizationId, row.invoice_id, { status, reason });
      toast.success(status === 'void' ? 'Factura anulada' : 'Factura reembolsada');
      setInvoiceAction(null);
      setActionReason('');
      await onReload();
    } catch (err) {
      const message = detail(err, 'No fue posible actualizar la factura');
      toast.error(err.response?.status === 409 && status === 'refunded' ? 'Desactiva Premium antes de reembolsar' : message);
    } finally {
      setBusy('');
    }
  };

  const downloadInvoice = async (row) => {
    setBusy(`pdf-${row.invoice_id}`);
    try {
      const response = await billingAPI.downloadPdf(row.invoice_id, { organization_id: organizationId });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${row.invoice_number || row.invoice_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(detail(err, 'No fue posible descargar el PDF'));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <SurfaceCard>
        <h2>Facturas</h2>
        {!invoices.length ? (
          <EmptyState icon={FileText} title="Sin facturas" description="Emite la primera factura mensual para esta organización." />
        ) : (
          <div className="nexus-table-wrap">
            <table className="nexus-table">
              <thead>
                <tr><th>Periodo</th><th>Vence</th><th>Valor</th><th>Estado</th><th>Acción</th></tr>
              </thead>
              <tbody>
                {invoices.map((row) => (
                  <tr key={row.invoice_id}>
                    <td>{row.period_start?.slice(0, 10)} a {row.period_end?.slice(0, 10)}</td>
                    <td>{row.due_at?.slice(0, 10)}</td>
                    <td>{money(row.amount_minor, row.currency)}</td>
                    <td><StatusBadge tone={row.status === 'paid' ? 'success' : row.status === 'overdue' ? 'danger' : 'warning'}>{invoiceLabels[row.status] || row.status}</StatusBadge></td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton variant="secondary" icon={Download} loading={busy === `pdf-${row.invoice_id}`} onClick={() => downloadInvoice(row)}>PDF</ActionButton>
                        {row.status === 'paid' ? (
                          <>
                            <span>Pago confirmado</span>
                            <ActionButton variant="destructive" onClick={() => { setActionReason(''); setInvoiceAction({ row, status: 'refunded' }); }}>Reembolsar</ActionButton>
                          </>
                        ) : ['void', 'refunded'].includes(row.status) ? (
                          <span>Sin acciones</span>
                        ) : (
                          <>
                            <ActionButton onClick={() => { setPaymentReference(''); setInvoiceAction({ row, kind: 'pay' }); }} disabled={busy === row.invoice_id}>Confirmar pago</ActionButton>
                            <ActionButton variant="secondary" onClick={() => { setActionReason(''); setInvoiceAction({ row, status: 'void' }); }}>Anular</ActionButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
      {invoiceAction && (
        <AccessibleModal
          open={!!invoiceAction}
          onClose={() => !busy && setInvoiceAction(null)}
          role={invoiceAction.kind === 'pay' ? 'dialog' : 'alertdialog'}
          labelledBy="owner-invoice-action-title"
          describedBy="owner-invoice-action-description"
          panelClassName="nexus-accessible-modal-panel"
        >
          <h2 id="owner-invoice-action-title">{invoiceAction.kind === 'pay' ? 'Confirmar pago manual' : invoiceAction.status === 'void' ? 'Anular factura' : 'Reembolsar factura'}</h2>
          <p id="owner-invoice-action-description">
            {invoiceAction.kind === 'pay' ? 'Ingresa la referencia del pago que ya recibiste.' : `La acción quedará registrada en la auditoría de ${organizationName || 'la organización'}.`}
          </p>
          {invoiceAction.kind === 'pay' ? (
            <label>Referencia del pago<input className="nexus-field" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} minLength={3} maxLength={200} required /></label>
          ) : (
            <label>Motivo (3 a 500 caracteres)<textarea className="nexus-field" value={actionReason} onChange={(e) => setActionReason(e.target.value)} minLength={3} maxLength={500} required /></label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <ActionButton variant="secondary" disabled={!!busy} onClick={() => setInvoiceAction(null)}>Cancelar</ActionButton>
            <ActionButton
              variant={invoiceAction.kind === 'pay' ? 'primary' : 'destructive'}
              loading={busy === invoiceAction.row.invoice_id}
              disabled={invoiceAction.kind === 'pay' ? paymentReference.trim().length < 3 : actionReason.trim().length < 3 || actionReason.trim().length > 500}
              onClick={invoiceAction.kind === 'pay' ? pay : changeInvoiceState}
            >
              {invoiceAction.kind === 'pay' ? 'Confirmar pago' : invoiceAction.status === 'void' ? 'Anular factura' : 'Reembolsar'}
            </ActionButton>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}

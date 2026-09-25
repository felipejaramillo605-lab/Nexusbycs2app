import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ownerPremiumPlanAPI, subscriptionAPI } from '../api';
import { ActionButton, confirmAction, EmptyState, SurfaceCard } from './design';
import { formatCOPMinor as money } from '../lib/currency';

const unpaidManualStatuses = new Set(['draft', 'issued', 'pending', 'overdue']);
const defaultSurchargeDueAt = () => { const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); };
const PREMIUM_SURCHARGE_COP = 70000;
const detail = (error, fallback) => {
  const status = error.response?.status;
  if (status === 403) return 'No tienes autorización para administrar el plan Premium.';
  if (status === 409) return 'La solicitud o factura cambió. Actualiza la información antes de continuar.';
  if (status === 503) return 'El servicio no pudo confirmar el cambio. Actualiza antes de volver a intentarlo.';
  return error.response?.data?.detail || fallback;
};

export default function OwnerPremiumPlanPanel({ organizationId, organizationName, invoices, reload, onSelectOrganization }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [invoiceByRequest, setInvoiceByRequest] = useState({});
  const [reasonByRequest, setReasonByRequest] = useState({});
  const [surchargeDueAtByRequest, setSurchargeDueAtByRequest] = useState({});
  const [entitlementReason, setEntitlementReason] = useState('Activación administrativa tras pago de factura Premium');
  const operationIds = useRef({});

  const operationId = key => {
    if (!operationIds.current[key]) operationIds.current[key] = ownerPremiumPlanAPI.createRequestId();
    return operationIds.current[key];
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await ownerPremiumPlanAPI.listRequests();
      setRequests(response.data?.requests || []);
    } catch (error) {
      toast.error(detail(error, 'No fue posible cargar las solicitudes Premium'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const eligibleInvoices = useMemo(() => invoices.filter(invoice =>
    invoice.organization_id === organizationId && invoice.provider === 'manual' &&
    unpaidManualStatuses.has(invoice.status) && !invoice.invoice_purpose && !invoice.premium_request_id,
  ), [invoices, organizationId]);
  const linkedInvoice = request => request.organization_id === organizationId && invoices.find(invoice =>
    invoice.organization_id === organizationId && invoice.provider === 'manual' && invoice.premium_request_id === request.request_id &&
    invoice.invoice_purpose === 'premium_plan_excess',
  );

  // NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 12): replaces the discount-field
  // workaround (150,000 − 80,000 = 70,000) the Owner previously had to use
  // to fake the surcharge amount through the generic monthly-invoice form --
  // this calls the dedicated, correctly-priced endpoint instead. The newly
  // created invoice is unpaid/unpurposed, so it immediately shows up in
  // `eligibleInvoices` below for the existing "Asociar factura" step -- this
  // only replaces how the invoice gets CREATED, not how it gets linked.
  const issueSurcharge = async request => {
    const dueAt = surchargeDueAtByRequest[request.request_id] || defaultSurchargeDueAt();
    const busyKey = `surcharge:${request.request_id}`;
    setBusy(busyKey);
    try {
      const response = await subscriptionAPI.createPremiumSurcharge(organizationId, { due_at: `${dueAt}T23:59:59+00:00` });
      toast.success('Factura de excedente emitida');
      setInvoiceByRequest({ ...invoiceByRequest, [request.request_id]: response.data.invoice_id });
      await Promise.all([refresh(), reload()]);
    } catch (error) {
      toast.error(detail(error, 'No fue posible emitir la factura de excedente'));
    } finally {
      setBusy('');
    }
  };

  const linkInvoice = async request => {
    const invoiceId = invoiceByRequest[request.request_id];
    const reason = (reasonByRequest[request.request_id] || '').trim();
    if (!invoiceId || !reason) return;
    const busyKey = `link:${request.request_id}`;
    const key = `${busyKey}:${invoiceId}:${reason}`;
    setBusy(busyKey);
    try {
      await ownerPremiumPlanAPI.linkInvoice(request.request_id, { invoice_id: invoiceId, reason }, operationId(key));
      delete operationIds.current[key];
      toast.success('Factura asociada a la solicitud Premium');
      await Promise.all([refresh(), reload()]);
    } catch (error) {
      toast.error(detail(error, 'No fue posible asociar la factura'));
      if ([409, 503].includes(error.response?.status)) await Promise.all([refresh(), reload()]);
    } finally {
      setBusy('');
    }
  };

  const setEntitlement = async (request, contracted) => {
    const invoice = linkedInvoice(request);
    const reason = entitlementReason.trim();
    const paidAmount = Number(invoice?.paid_amount_minor);
    const amount = Number(invoice?.amount_minor);
    const balance = Number(invoice?.balance_minor);
    const paidInFull = Boolean(invoice && invoice.status === 'paid' && Number.isFinite(balance) && balance <= 0 && Number.isFinite(paidAmount) && Number.isFinite(amount) && paidAmount >= amount);
    if (!reason || (contracted && !paidInFull)) return;
    const confirmation = contracted
      ? `Activar Premium para ${request.organization_name || organizationName || 'esta organización'} usando la factura ${invoice.invoice_number || invoice.invoice_id}, pagada por completo.`
      : `Desactivar Premium para ${request.organization_name || organizationName || 'esta organización'}?`
    if (!await confirmAction(confirmation, { title: contracted ? 'Activar Premium' : 'Desactivar Premium', confirmLabel: contracted ? 'Activar Premium' : 'Desactivar Premium', tone: contracted ? 'warning' : 'danger' })) return;
    const busyKey = `entitlement:${request.request_id}:${contracted}`;
    const key = `${busyKey}:${invoice?.invoice_id || ''}:${reason}`;
    setBusy(busyKey);
    try {
      await ownerPremiumPlanAPI.setEntitlement(organizationId, {
        contracted,
        reason,
        premium_request_id: request.request_id,
        invoice_id: invoice?.invoice_id,
      }, operationId(key));
      delete operationIds.current[key];
      toast.success(contracted ? 'Plan Premium activado' : 'Plan Premium desactivado');
      await Promise.all([refresh(), reload()]);
    } catch (error) {
      toast.error(detail(error, 'No fue posible actualizar el plan Premium'));
      if ([409, 503].includes(error.response?.status)) await Promise.all([refresh(), reload()]);
    } finally {
      setBusy('');
    }
  };

  return <SurfaceCard>
    <div className="flex items-center justify-between gap-3"><div><h2>Plan Premium</h2><p>Solicitudes, facturas manuales y acceso a plantillas Premium para {organizationName || 'esta organización'}.</p></div><ActionButton variant="secondary" icon={RefreshCw} onClick={refresh} disabled={loading}>Actualizar</ActionButton></div>
    {loading && !requests.length ? <p role="status">Cargando solicitudes Premium…</p> : !requests.length ? <EmptyState icon={Sparkles} title="Sin solicitudes Premium" description="Las solicitudes de los managers aparecerán aquí."/> : <ul className="nexus-audit-list">
      {requests.map(request => {
        const selected = request.organization_id === organizationId;
        const invoice = linkedInvoice(request);
        const paidAmount = Number(invoice?.paid_amount_minor);
        const amount = Number(invoice?.amount_minor);
        const balance = Number(invoice?.balance_minor);
        const paidInFull = Boolean(invoice && invoice.status === 'paid' && Number.isFinite(balance) && balance <= 0 && Number.isFinite(paidAmount) && Number.isFinite(amount) && paidAmount >= amount);
        return <li key={request.request_id} className="block">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{request.organization_name || organizationName || 'Organización'} · {request.status === 'active' ? 'Premium activo' : 'Solicitud pendiente'}</strong><time>{String(request.created_at || '').slice(0, 10)}</time></div>
          <span>Solicitud {request.request_id}</span>
          {!selected && <ActionButton variant="secondary" onClick={() => onSelectOrganization?.(request.organization_id)}>Administrar organización</ActionButton>}
          {selected && request.status === 'pending' && !invoice && <div className="nexus-guided-form mt-3">
            <label><span>Vencimiento del excedente ({money(PREMIUM_SURCHARGE_COP * 100, 'COP')})</span><input type="date" value={surchargeDueAtByRequest[request.request_id] || defaultSurchargeDueAt()} onChange={event => setSurchargeDueAtByRequest({ ...surchargeDueAtByRequest, [request.request_id]: event.target.value })}/></label>
            <ActionButton icon={FileText} disabled={busy === `surcharge:${request.request_id}`} onClick={() => issueSurcharge(request)}>Emitir factura de excedente</ActionButton>
            <label><span>O selecciona una factura manual ya existente de esta organización</span><select value={invoiceByRequest[request.request_id] || ''} onChange={event => setInvoiceByRequest({ ...invoiceByRequest, [request.request_id]: event.target.value })}><option value="">Seleccionar factura</option>{eligibleInvoices.map(row => <option key={row.invoice_id} value={row.invoice_id} label={`${row.invoice_number || row.invoice_id} · ${row.status} · ${money(row.amount_minor, row.currency)}`}/>)}</select></label>
            <label><span>Motivo de asociación</span><textarea value={reasonByRequest[request.request_id] || ''} onChange={event => setReasonByRequest({ ...reasonByRequest, [request.request_id]: event.target.value })} required/></label>
            <ActionButton icon={FileText} disabled={!invoiceByRequest[request.request_id] || !(reasonByRequest[request.request_id] || '').trim() || busy === `link:${request.request_id}`} onClick={() => linkInvoice(request)}>Asociar factura</ActionButton>
          </div>}
          {invoice && <p><strong>Factura Premium:</strong> {invoice.invoice_number || invoice.invoice_id} · {invoice.status} · {money(invoice.amount_minor, invoice.currency)}{paidInFull ? ' · pagada completamente' : ''}</p>}
          {selected && request.status === 'pending' && invoice && !paidInFull && <p>Confirma el pago manual completo desde la tabla Facturas. La activación estará disponible después de actualizar esta página.</p>}
          {selected && request.status === 'pending' && invoice && paidInFull && <div className="mt-2"><label><span>Motivo del cambio de acceso</span><input value={entitlementReason} onChange={event => setEntitlementReason(event.target.value)}/></label><ActionButton icon={ShieldCheck} disabled={!entitlementReason.trim() || busy === `entitlement:${request.request_id}:true`} onClick={() => setEntitlement(request, true)}>Activar Premium</ActionButton></div>}
          {selected && request.status === 'active' && <div className="mt-2"><label><span>Motivo para desactivar</span><input value={entitlementReason} onChange={event => setEntitlementReason(event.target.value)}/></label><ActionButton variant="secondary" disabled={!entitlementReason.trim() || busy === `entitlement:${request.request_id}:false`} onClick={() => setEntitlement(request, false)}>Desactivar Premium</ActionButton></div>}
        </li>;
      })}
    </ul>}
  </SurfaceCard>;
}

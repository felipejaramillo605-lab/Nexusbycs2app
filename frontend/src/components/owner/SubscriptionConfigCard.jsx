import React, { useEffect, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { subscriptionAPI } from '../../api';
import { ActionButton, FieldGuide, SurfaceCard } from '../design';

const statuses = { trial: 'Prueba', active: 'Activa', grace_period: 'Periodo de gracia', past_due: 'Vencida', suspended: 'Suspendida', cancelled: 'Cancelada', indefinite_block: 'Bloqueo indefinido' };
const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const asIso = (value) => (value ? `${value}T12:00:00+00:00` : '');
const detail = (error, fallback) => error.response?.data?.detail || fallback;

const DEFAULT_FORM = { plan_code: 'nexus_monthly', monthly_amount: '150000', currency: 'COP', billing_day: 1, status: 'active', contract_term: 'monthly', trial_days: 0, reason: 'Configuración mensual de la organización' };
const DEFAULT_INVOICE = {
  period_start: isoDay(0).slice(0, 8) + '01',
  period_end: isoDay(30),
  due_at: isoDay(10),
  amount: '150000',
  discount: '0',
  discount_reason: '',
  service_description: 'Suscripción o membresía a Nexus by CS2 por un mes.',
  currency: 'COP',
  notes: 'Factura mensual',
};

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6, seventh increment). Kept together in one component rather than
// split in two, on purpose: the invoice form's discount field reads
// `form.monthly_amount` live to compute the discounted amount, so splitting
// them would either break that coupling or require awkward prop-threading
// between siblings for no real benefit.
//
// Two behavior details preserved exactly, both easy to get wrong here:
// - `form` is only overwritten when `subscription` is truthy (mirrors the
//   original `if (s.data) setForm(...)`) -- an organization with no
//   subscription configured yet leaves whatever was on screen untouched
//   rather than resetting to the blank defaults. Looks like a quirk, but
//   changing it would be a behavior change, not just a refactor.
// - `invoice` is never reset by an organization switch or by a successful
//   submission -- the original never touched it outside the field's own
//   onChange handlers, so this preserves the draft across both.
export default function SubscriptionConfigCard({ subscription, organizationId, onReload }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [invoice, setInvoice] = useState(DEFAULT_INVOICE);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  useEffect(() => {
    if (subscription) {
      setForm({
        plan_code: subscription.plan_code,
        monthly_amount: String((subscription.monthly_amount_minor || 0) / 100),
        currency: subscription.currency,
        billing_day: subscription.billing_day,
        status: subscription.status,
        contract_term: subscription.contract_term || 'monthly',
        trial_days: subscription.trial_days || 0,
        reason: 'Actualización administrativa de la suscripción',
      });
    }
  }, [subscription]);

  const save = async (e) => {
    e.preventDefault();
    setSavingSubscription(true);
    try {
      await subscriptionAPI.save(organizationId, {
        plan_code: form.plan_code.trim(),
        monthly_amount_minor: Math.round(Number(form.monthly_amount) * 100),
        currency: form.currency.toUpperCase(),
        billing_day: Number(form.billing_day),
        status: form.status,
        contract_term: form.contract_term,
        trial_days: Number(form.trial_days),
        reason: form.reason.trim(),
      });
      toast.success('Suscripción guardada');
      await onReload();
    } catch (err) {
      toast.error(detail(err, 'No fue posible guardar'));
    } finally {
      setSavingSubscription(false);
    }
  };

  const createInvoice = async (e) => {
    e.preventDefault();
    setCreatingInvoice(true);
    try {
      await subscriptionAPI.createInvoice(organizationId, {
        period_start: asIso(invoice.period_start),
        period_end: asIso(invoice.period_end),
        due_at: asIso(invoice.due_at),
        amount_minor: Math.round(Number(invoice.amount) * 100),
        discount_minor: Math.round(Number(invoice.discount || 0) * 100),
        discount_reason: invoice.discount_reason || null,
        service_description: invoice.service_description,
        currency: invoice.currency.toUpperCase(),
        notes: invoice.notes || null,
      });
      toast.success('Factura emitida');
      await onReload();
    } catch (err) {
      toast.error(detail(err, 'No fue posible emitir la factura'));
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <div className="nexus-subscription-grid">
      <SurfaceCard>
        <h2>Configuración mensual</h2>
        <form className="nexus-guided-form" onSubmit={save}>
          <label><FieldGuide label="Código del plan" hint="Identificador estable del plan contratado." example="nexus_monthly" required /><input value={form.plan_code} onChange={(e) => setForm({ ...form, plan_code: e.target.value })} required /></label>
          <label><FieldGuide label="Valor mensual" unit="COP" hint="Escribe pesos completos. Nexus almacena el valor en centavos." example="150000" required /><input type="number" min="0" step="1" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} required /></label>
          <label><FieldGuide label="Moneda" example="COP" required /><input maxLength="3" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required /></label>
          <label><FieldGuide label="Día de cobro" hint="Entre 1 y 28 para evitar fechas inexistentes." required /><input type="number" min="1" max="28" value={form.billing_day} onChange={(e) => setForm({ ...form, billing_day: e.target.value })} required /></label>
          <label><FieldGuide label="Estado" required /><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><FieldGuide label="Duración del contrato" hint="Mensual, seis meses o un año." required /><select value={form.contract_term} onChange={(e) => setForm({ ...form, contract_term: e.target.value })}><option value="monthly">Mensual</option><option value="six_months">6 meses</option><option value="annual">1 año</option></select></label>
          <label><FieldGuide label="Prueba gratuita" hint="No genera factura automáticamente." /><select value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}><option value={0}>Sin prueba</option><option value={15}>15 días gratis</option></select></label>
          <label className="nexus-field-wide"><FieldGuide label="Motivo" hint="Quedará registrado en auditoría." required /><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></label>
          <ActionButton type="submit" icon={Save} disabled={savingSubscription}>{savingSubscription ? 'Guardando…' : 'Guardar suscripción'}</ActionButton>
        </form>
      </SurfaceCard>
      <SurfaceCard>
        <h2>Emitir factura</h2>
        <form className="nexus-guided-form" onSubmit={createInvoice}>
          {[['period_start', 'Inicio del periodo'], ['period_end', 'Fin del periodo'], ['due_at', 'Fecha límite']].map(([k, l]) => (
            <label key={k}><FieldGuide label={l} required /><input type="date" value={invoice[k]} onChange={(e) => setInvoice({ ...invoice, [k]: e.target.value })} required /></label>
          ))}
          <label><FieldGuide label="Valor de la factura" unit="COP" required /><input type="number" min="0" step="1" value={invoice.amount} onChange={(e) => setInvoice({ ...invoice, amount: e.target.value })} required /></label>
          <label><FieldGuide label="Descuento excepcional" unit="COP" hint="Sólo aplica a este periodo." /><input type="number" min="0" step="1" value={invoice.discount} onChange={(e) => setInvoice({ ...invoice, discount: e.target.value, amount: String(Math.max(0, Number(form.monthly_amount || 0) - Number(e.target.value || 0))) })} /></label>
          <label className="nexus-field-wide"><FieldGuide label="Motivo del descuento" hint="Obligatorio cuando hay descuento." /><textarea value={invoice.discount_reason} onChange={(e) => setInvoice({ ...invoice, discount_reason: e.target.value })} /></label>
          <label className="nexus-field-wide"><FieldGuide label="Descripción del servicio" required /><textarea value={invoice.service_description} onChange={(e) => setInvoice({ ...invoice, service_description: e.target.value })} required /></label>
          <label><FieldGuide label="Moneda" required /><input maxLength="3" value={invoice.currency} onChange={(e) => setInvoice({ ...invoice, currency: e.target.value })} required /></label>
          <label className="nexus-field-wide"><FieldGuide label="Notas" optional /><textarea value={invoice.notes} onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })} /></label>
          <ActionButton type="submit" icon={FileText} disabled={!subscription || creatingInvoice}>Emitir factura</ActionButton>
        </form>
      </SurfaceCard>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CreditCard, Loader2, RefreshCw, WalletCards, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { settlementAPI, settlementWorkflowAPI } from '../api';
import { toast } from 'sonner';

// NEXUS_STAFF_SETTLEMENTS_UI_V1
const money = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value) || 0);
const today = () => new Date().toISOString().split('T')[0];
const monthAgo = () => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
const STATUS = { draft: 'Borrador', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada' };
const STATUS_CLASS = { draft: 'text-amber-300 bg-amber-500/10 border-amber-500/20', approved: 'text-blue-300 bg-blue-500/10 border-blue-500/20', paid: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', cancelled: 'text-red-300 bg-red-500/10 border-red-500/20' };

export default function SettlementsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('org_id') || user?.organization_id;
  const [period, setPeriod] = useState({ period_start: monthAgo(), period_end: today() });
  const [pending, setPending] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [form, setForm] = useState({ payment_method: 'transfer', payment_reference: '', reason: '' });

  // NEXUS_STAFF_SETTLEMENTS_COMPLETION_V1
  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const orgParams = { organization_id: organizationId };
      const [pendingResponse, settlementsResponse] = await Promise.all([
        settlementAPI.getPending({ ...orgParams, period_start: period.period_start, period_end: period.period_end }),
        settlementAPI.getAll({ ...orgParams, limit: 500 })
      ]);
      setPending(pendingResponse.data || []);
      setSettlements(settlementsResponse.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible cargar las liquidaciones');
    } finally { setLoading(false); }
  }, [organizationId, period.period_start, period.period_end]);

  useEffect(() => { load(); }, [load]);

  const action = async (key, handler, success) => {
    setBusy(key);
    try { await handler(); toast.success(success); setSelected(null); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || 'No fue posible completar la acción'); }
    finally { setBusy(''); }
  };

  const createSettlement = (row) => action(`create-${row.barber_id}`, () => settlementAPI.create({ barber_id: row.barber_id, period_start: period.period_start, period_end: period.period_end, notes: 'Liquidación creada desde el módulo administrativo' }, { organization_id: organizationId }), 'Liquidación creada en borrador');
  const approve = (item) => action(`approve-${item.settlement_id}`, () => settlementWorkflowAPI.approve(item.settlement_id), 'Liquidación aprobada');
  const pay = (item) => { setForm({ payment_method: 'transfer', payment_reference: '', reason: '' }); setWorkflow({ type: 'pay', item }); };
  const cancel = (item) => { setForm({ payment_method: 'transfer', payment_reference: '', reason: '' }); setWorkflow({ type: 'cancel', item }); };
  const submitWorkflow = async () => {
    if (!workflow) return;
    if (workflow.type === 'pay' && !form.payment_reference.trim()) return toast.error('Ingresa una referencia de pago');
    if (workflow.type === 'cancel' && !form.reason.trim()) return toast.error('Ingresa el motivo de cancelación');
    const item = workflow.item;
    await action(`${workflow.type}-${item.settlement_id}`, () => workflow.type === 'pay' ? settlementWorkflowAPI.pay(item.settlement_id, { payment_method: form.payment_method, payment_reference: form.payment_reference.trim() }) : settlementWorkflowAPI.cancel(item.settlement_id, { reason: form.reason.trim() }), workflow.type === 'pay' ? 'Pago registrado' : 'Liquidación cancelada y transacciones liberadas');
    setWorkflow(null);
  };
  const details = async (item) => {
    setBusy(`detail-${item.settlement_id}`);
    try { const response = await settlementAPI.getById(item.settlement_id); setSelected(response.data); }
    catch (error) { toast.error(error.response?.data?.detail || 'No fue posible cargar el detalle'); }
    finally { setBusy(''); }
  };

  const back = user?.role === 'owner' && organizationId ? `/manager/revenue?org_id=${organizationId}` : '/manager/revenue';
  return <div className="min-h-screen nexus-screen text-[var(--app-text-primary)]">
    <header className="sticky top-0 z-40 nexus-topbar border-b border-[var(--app-border)]"><div className="max-w-7xl mx-auto p-4 flex flex-wrap items-center gap-3"><button onClick={() => navigate(back)} className="flex items-center gap-2 text-[var(--app-text-secondary)]"><ArrowLeft size={20}/>Ingresos</button><div className="mr-auto"/><button onClick={load} className="p-2 nexus-panel border border-[var(--app-border)] rounded-xl"><RefreshCw size={18}/></button><div className="text-right"><h1 className="text-2xl">Liquidaciones</h1><p className="text-xs text-[var(--app-text-muted)]">Comisiones y pagos al Staff</p></div></div></header>
    <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <section className="grid sm:grid-cols-3 gap-3 p-4 rounded-2xl nexus-panel border border-[var(--app-border)]"><label className="text-xs text-[var(--app-text-secondary)]">Desde<input type="date" value={period.period_start} onChange={e => setPeriod({ ...period, period_start: e.target.value })} className="block mt-1 w-full p-3 bg-[var(--app-surface-solid)] rounded-xl"/></label><label className="text-xs text-[var(--app-text-secondary)]">Hasta<input type="date" value={period.period_end} onChange={e => setPeriod({ ...period, period_end: e.target.value })} className="block mt-1 w-full p-3 bg-[var(--app-surface-solid)] rounded-xl"/></label><div className="self-end text-sm text-[var(--app-text-secondary)] p-3">Los montos se calculan en el servidor.</div></section>
      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#0A84FF]" size={36}/></div> : <>
        <section className="rounded-2xl nexus-panel border border-[var(--app-border)] overflow-hidden"><div className="p-5 border-b border-[var(--app-border)]"><h2 className="text-lg">Pendiente por liquidar</h2><p className="text-sm text-[var(--app-text-muted)]">{pending.length} profesionales con movimientos disponibles</p></div>{pending.length ? pending.map(row => <div key={row.barber_id} className="p-4 border-b border-[var(--app-border)] flex flex-col md:flex-row md:items-center justify-between gap-4"><div><p className="font-medium">{row.staff_name}</p><p className="text-sm text-[var(--app-text-secondary)]">{row.transaction_count} transacciones · Comisión {money(row.commission_amount)} · Propinas {money(row.tip_amount)}</p></div><div className="flex items-center gap-3"><b className="text-emerald-400 text-lg">{money(row.total_amount)}</b><button disabled={busy} onClick={() => createSettlement(row)} className="px-4 py-2 bg-[#0A84FF] rounded-xl disabled:opacity-50">Crear borrador</button></div></div>) : <p className="p-12 text-center text-[var(--app-text-muted)]">No hay transacciones pendientes para este periodo.</p>}</section>
        <section className="rounded-2xl nexus-panel border border-[var(--app-border)] overflow-hidden"><div className="p-5 border-b border-[var(--app-border)]"><h2 className="text-lg">Historial de liquidaciones</h2><p className="text-sm text-[var(--app-text-muted)]">{settlements.length} registros</p></div>{settlements.length ? settlements.map(item => <div key={item.settlement_id} className="p-4 border-b border-[var(--app-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><div className="flex flex-wrap gap-2 items-center"><p className="font-medium">{item.staff_name_snapshot}</p><span className={`px-2 py-1 rounded-lg border text-xs ${STATUS_CLASS[item.status]}`}>{STATUS[item.status]}</span></div><p className="text-sm text-[var(--app-text-secondary)] mt-1">{item.period_start} a {item.period_end} · {item.transaction_count} transacciones · {item.settlement_id}</p></div><div className="flex flex-wrap items-center gap-2"><b className="text-lg mr-2">{money(item.total_amount)}</b><button onClick={() => details(item)} className="px-3 py-2 nexus-panel border border-[var(--app-border)] rounded-xl">Detalle</button>{item.status === 'draft' && <button onClick={() => approve(item)} className="px-3 py-2 bg-blue-500/20 text-blue-300 rounded-xl">Aprobar</button>}{item.status === 'approved' && <button onClick={() => pay(item)} className="px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-xl">Registrar pago</button>}{['draft','approved'].includes(item.status) && <button onClick={() => cancel(item)} className="px-3 py-2 bg-red-500/10 text-red-300 rounded-xl">Cancelar</button>}</div></div>) : <p className="p-12 text-center text-[var(--app-text-muted)]">Aún no hay liquidaciones.</p>}</section>
      </>}
    </main>
    {selected && <div className="fixed inset-0 z-50 bg-[var(--app-overlay)] p-4 flex items-center justify-center"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--app-surface-elevated)] border border-[var(--app-border)] rounded-2xl p-6"><button onClick={() => setSelected(null)} className="float-right">Cerrar</button><h2 className="text-xl mb-4">Detalle de liquidación</h2><div className="grid grid-cols-2 gap-2 text-sm mb-5">{[['Profesional',selected.staff_name_snapshot],['Estado',STATUS[selected.status]],['Comisiones',money(selected.commission_amount)],['Propinas',money(selected.tip_amount)],['Total',money(selected.total_amount)],['Referencia',selected.payment_reference || 'Sin referencia']].map(([a,b]) => <React.Fragment key={a}><span className="text-[var(--app-text-muted)]">{a}</span><span className="text-right">{b}</span></React.Fragment>)}</div><h3 className="font-medium mb-2">Transacciones incluidas</h3>{(selected.transactions||[]).map(tx => <div key={tx.transaction_id} className="py-3 border-t border-[var(--app-border)] flex justify-between gap-3"><span>{tx.service_name_snapshot} · {tx.transaction_id}</span><span>{money(tx.staff_total_amount)}</span></div>)}</div></div>}

    {workflow && <div className="nexus-confirm-layer"><button className="nexus-account-overlay" onClick={() => !busy && setWorkflow(null)} aria-label="Cerrar"/><section><h2>{workflow.type === 'pay' ? 'Registrar pago' : 'Cancelar liquidación'}</h2><p>{workflow.item.staff_name_snapshot} · {money(workflow.item.total_amount)}</p>{workflow.type === 'pay' ? <><label>Método<select className="nexus-field" value={form.payment_method} onChange={e => setForm({...form,payment_method:e.target.value})}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label><label>Referencia<input className="nexus-field" value={form.payment_reference} onChange={e => setForm({...form,payment_reference:e.target.value})}/></label></> : <label>Motivo<textarea className="nexus-field" value={form.reason} onChange={e => setForm({...form,reason:e.target.value})}/></label>}<div className="nexus-account-actions"><button className="nexus-action-button nexus-action-secondary" onClick={() => setWorkflow(null)}>Cerrar</button><button className={`nexus-action-button ${workflow.type==='cancel'?'nexus-action-destructive':'nexus-action-primary'}`} onClick={submitWorkflow}>Confirmar</button></div></section></div>}
  </div>;
}

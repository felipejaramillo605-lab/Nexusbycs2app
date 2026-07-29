import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle, Clock, HandCoins, Loader2, ReceiptText, WalletCards, X } from 'lucide-react';
import { staffIncomeAPI } from '../api';

// NEXUS_STAFF_INCOME_UI_V1
// NEXUS_STAFF_SETTLEMENTS_COMPLETION_V1
const money = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value) || 0);
const dateValue = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
const STATUS = { draft: 'Borrador', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada' };
const STATUS_CLASS = { draft: 'text-amber-300 bg-amber-500/10 border-amber-500/20', approved: 'text-blue-300 bg-blue-500/10 border-blue-500/20', paid: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', cancelled: 'text-red-300 bg-red-500/10 border-red-500/20' };

const StaffIncome = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [settlementSummary, setSettlementSummary] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const ranges = useMemo(() => { const end = dateValue(0); return { day: { start_date: end, end_date: end }, week: { start_date: dateValue(6), end_date: end }, month: { start_date: dateValue(29), end_date: end } }; }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = ranges[period];
        const [summaryResponse, transactionsResponse, settlementSummaryResponse, settlementsResponse] = await Promise.all([
          staffIncomeAPI.getSummary(params),
          staffIncomeAPI.getTransactions({ ...params, limit: 500 }),
          staffIncomeAPI.getSettlementSummary(),
          staffIncomeAPI.getSettlements({ limit: 200 })
        ]);
        setSummary(summaryResponse.data); setTransactions(transactionsResponse.data || []);
        setSettlementSummary(settlementSummaryResponse.data); setSettlements(settlementsResponse.data || []);
      } catch (error) { console.error('Error loading staff income:', error); setSummary(null); setTransactions([]); setSettlementSummary(null); setSettlements([]); }
      finally { setLoading(false); }
    };
    load();
  }, [period, ranges]);

  const openDetail = async (item) => { try { const response = await staffIncomeAPI.getSettlementById(item.settlement_id); setSelected(response.data); } catch (error) { console.error(error); } };
  const periodLabel = period === 'day' ? 'Hoy' : period === 'week' ? 'Últimos 7 días' : 'Últimos 30 días';
  return <div className="min-h-screen nexus-screen text-[var(--app-text-primary)]">
    <header className="sticky top-0 z-40 nexus-topbar backdrop-blur-xl border-b border-[var(--app-border)]"><div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4"><button onClick={() => navigate('/staff/profile')} className="flex items-center gap-2 text-[var(--app-text-secondary)]"><ArrowLeft size={20}/>Mi perfil</button><button onClick={() => navigate('/staff/appointments')} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400"><CalendarDays size={18}/>Mis citas</button><div className="text-right"><h1 className="text-xl sm:text-2xl font-medium">Mis ingresos</h1><p className="text-xs text-[var(--app-text-muted)]">Comisiones, propinas y liquidaciones</p></div></div></header>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {loading ? <div className="py-20 flex justify-center"><Loader2 size={36} className="animate-spin text-[#0A84FF]"/></div> : <>
        {settlementSummary && <section><h2 className="text-lg font-medium mb-3">Estado de pagos</h2><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
          ['Pendiente por liquidar', settlementSummary.pending_amount, Clock, 'text-amber-400'],
          ['En borradores', settlementSummary.draft_amount, ReceiptText, 'text-orange-300'],
          ['Aprobado por pagar', settlementSummary.approved_amount, CheckCircle, 'text-blue-300'],
          ['Total pagado', settlementSummary.paid_amount, WalletCards, 'text-emerald-400']
        ].map(([label,value,Icon,color]) => <div key={label} className="rounded-2xl border border-[var(--app-border)] nexus-panel p-4"><Icon size={20} className={`${color} mb-3`}/><p className="text-xl font-medium">{money(value)}</p><p className="text-xs text-[var(--app-text-secondary)]">{label}</p></div>)}</div></section>}
        <section className="flex flex-wrap gap-2">{[['day','Hoy'],['week','7 días'],['month','30 días']].map(([value,label]) => <button key={value} onClick={() => setPeriod(value)} className={`px-4 py-2 rounded-xl border ${period===value?'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-[#5EB1FF]':'nexus-panel border-[var(--app-border)] text-[var(--app-text-secondary)]'}`}>{label}</button>)}</section>
        {summary && <section><p className="text-sm text-[var(--app-text-muted)] mb-3">Generado · {periodLabel}</p><div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[
          ['Total generado',money(summary.total_staff_amount),WalletCards],['Comisiones',money(summary.total_commission_amount),ReceiptText],['Propinas',money(summary.total_tip_amount),HandCoins],['Servicios realizados',summary.service_count,CalendarDays],['Valor neto atendido',money(summary.total_net_service_amount),ReceiptText],['Promedio por servicio',money(summary.average_staff_amount),WalletCards]
        ].map(([label,value,Icon]) => <div key={label} className="rounded-2xl border border-[var(--app-border)] nexus-panel p-4"><Icon size={20} className="text-[#0A84FF] mb-3"/><p className="text-xl font-medium">{value}</p><p className="text-xs text-[var(--app-text-secondary)]">{label}</p></div>)}</div></section>}
        <section className="rounded-2xl border border-[var(--app-border)] nexus-panel overflow-hidden"><div className="p-5 border-b border-[var(--app-border)]"><h2 className="text-lg">Historial de liquidaciones</h2><p className="text-sm text-[var(--app-text-muted)]">{settlements.length} registros propios</p></div>{settlements.length ? settlements.map(item => <button key={item.settlement_id} onClick={() => openDetail(item)} className="w-full p-4 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"><div><div className="flex items-center gap-2"><p className="font-medium">{item.period_start} a {item.period_end}</p><span className={`px-2 py-1 rounded-lg border text-xs ${STATUS_CLASS[item.status]}`}>{STATUS[item.status]}</span></div><p className="text-sm text-[var(--app-text-muted)]">{item.transaction_count} transacciones · {item.payment_reference || item.settlement_id}</p></div><b className="text-emerald-400">{money(item.total_amount)}</b></button>) : <p className="p-12 text-center text-[var(--app-text-muted)]">Aún no tienes liquidaciones.</p>}</section>
        <section className="rounded-2xl border border-[var(--app-border)] nexus-panel overflow-hidden"><div className="p-5 border-b border-[var(--app-border)]"><h2 className="text-lg">Servicios completados</h2><p className="text-sm text-[var(--app-text-muted)]">Ingresos generados en el periodo</p></div>{transactions.length ? transactions.map(item => <div key={item.transaction_id} className="p-4 border-b border-[var(--app-border)] flex justify-between gap-3"><div><p>{item.service_name_snapshot || 'Servicio'}</p><p className="text-sm text-[var(--app-text-secondary)]">Comisión {item.staff_percent_snapshot}% · {new Date(item.created_at).toLocaleString('es-CO')}</p></div><b>{money(item.staff_total_amount)}</b></div>) : <p className="p-12 text-center text-[var(--app-text-muted)]">No tienes ingresos registrados en este periodo.</p>}</section>
      </>}
    </main>
    {selected && <div className="fixed inset-0 z-50 bg-[var(--app-overlay)] p-4 flex items-center justify-center"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--app-surface-elevated)] border border-[var(--app-border)] rounded-2xl p-6"><button onClick={() => setSelected(null)} className="float-right"><X/></button><h2 className="text-xl mb-4">Detalle de liquidación</h2><div className="grid grid-cols-2 gap-2 text-sm mb-5">{[['Estado',STATUS[selected.status]],['Comisiones',money(selected.commission_amount)],['Propinas',money(selected.tip_amount)],['Total',money(selected.total_amount)],['Método',selected.payment_method||'Pendiente'],['Referencia',selected.payment_reference||'Sin referencia'],['Fecha de pago',selected.paid_at?new Date(selected.paid_at).toLocaleString('es-CO'):'Pendiente']].map(([a,b]) => <React.Fragment key={a}><span className="text-[var(--app-text-muted)]">{a}</span><span className="text-right">{b}</span></React.Fragment>)}</div>{(selected.transactions||[]).map(tx => <div key={tx.transaction_id} className="py-3 border-t border-[var(--app-border)] flex justify-between"><span>{tx.service_name_snapshot} · {tx.transaction_id}</span><span>{money(tx.staff_total_amount)}</span></div>)}</div></div>}
  </div>;
};
export default StaffIncome;

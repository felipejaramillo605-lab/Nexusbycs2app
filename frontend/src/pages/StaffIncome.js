import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, HandCoins, Loader2, ReceiptText, WalletCards } from 'lucide-react';
import { staffIncomeAPI } from '../api';

// NEXUS_STAFF_INCOME_UI_V1
const money = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const dateValue = (daysAgo = 0) => new Date(
  Date.now() - daysAgo * 24 * 60 * 60 * 1000
).toISOString().split('T')[0];

const StaffIncome = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const ranges = useMemo(() => {
    const end = dateValue(0);
    return {
      day: { start_date: end, end_date: end },
      week: { start_date: dateValue(6), end_date: end },
      month: { start_date: dateValue(29), end_date: end }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = ranges[period];
        const [summaryResponse, transactionsResponse] = await Promise.all([
          staffIncomeAPI.getSummary(params),
          staffIncomeAPI.getTransactions({ ...params, limit: 500 })
        ]);
        setSummary(summaryResponse.data);
        setTransactions(transactionsResponse.data || []);
      } catch (error) {
        console.error('Error loading staff income:', error);
        setSummary(null);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period, ranges]);

  const periodLabel = period === 'day' ? 'Hoy' : period === 'week' ? 'Últimos 7 días' : 'Últimos 30 días';

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate('/staff/profile')} className="flex items-center gap-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={20} /> Mi perfil
          </button>
          {/* NEXUS_STAFF_APPOINTMENTS_UI_V1 */}
          <button type="button" onClick={() => navigate('/staff/appointments')} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <CalendarDays size={18} /> Mis citas
          </button>
          <div className="text-right">
            <h1 className="text-xl sm:text-2xl font-medium">Mis ingresos</h1>
            <p className="text-xs text-zinc-500">Comisiones y propinas propias</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="flex flex-wrap gap-2">
          {[
            ['day', 'Hoy'],
            ['week', '7 días'],
            ['month', '30 días']
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPeriod(value)} className={`px-4 py-2 rounded-xl border ${period === value ? 'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-[#5EB1FF]' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
              {label}
            </button>
          ))}
        </section>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 size={36} className="animate-spin text-[#0A84FF]" /></div>
        ) : summary ? (
          <>
            <section>
              <p className="text-sm text-zinc-500 mb-3">{periodLabel}</p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  ['Total para recibir', money(summary.total_staff_amount), WalletCards],
                  ['Comisiones', money(summary.total_commission_amount), ReceiptText],
                  ['Propinas', money(summary.total_tip_amount), HandCoins],
                  ['Servicios realizados', summary.service_count, CalendarDays],
                  ['Valor neto atendido', money(summary.total_net_service_amount), ReceiptText],
                  ['Promedio por servicio', money(summary.average_staff_amount), WalletCards]
                ].map(([label, value, Icon]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
                    <Icon size={20} className="text-[#0A84FF] mb-3" />
                    <p className="text-xl sm:text-2xl font-medium">{value}</p>
                    <p className="text-xs sm:text-sm text-zinc-400 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/10">
                <h2 className="text-lg font-medium">Servicios completados</h2>
                <p className="text-sm text-zinc-500">Solo se muestran tus propios cobros confirmados</p>
              </div>
              {transactions.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">No tienes ingresos registrados en este periodo.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {transactions.map((item) => (
                    <div key={item.transaction_id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.service_name_snapshot || 'Servicio'}</p>
                        <p className="text-sm text-zinc-400 mt-1">Comisión {item.staff_percent_snapshot}% · {new Date(item.created_at).toLocaleString('es-CO')}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-sm">
                        <div><p className="text-zinc-500">Comisión</p><p>{money(item.staff_commission_amount)}</p></div>
                        <div><p className="text-zinc-500">Propina</p><p>{money(item.tip_amount)}</p></div>
                        <div><p className="text-zinc-500">Total</p><p className="text-emerald-400 font-medium">{money(item.staff_total_amount)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="py-16 text-center text-zinc-500">No fue posible cargar tus ingresos.</div>
        )}
      </main>
    </div>
  );
};

export default StaffIncome;

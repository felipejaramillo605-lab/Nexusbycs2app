import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle, Clock, Loader2, Mail, Phone, UserRound, WalletCards, XCircle } from 'lucide-react';
import { staffAppointmentAPI } from '../api';

// NEXUS_STAFF_APPOINTMENTS_UI_V1
const today = () => new Date().toISOString().split('T')[0];
const dateOffset = (days) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
const STATUS_LABELS = { confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada' };
const STATUS_CLASSES = {
  confirmed: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  completed: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/10 border-red-500/20 text-red-300'
};

const StaffAppointments = () => {
  const navigate = useNavigate();
  const [view, setView] = useState('upcoming');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const base = { limit: 500 };
    if (view === 'today') {
      base.start_date = today();
      base.end_date = today();
    } else if (view === 'upcoming') {
      base.start_date = today();
      base.end_date = dateOffset(90);
    } else {
      base.start_date = dateOffset(-90);
      base.end_date = today();
    }
    if (status) base.status = status;
    return base;
  }, [view, status]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const summaryParams = { start_date: params.start_date, end_date: params.end_date };
        const [summaryResponse, appointmentsResponse] = await Promise.all([
          staffAppointmentAPI.getSummary(summaryParams),
          staffAppointmentAPI.getAll(params)
        ]);
        setSummary(summaryResponse.data);
        setAppointments(appointmentsResponse.data || []);
      } catch (error) {
        console.error('Error loading staff appointments:', error);
        setSummary(null);
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params]);

  return (
    <div className="min-h-screen nexus-screen text-[var(--app-text-primary)]">
      <header className="sticky top-0 z-40 nexus-topbar backdrop-blur-xl border-b border-[var(--app-border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => navigate('/staff/profile')} className="flex items-center gap-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"><ArrowLeft size={20} /> Mi perfil</button>
          <div className="mr-auto" />
          <button type="button" onClick={() => navigate('/staff/income')} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><WalletCards size={18} /> Mis ingresos</button>
          <div className="text-right w-full sm:w-auto sm:ml-3"><h1 className="text-xl sm:text-2xl font-medium">Mis citas</h1><p className="text-xs text-[var(--app-text-muted)]">Agenda profesional propia</p></div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="flex flex-wrap items-center gap-2">
          {[['today', 'Hoy'], ['upcoming', 'Próximas'], ['history', 'Historial']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setView(value)} className={`px-4 py-2 rounded-xl border ${view === value ? 'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-[#5EB1FF]' : 'nexus-panel border-[var(--app-border)] text-[var(--app-text-secondary)]'}`}>{label}</button>
          ))}
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="ml-auto px-4 py-2 rounded-xl bg-[var(--app-surface-solid)] border border-[var(--app-border)] text-[var(--app-text-primary)]">
            <option value="">Todos los estados</option>
            <option value="confirmed">Confirmadas</option>
            <option value="completed">Completadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </section>

        {loading ? <div className="py-20 flex justify-center"><Loader2 size={36} className="animate-spin text-[#0A84FF]" /></div> : summary ? <>
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              ['Total', summary.total_appointments, CalendarDays],
              ['Confirmadas', summary.confirmed_count, Clock],
              ['Completadas', summary.completed_count, CheckCircle],
              ['Canceladas', summary.cancelled_count, XCircle],
              ['Citas de hoy', summary.today_count, CalendarDays],
              ['Próximas', summary.upcoming_count, Clock]
            ].map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-[var(--app-border)] nexus-panel p-4 sm:p-5"><Icon size={20} className="text-[#0A84FF] mb-3" /><p className="text-2xl font-medium">{value}</p><p className="text-sm text-[var(--app-text-secondary)]">{label}</p></div>)}
          </section>

          <section className="rounded-2xl border border-[var(--app-border)] nexus-panel overflow-hidden">
            <div className="p-5 border-b border-[var(--app-border)]"><h2 className="text-lg font-medium">Agenda</h2><p className="text-sm text-[var(--app-text-muted)]">Solo aparecen las citas asignadas a tu perfil profesional</p></div>
            {appointments.length === 0 ? <div className="py-16 text-center text-[var(--app-text-muted)]">No tienes citas para los filtros seleccionados.</div> : <div className="divide-y divide-[var(--app-border)]">
              {appointments.map((item) => <article key={item.appointment_id} className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-lg">{item.service_name}</h3><span className={`px-2 py-1 rounded-lg border text-xs ${STATUS_CLASSES[item.status] || 'nexus-panel border-[var(--app-border)] text-zinc-300'}`}>{STATUS_LABELS[item.status] || item.status}</span></div>
                    <p className="text-zinc-300 flex items-center gap-2"><CalendarDays size={16} className="text-[#0A84FF]" /> {item.date} · {item.time} · {item.service_duration} min</p>
                    <p className="text-zinc-300 flex items-center gap-2"><UserRound size={16} className="text-purple-300" /> {item.client_name || 'Cliente'}</p>
                    {item.client_phone && <a href={`tel:${item.client_phone}`} className="text-sm text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] flex items-center gap-2"><Phone size={15} /> {item.client_phone}</a>}
                    {item.client_email && <a href={`mailto:${item.client_email}`} className="text-sm text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] flex items-center gap-2 break-all"><Mail size={15} /> {item.client_email}</a>}
                  </div>
                  <div className="text-left md:text-right text-xs text-[var(--app-text-muted)]"><p>ID: {item.appointment_id}</p>{item.transaction_id && <p className="mt-1 text-emerald-400">Cobro registrado</p>}</div>
                </div>
              </article>)}
            </div>}
          </section>
        </> : <div className="py-16 text-center text-[var(--app-text-muted)]">No fue posible cargar tus citas.</div>}
      </main>
    </div>
  );
};

export default StaffAppointments;

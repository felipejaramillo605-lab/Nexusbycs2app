import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Lightbulb, UsersRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { capacityAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState, MetricCard, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const pct = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
const hours = (value) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value || 0)} h`;
const shift = (iso, days) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const tone = (value) => (value === null || value === undefined ? 'bg-zinc-500' : value >= 0.85 ? 'bg-amber-500' : value < 0.4 ? 'bg-sky-500' : 'bg-emerald-500');

// Responde "que horas y recursos puedo abrir, cerrar o promocionar" para una semana (lunes a domingo).
export default function ManagerCapacity() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? params.get('org_id') : user?.organization_id) || user?.organization_id;
  const [weekStart, setWeekStart] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (start) => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const response = await capacityAPI.weekly({ organization_id: organizationId, ...(start ? { week_start: start } : {}) });
        setData(response.data);
        setWeekStart(response.data.week_start);
      } catch (error) {
        const detail = error?.response?.data?.detail;
        toast.error(typeof detail === 'string' ? detail : 'No fue posible cargar la capacidad');
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    load('');
  }, [load]);

  const totals = data?.totals;
  return (
    <MotionPage>
      <PageHeader eyebrow="Crecimiento" title="Capacidad y demanda" description="Qué horas y profesionales están llenos o vacíos, cuánto se cancela y qué clases tienen lista de espera." />
      <div className="flex items-center gap-3 mb-4" data-testid="capacity-week">
        <button type="button" className="nexus-button" aria-label="Semana anterior" onClick={() => load(shift(weekStart, -7))}><ChevronLeft size={16} /></button>
        <strong>{data ? `${data.week_start} al ${data.week_end}` : 'Semana'}</strong>
        <button type="button" className="nexus-button" aria-label="Semana siguiente" onClick={() => load(shift(weekStart, 7))}><ChevronRight size={16} /></button>
      </div>
      {loading && !data ? <LoadingState /> : !data ? <EmptyState title="Sin datos" description="No se pudo cargar la semana." /> : (
        <div className="space-y-6">
          <div className="nexus-metric-grid">
            <MetricCard label="Ocupación" value={pct(totals.occupancy)} icon={CalendarClock} />
            <MetricCard label="Horas libres" value={hours(totals.free_hours)} icon={UsersRound} />
            <MetricCard label="Citas" value={totals.appointments} icon={CalendarClock} />
            <MetricCard label="Canceladas" value={totals.cancellations} icon={XCircle} />
          </div>

          <SurfaceCard>
            <div className="p-4 space-y-2" data-testid="capacity-insights">
              <h2 className="text-lg flex items-center gap-2"><Lightbulb size={18} /> Qué puedes hacer esta semana</h2>
              {data.insights.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">Sin alertas: la semana se ve equilibrada.</p> : (
                <ul className="list-disc pl-5 text-sm space-y-1">{data.insights.map((tip) => <li key={tip}>{tip}</li>)}</ul>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="p-4 space-y-3">
              <h2 className="text-lg">Ocupación por día</h2>
              {data.days.map((day) => (
                <div key={day.date} className="grid grid-cols-[6.5rem_1fr_4.5rem] gap-3 items-center text-sm" data-testid="capacity-day">
                  <span className="capitalize">{day.weekday} {day.date.slice(8)}</span>
                  <div className="h-3 rounded-full bg-[var(--app-surface-muted)] overflow-hidden" role="img" aria-label={`Ocupación ${pct(day.occupancy)}`}>
                    <div className={`h-full ${tone(day.occupancy)}`} style={{ width: `${Math.min(100, Math.round((day.occupancy || 0) * 100))}%` }} />
                  </div>
                  <span className="text-right">{pct(day.occupancy)}</span>
                </div>
              ))}
              <p className="text-xs text-[var(--app-text-secondary)]">Azul: menos de 40% (promociona). Verde: equilibrado. Ámbar: 85% o más (abre horas).</p>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="p-4 overflow-x-auto">
              <h2 className="text-lg mb-3">Por profesional</h2>
              <table className="w-full text-sm" data-testid="capacity-professionals">
                <thead><tr className="text-left text-[var(--app-text-secondary)]"><th className="p-2">Profesional</th><th className="p-2 text-right">Disponible</th><th className="p-2 text-right">Reservado</th><th className="p-2 text-right">Libre</th><th className="p-2 text-right">Ocupación</th><th className="p-2 text-right">Canceladas</th></tr></thead>
                <tbody>
                  {data.professionals.map((pro) => (
                    <tr key={pro.barber_id} className="border-t border-[var(--app-border)]">
                      <td className="p-2">{pro.name}</td><td className="p-2 text-right">{hours(pro.available_hours)}</td><td className="p-2 text-right">{hours(pro.booked_hours)}</td>
                      <td className="p-2 text-right">{hours(pro.free_hours)}</td><td className="p-2 text-right">{pct(pro.occupancy)}</td><td className="p-2 text-right">{pro.cancellations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="p-4 space-y-2" data-testid="capacity-classes">
              <h2 className="text-lg">Clases grupales</h2>
              {data.classes.sessions === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">No hay clases programadas esta semana.</p> : (
                <>
                  <p className="text-sm">{data.classes.sessions} sesiones · {data.classes.booked} de {data.classes.seats} cupos ({pct(data.classes.occupancy)}) · {data.classes.waitlist} en lista de espera</p>
                  <ul className="text-sm space-y-1">
                    {data.classes.items.map((row) => (
                      <li key={row.class_session_id}>{row.date} {row.time} — {row.booked}/{row.capacity} cupos{row.waitlist ? ` · ${row.waitlist} en espera` : ''}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </SurfaceCard>
        </div>
      )}
    </MotionPage>
  );
}

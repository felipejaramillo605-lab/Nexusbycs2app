import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cake, CalendarX2, Check, FileImage, PartyPopper, X } from 'lucide-react';
import { toast } from 'sonner';
import { hrAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState, MetricCard, MotionPage, PageHeader, SurfaceCard } from '../components/design';
import { saveBlob } from '../lib/download';

const STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' };
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

// Equipo y ausencias: aprobaciones en un clic, calendario superpuesto, quien esta fuera, cumpleanos y aniversarios.
export default function ManagerHR() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? params.get('org_id') : user?.organization_id) || user?.organization_id;
  const scope = useMemo(() => ({ organization_id: organizationId }), [organizationId]);
  const [overview, setOverview] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const start = new Date();
    try {
      const [summary, cal] = await Promise.all([hrAPI.overview(scope), hrAPI.calendar({ ...scope, start: iso(start), end: iso(addDays(start, 34)) })]);
      setOverview(summary.data);
      setCalendar(cal.data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar el equipo'));
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (row, approve, allowOver = false) => {
    setBusy(true);
    try {
      await hrAPI.decide(row.request_id, { approve, note: note || null, allow_over_balance: allowOver }, scope);
      toast.success(approve ? 'Solicitud aprobada' : 'Solicitud rechazada');
      setNote('');
      await load();
    } catch (error) {
      const detail = error?.response?.data?.detail;
      if (detail?.code === 'VACATION_OVER_BALANCE' && window.confirm(detail.message)) {
        await decide(row, true, true);
        return;
      }
      if (detail?.code !== 'VACATION_OVER_BALANCE') toast.error(messageOf(error, 'No fue posible resolver la solicitud'));
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (row) => {
    try {
      saveBlob(await hrAPI.downloadDocument(row.document_id, scope), `soporte_${row.employee_name}`);
    } catch (error) {
      toast.error('No fue posible abrir el soporte');
    }
  };

  if (!overview || !calendar) return <LoadingState label="Cargando el equipo" />;
  const days = Array.from({ length: 35 }, (_, index) => iso(addDays(new Date(), index)));
  const holidays = new Set(calendar.holidays);
  const absentOn = (day) => calendar.items.filter((row) => row.start_date <= day && day <= row.end_date);

  return (
    <MotionPage>
      <PageHeader eyebrow="Equipo" title="Equipo y ausencias" description="Aprueba vacaciones y permisos, revisa incapacidades y evita que quede una operación crítica sin cubrir." />
      <div className="nexus-metric-grid mb-4">
        <MetricCard label="Pendientes por aprobar" value={overview.pending_count} icon={CalendarX2} />
        <MetricCard label="Fuera hoy" value={overview.out_today.length} icon={CalendarX2} />
        <MetricCard label="Cumpleaños próximos" value={overview.birthdays.length} icon={Cake} />
        <MetricCard label="Aniversarios próximos" value={overview.anniversaries.length} icon={PartyPopper} />
      </div>

      <div className="space-y-6">
        <SurfaceCard>
          <div className="p-4 space-y-3" data-testid="pending-requests">
            <h2 className="text-lg">Solicitudes pendientes</h2>
            {overview.pending.length === 0 ? <EmptyState title="Nada pendiente" description="Cuando alguien pida vacaciones o permisos aparecerá aquí." /> : (
              <>
                <label className="text-sm block">Nota para la respuesta (opcional)<input className="nexus-field" value={note} onChange={(e) => setNote(e.target.value)} data-testid="decision-note" /></label>
                {overview.pending.map((row) => (
                  <div key={row.request_id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--app-border)]" data-testid="pending-row">
                    <div>
                      <strong>{row.employee_name}</strong> — {row.kind_label}
                      <div className="text-sm text-[var(--app-text-secondary)]">{row.start_date} al {row.end_date} · {row.days} día{row.days === 1 ? '' : 's'}{row.paid ? '' : ' · no remunerado'}{row.note ? ` · ${row.note}` : ''}</div>
                      {(calendar.overlap_by_day[row.start_date] || 0) > 0 && <div className="text-xs text-amber-500">Ese día ya hay {calendar.overlap_by_day[row.start_date]} persona(s) ausente(s).</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.document_id && <button type="button" className="nexus-button" onClick={() => openDocument(row)} data-testid="open-document"><FileImage size={14} /> Ver soporte</button>}
                      <button type="button" className="nexus-button nexus-button-primary" disabled={busy} onClick={() => decide(row, true)} data-testid="approve-request"><Check size={14} /> Aprobar</button>
                      <button type="button" className="nexus-button" disabled={busy} onClick={() => decide(row, false)} data-testid="reject-request"><X size={14} /> Rechazar</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="p-4 space-y-2" data-testid="team-calendar">
            <h2 className="text-lg">Calendario del equipo (próximos 35 días)</h2>
            <p className="text-sm text-[var(--app-text-secondary)]">Fuera hoy: {overview.out_today.length ? overview.out_today.join(', ') : 'nadie'}. Festivos marcados. Un número indica cuántas personas aprobadas coinciden.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {days.filter((day) => absentOn(day).length || holidays.has(day)).map((day) => (
                    <tr key={day} className="border-t border-[var(--app-border)]" data-testid="calendar-row">
                      <td className="p-2 whitespace-nowrap">{day}</td>
                      <td className="p-2">{holidays.has(day) ? 'Festivo' : ''}</td>
                      <td className="p-2">{absentOn(day).map((row) => `${row.employee_name} (${row.kind_label}${row.status === 'pending' ? ', pendiente' : ''})`).join(' · ')}</td>
                      <td className="p-2 text-right">{calendar.overlap_by_day[day] || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="p-4 grid md:grid-cols-2 gap-4" data-testid="celebrations">
            <div>
              <h2 className="text-lg">Cumpleaños (30 días)</h2>
              {overview.birthdays.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">Sin cumpleaños. Registra la fecha de nacimiento en el contrato de cada persona.</p> : overview.birthdays.map((item) => <p key={item.name} className="text-sm">{item.name} — {item.days_until === 0 ? 'hoy' : `en ${item.days_until} días`}</p>)}
            </div>
            <div>
              <h2 className="text-lg">Aniversarios de trabajo (30 días)</h2>
              {overview.anniversaries.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">Sin aniversarios próximos.</p> : overview.anniversaries.map((item) => <p key={item.name} className="text-sm">{item.name} — {item.years} año{item.years === 1 ? '' : 's'} {item.days_until === 0 ? 'hoy' : `en ${item.days_until} días`}</p>)}
            </div>
          </div>
        </SurfaceCard>
        <p className="text-xs text-[var(--app-text-secondary)]">{overview.disclaimer}</p>
      </div>
    </MotionPage>
  );
}

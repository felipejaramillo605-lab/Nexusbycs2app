import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { hrAPI, payrollAPI } from '../api';
import { LoadingState, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' };
const fmtDays = (value) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(Number(value || 0));
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const today = () => new Date().toISOString().slice(0, 10);

// Autogestion del empleado: saldo de vacaciones, calculadora de regreso, solicitudes, incapacidades con foto y permisos.
export default function StaffSelfService() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ kind: 'vacation', start_date: today(), end_date: today(), note: '', paid: true });
  const [file, setFile] = useState(null);
  const [calc, setCalc] = useState({ days: 5, result: null });
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState(null);
  const [novelties, setNovelties] = useState([]);
  const [overtime, setOvertime] = useState({ kind: 'overtime_day', date: today(), hours: 1 });

  const load = useCallback(async () => {
    try {
      const { data: loaded } = await hrAPI.mySummary();
      setData(loaded);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar tu autogestión'));
    }
  }, []);

  useEffect(() => {
    load();
    // Horas extra: la referencia legal y mis solicitudes (si falla, la seccion simplemente no aparece)
    Promise.resolve(payrollAPI?.noveltyReference?.()).then((r) => setReference(r?.data || null)).catch(() => {});
    Promise.resolve(hrAPI?.myNovelties?.()).then((r) => setNovelties(r?.data?.items || [])).catch(() => {});
  }, [load]);

  const calculate = async () => {
    try {
      const { data: result } = await hrAPI.vacationCalc({ start_date: form.start_date, days: Number(calc.days) });
      setCalc({ ...calc, result });
      setForm({ ...form, end_date: result.end_date });
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible calcular'));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      let documentId = null;
      if (file) documentId = (await hrAPI.uploadDocument(file)).data.document_id;
      await hrAPI.createRequest({ kind: form.kind, start_date: form.start_date, end_date: form.end_date, note: form.note || null, document_id: documentId, paid: form.kind === 'permission' || form.kind === 'study' ? form.paid : null });
      toast.success('Solicitud enviada a tu manager');
      setFile(null);
      setForm({ ...form, note: '' });
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible enviar la solicitud'));
    } finally {
      setBusy(false);
    }
  };

  const sendOvertime = async () => {
    try {
      await hrAPI.requestOvertime({ kind: overtime.kind, date: overtime.date, hours: Number(overtime.hours) });
      toast.success('Horas enviadas a tu manager para aprobación');
      setNovelties((await hrAPI.myNovelties()).data.items || []);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible enviar las horas'));
    }
  };

  const cancel = async (id) => {
    try {
      await hrAPI.cancelRequest(id);
      toast.success('Solicitud cancelada');
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cancelar'));
    }
  };

  if (!data) return <LoadingState label="Cargando tu autogestión" />;
  const vacation = data.vacation;
  const needsPhoto = form.kind === 'sick_leave';
  return (
    <MotionPage className="nexus-staff-page space-y-6">
      <PageHeader eyebrow="Mi trabajo" title="Autogestión" description="Pide vacaciones y permisos, envía tus incapacidades y consulta el estado de cada solicitud." />
      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="vacation-balance">
          <h2 className="text-lg flex items-center gap-2"><CalendarDays size={18} /> Mis vacaciones</h2>
          {vacation.available === null ? (
            <p className="text-sm text-[var(--app-text-secondary)]">Tu manager aún no registra tu fecha de ingreso, por eso no se puede calcular el saldo.</p>
          ) : (
            <p className="text-sm">Causadas: <strong>{fmtDays(vacation.accrued)}</strong> días hábiles · Disfrutadas: <strong>{fmtDays(vacation.taken)}</strong> · Disponibles: <strong data-testid="vacation-available">{fmtDays(vacation.available)}</strong></p>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Nueva solicitud</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">Tipo
              <select className="nexus-field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="request-kind">
                {Object.entries(data.kinds).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
            </label>
            <div />
            <label className="text-sm">Desde<input className="nexus-field" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="request-start" /></label>
            <label className="text-sm">Hasta<input className="nexus-field" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="request-end" /></label>
          </div>
          {form.kind === 'vacation' && (
            <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl border border-[var(--app-border)]" data-testid="vacation-calc">
              <label className="text-sm">Calculadora: días hábiles
                <input className="nexus-field" type="number" min="1" value={calc.days} onChange={(e) => setCalc({ ...calc, days: e.target.value })} data-testid="calc-days" />
              </label>
              <button type="button" className="nexus-button" onClick={calculate} data-testid="calc-button">Calcular regreso</button>
              {calc.result && <p className="text-sm" data-testid="calc-result">Último día: <strong>{calc.result.end_date}</strong> · Regresas el <strong>{calc.result.return_date}</strong></p>}
            </div>
          )}
          {(form.kind === 'permission' || form.kind === 'study') && (
            <label className="text-sm flex gap-2"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Permiso remunerado (si no, se descuenta de la nómina)</label>
          )}
          {data.kinds[form.kind]?.evidence && (
            <label className="text-sm block"><Camera size={14} className="inline mr-1" />{needsPhoto ? 'Foto de la incapacidad (EPS o ARL) — obligatoria' : 'Soporte (foto o PDF) — opcional'}
              <input className="nexus-field" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="request-file" />
            </label>
          )}
          <label className="text-sm block">Nota (opcional)<textarea className="nexus-field" rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button type="button" className="nexus-button nexus-button-primary" disabled={busy || (needsPhoto && !file)} onClick={submit} data-testid="request-submit">Enviar solicitud</button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="my-requests">
          <h2 className="text-lg">Mis solicitudes</h2>
          {data.requests.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">Aún no has hecho solicitudes.</p> : data.requests.map((row) => (
            <div key={row.request_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="request-row">
              <div>
                <strong>{row.kind_label}</strong> · {row.start_date} al {row.end_date} ({row.days} día{row.days === 1 ? '' : 's'}{row.paid ? '' : ', no remunerado'})
                <div className="text-sm text-[var(--app-text-secondary)]">{STATUS[row.status]}{row.decision_note ? ` — ${row.decision_note}` : ''}</div>
              </div>
              {row.status === 'pending' && <button type="button" className="nexus-link-action" onClick={() => cancel(row.request_id)} data-testid="cancel-request"><Trash2 size={14} /> Cancelar</button>}
            </div>
          ))}
        </div>
      </SurfaceCard>
      {reference && (
        <SurfaceCard>
          <div className="p-4 space-y-3" data-testid="overtime-card">
            <h2 className="text-lg">Horas extra y recargos</h2>
            <p className="text-sm text-[var(--app-text-secondary)]">Solo aplica a contratos fijos. Tope: {reference.max_overtime_per_day} h extra al día y {reference.max_overtime_per_week} h a la semana. Tu manager debe aprobarlas.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="text-sm">Tipo
                <select className="nexus-field" value={overtime.kind} onChange={(e) => setOvertime({ ...overtime, kind: e.target.value })} data-testid="overtime-kind">
                  {Object.entries(reference.kinds).map(([key, row]) => <option key={key} value={key}>{row.label}</option>)}
                </select>
              </label>
              <label className="text-sm">Fecha<input className="nexus-field" type="date" value={overtime.date} onChange={(e) => setOvertime({ ...overtime, date: e.target.value })} /></label>
              <label className="text-sm">Horas<input className="nexus-field" type="number" min="0.5" max="12" step="0.5" value={overtime.hours} onChange={(e) => setOvertime({ ...overtime, hours: e.target.value })} data-testid="overtime-hours" /></label>
            </div>
            <button type="button" className="nexus-button nexus-button-primary" onClick={sendOvertime} data-testid="overtime-submit">Enviar horas</button>
            {novelties.filter((n) => n.type === 'overtime').slice(0, 8).map((n) => <div key={n.novelty_id} className="text-sm" data-testid="overtime-row">{n.date} · {n.kind_label} · {n.hours} h · {STATUS[n.status] || n.status}</div>)}
          </div>
        </SurfaceCard>
      )}
      <p className="text-xs text-[var(--app-text-secondary)]">{data.disclaimer}</p>
    </MotionPage>
  );
}

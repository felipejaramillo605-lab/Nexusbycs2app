import React, { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { payrollAPI } from '../api';
import { EmptyState, LoadingState, SurfaceCard } from './design';

const cop = (value) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
const STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const today = () => new Date().toISOString().slice(0, 10);

// Novedades de nomina: horas extra y recargos (con topes legales) y bonos. Se aprueban en un clic y pasan solas a la nomina.
export default function PayrollNoveltiesTab({ scope }) {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overtime, setOvertime] = useState({ barber_id: '', kind: 'overtime_day', date: today(), hours: 1 });
  const [bonus, setBonus] = useState({ barber_id: '', concept: '', amount: '', constitutes_salary: false });

  const load = useCallback(async () => {
    try {
      const [list, contracts, ref] = await Promise.all([payrollAPI.listNovelties(scope), payrollAPI.listContracts(scope), payrollAPI.noveltyReference()]);
      setItems(list.data.items || []);
      setStaff((contracts.data.items || []).filter((row) => row.contract_type === 'fixed_salary'));
      setReference(ref.data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar las novedades'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, success) => {
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible completar la acción'));
    }
  };

  if (loading) return <LoadingState />;
  const pending = items.filter((item) => item.status === 'pending');
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3" data-testid="novelty-pending">
          <h2 className="text-lg">Por aprobar ({pending.length})</h2>
          {pending.length === 0 ? <EmptyState title="Nada pendiente" description="Las horas extra y bonos registrados aparecerán aquí para aprobarlos." /> : pending.map((item) => (
            <div key={item.novelty_id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--app-border)]" data-testid="novelty-row">
              <div>
                <strong>{item.employee_name}</strong> — {item.type === 'overtime' ? `${item.kind_label} · ${item.hours} h · ${item.date}` : item.concept}
                <div className="text-sm text-[var(--app-text-secondary)]">{cop(item.amount)}{item.type === 'overtime' ? ` (factor ${item.multiplier})` : item.constitutes_salary ? ' · constituye salario' : ' · no constituye salario'}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="nexus-button nexus-button-primary" onClick={() => run(() => payrollAPI.decideNovelty(item.novelty_id, { approve: true }, scope), 'Novedad aprobada')} data-testid="approve-novelty"><Check size={14} /> Aprobar</button>
                <button type="button" className="nexus-button" onClick={() => run(() => payrollAPI.decideNovelty(item.novelty_id, { approve: false }, scope), 'Novedad rechazada')}><X size={14} /> Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Registrar horas extra o recargos</h2>
          {reference && (
            <p className="text-sm text-[var(--app-text-secondary)]" data-testid="novelty-reference">
              Hoy: jornada máxima de {reference.weekly_hours_limit} h semanales, recargo dominical y festivo de {Math.round(reference.sunday_surcharge * 100)}%. Tope: {reference.max_overtime_per_day} h extra al día y {reference.max_overtime_per_week} h a la semana.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="text-sm">Empleado
              <select className="nexus-field" value={overtime.barber_id} onChange={(e) => setOvertime({ ...overtime, barber_id: e.target.value })} data-testid="overtime-person">
                <option value="">Selecciona</option>
                {staff.map((person) => <option key={person.barber_id} value={person.barber_id}>{person.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Tipo
              <select className="nexus-field" value={overtime.kind} onChange={(e) => setOvertime({ ...overtime, kind: e.target.value })} data-testid="overtime-kind">
                {Object.entries(reference?.kinds || {}).map(([key, row]) => <option key={key} value={key}>{`${row.label} (×${row.multiplier})`}</option>)}
              </select>
            </label>
            <label className="text-sm">Fecha<input className="nexus-field" type="date" value={overtime.date} onChange={(e) => setOvertime({ ...overtime, date: e.target.value })} /></label>
            <label className="text-sm">Horas<input className="nexus-field" type="number" min="0.5" max="12" step="0.5" value={overtime.hours} onChange={(e) => setOvertime({ ...overtime, hours: e.target.value })} data-testid="overtime-hours" /></label>
          </div>
          <button type="button" className="nexus-button nexus-button-primary" disabled={!overtime.barber_id}
            onClick={() => run(() => payrollAPI.registerOvertime({ ...scope, barber_id: overtime.barber_id, kind: overtime.kind, date: overtime.date, hours: Number(overtime.hours) }), 'Registrada, falta aprobarla')} data-testid="register-overtime">Registrar</button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Registrar bono o comisión variable</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="text-sm">Empleado
              <select className="nexus-field" value={bonus.barber_id} onChange={(e) => setBonus({ ...bonus, barber_id: e.target.value })} data-testid="bonus-person">
                <option value="">Selecciona</option>
                {staff.map((person) => <option key={person.barber_id} value={person.barber_id}>{person.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Concepto<input className="nexus-field" value={bonus.concept} onChange={(e) => setBonus({ ...bonus, concept: e.target.value })} placeholder="Bono de cumplimiento de metas" data-testid="bonus-concept" /></label>
            <label className="text-sm">Valor (COP)<input className="nexus-field" type="number" min="0" value={bonus.amount} onChange={(e) => setBonus({ ...bonus, amount: e.target.value })} data-testid="bonus-amount" /></label>
          </div>
          <label className="text-sm flex gap-2"><input type="checkbox" checked={bonus.constitutes_salary} onChange={(e) => setBonus({ ...bonus, constitutes_salary: e.target.checked })} /> Constituye salario (cuenta para aportes y prestaciones)</label>
          <button type="button" className="nexus-button nexus-button-primary" disabled={!bonus.barber_id || !bonus.concept.trim() || !(Number(bonus.amount) > 0)}
            onClick={() => run(() => payrollAPI.registerBonus({ ...scope, barber_id: bonus.barber_id, concept: bonus.concept, amount: Number(bonus.amount), constitutes_salary: bonus.constitutes_salary }), 'Bono registrado, falta aprobarlo')} data-testid="register-bonus">Registrar bono</button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="novelty-history">
          <h2 className="text-lg">Historial</h2>
          {items.filter((item) => item.status !== 'pending').slice(0, 30).map((item) => (
            <div key={item.novelty_id} className="text-sm">{item.employee_name} — {item.type === 'overtime' ? item.kind_label : item.concept} · {cop(item.amount)} · {STATUS[item.status]}{item.applied_run_id ? ' · ya en nómina' : ''}</div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

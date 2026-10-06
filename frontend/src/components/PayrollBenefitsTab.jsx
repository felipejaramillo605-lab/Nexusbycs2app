import React, { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { payrollAPI } from '../api';
import { EmptyState, SurfaceCard } from './design';
import { saveBlob } from '../lib/download';

const cop = (value) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const KINDS = [
  { value: 'prima', label: 'Prima de servicios', semestral: true, applicable: true },
  { value: 'cesantias', label: 'Cesantías', semestral: false, applicable: false },
  { value: 'cesantias_interest', label: 'Intereses a las cesantías', semestral: false, applicable: true },
];
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};

// Prestaciones causadas (segun las nominas aprobadas), sabana anual y archivo de pagos. Consulta interna.
export default function PayrollBenefitsTab({ scope }) {
  const now = new Date();
  const [form, setForm] = useState({ kind: 'prima', year: now.getFullYear(), semester: now.getMonth() < 6 ? 1 : 2 });
  const [result, setResult] = useState(null);
  const kind = KINDS.find((item) => item.value === form.kind);
  const query = { ...scope, year: Number(form.year), ...(kind.semestral ? { semester: Number(form.semester) } : {}) };

  const run = async (fn, fallback) => {
    try {
      return await fn();
    } catch (error) {
      toast.error(messageOf(error, fallback));
      return null;
    }
  };

  const preview = async () => {
    const response = await run(() => payrollAPI.benefitPreview(form.kind, query), 'No fue posible calcular');
    if (response) setResult(response.data);
  };
  const download = async (fn, name) => {
    const response = await run(fn, 'No fue posible descargar el archivo');
    if (response) saveBlob(response, name);
  };
  const apply = async () => {
    const response = await run(() => payrollAPI.applyBenefit({ ...scope, kind: form.kind, year: Number(form.year), semester: kind.semestral ? Number(form.semester) : null }), 'No fue posible registrar el pago');
    if (response) toast.success(`Registrado para la próxima nómina: ${response.data.created} persona(s)`);
  };

  return (
    <div className="space-y-6">
      <p role="note" className="p-3 rounded-xl border border-[var(--app-border)] text-sm" data-testid="benefits-note">
        Consulta interna: esta app no sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP. Los valores salen de las nóminas aprobadas; confírmalos con tu contador.
      </p>
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Prestaciones sociales</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <label className="text-sm">Prestación
              <select className="nexus-field" value={form.kind} onChange={(e) => { setForm({ ...form, kind: e.target.value }); setResult(null); }} data-testid="benefit-kind">
                {KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm">Año<input className="nexus-field" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
            {kind.semestral && (
              <label className="text-sm">Semestre
                <select className="nexus-field" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                  <option value={1}>Enero a junio</option>
                  <option value={2}>Julio a diciembre</option>
                </select>
              </label>
            )}
            <button type="button" className="nexus-button nexus-button-primary" onClick={preview} data-testid="benefit-preview">Calcular</button>
          </div>
          {result && (
            <div className="space-y-3" data-testid="benefit-result">
              <p className="text-sm">{result.deadline}</p>
              {result.items.length === 0 ? <EmptyState title="Sin nóminas aprobadas en ese periodo" description="Aprueba las nóminas del periodo para que se causen las prestaciones." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[var(--app-text-secondary)]"><th className="p-2">Empleado</th><th className="p-2">Meses</th><th className="p-2 text-right">Valor causado</th></tr></thead>
                    <tbody>
                      {result.items.map((row) => <tr key={row.barber_id} className="border-t border-[var(--app-border)]"><td className="p-2">{row.name}</td><td className="p-2">{row.months.map((m) => MONTHS[m - 1]).join(', ')}</td><td className="p-2 text-right">{cop(row.amount)}</td></tr>)}
                      <tr className="border-t border-[var(--app-border)] font-semibold"><td className="p-2">Total</td><td /><td className="p-2 text-right" data-testid="benefit-total">{cop(result.total)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="nexus-button" onClick={() => download(() => payrollAPI.downloadBenefit(form.kind, query), `${form.kind}_${form.year}.xlsx`)} data-testid="benefit-download"><FileSpreadsheet size={16} /> Descargar Excel</button>
                {kind.applicable && result.items.length > 0 && <button type="button" className="nexus-button" onClick={apply} data-testid="benefit-apply">Registrar pago en la próxima nómina</button>}
                {!kind.applicable && <span className="text-sm text-[var(--app-text-secondary)]">Las cesantías se consignan al fondo; no se pagan en la nómina.</span>}
              </div>
            </div>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Sábana de nómina del año</h2>
          <p className="text-sm text-[var(--app-text-secondary)]">Excel con cada empleado y mes de las nóminas aprobadas o pagadas, para consulta interna.</p>
          <button type="button" className="nexus-button" onClick={() => download(() => payrollAPI.downloadSabana({ ...scope, year: Number(form.year) }), `sabana_nomina_${form.year}.xlsx`)} data-testid="sabana-download"><FileSpreadsheet size={16} /> Descargar sábana {form.year}</button>
        </div>
      </SurfaceCard>

    </div>
  );
}

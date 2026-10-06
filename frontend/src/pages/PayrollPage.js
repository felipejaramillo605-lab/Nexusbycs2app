import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { payrollAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { AccessibleModal, EmptyState, LoadingState, MetricCard, MotionPage, PageHeader, SegmentedControl, SurfaceCard } from '../components/design';
import { saveBlob } from '../lib/download';
import PayrollNoveltiesTab from '../components/PayrollNoveltiesTab';
import PayrollBenefitsTab from '../components/PayrollBenefitsTab';

const cop = (value) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STATUS = { draft: 'Borrador', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada' };
const CONTRACT = { service_commission: 'Por servicio (comisión)', fixed_salary: 'Fijo (salario)' };
const FREQUENCY = { monthly: 'Mensual', biweekly: 'Quincenal' };
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const runLabel = (run) => `${run.frequency === 'biweekly' ? `${run.half === 1 ? '1.ª' : '2.ª'} quincena de ` : ''}${MONTHS[run.month - 1]} de ${run.year}`;

// Nomina: contratos, auxilios, corridas mensuales/quincenales, correcciones, Excel y colillas.
// Herramienta de apoyo para organizar costos de personal: NO reemplaza un software de nomina.
export default function PayrollPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? params.get('org_id') : user?.organization_id) || user?.organization_id;
  const scope = useMemo(() => ({ organization_id: organizationId }), [organizationId]);
  const [tab, setTab] = useState('runs');

  return (
    <MotionPage>
      <PageHeader eyebrow="Finanzas" title="Nómina" description="Contratos del equipo, aportes, prestaciones, colillas y reporte mensual de gastos de personal." />
      <p role="note" className="mb-4 p-3 rounded-xl border border-[var(--app-border)] text-sm" data-testid="payroll-disclaimer">
        Esta herramienta ayuda a organizar y estimar los costos de personal. <strong>No reemplaza un software de nómina</strong> ni la asesoría de un contador, y <strong>esta app no sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP</strong>.
      </p>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[{ value: 'runs', label: 'Nóminas' }, { value: 'novelties', label: 'Novedades' }, { value: 'benefits', label: 'Prestaciones' }, { value: 'contracts', label: 'Contratos' }, { value: 'extras', label: 'Auxilios extras' }, { value: 'settings', label: 'Parámetros' }]}
      />
      <div className="mt-4">
        {tab === 'runs' && <RunsTab scope={scope} />}
        {tab === 'novelties' && <PayrollNoveltiesTab scope={scope} />}
        {tab === 'benefits' && <PayrollBenefitsTab scope={scope} />}
        {tab === 'contracts' && <ContractsTab scope={scope} />}
        {tab === 'extras' && <ExtrasTab scope={scope} />}
        {tab === 'settings' && <SettingsTab scope={scope} />}
      </div>
    </MotionPage>
  );
}

// ---------------------------------------------------------------------------------- Nóminas
function RunsTab({ scope }) {
  const now = new Date();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, frequency: 'monthly', half: 1 });
  const [run, setRun] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await payrollAPI.listRuns(scope);
      setRuns(data.items || []);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar las nóminas'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (id) => {
    try {
      const { data } = await payrollAPI.getRun(id, scope);
      setRun(data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible abrir la nómina'));
    }
  };

  const act = async (fn, success) => {
    setBusy(true);
    try {
      const { data } = await fn();
      if (success) toast.success(success);
      if (data?.run_id) setRun(data);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible completar la acción'));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(
      () => payrollAPI.createRun({ ...scope, year: Number(form.year), month: Number(form.month), frequency: form.frequency, half: form.frequency === 'biweekly' ? Number(form.half) : null }),
      'Nómina creada en borrador',
    );

  const download = async (fn, fallback) => {
    try {
      saveBlob(await fn(), fallback);
    } catch (error) {
      toast.error('No fue posible descargar el archivo');
    }
  };

  const payments = async (item) => {
    try {
      const { data } = await payrollAPI.dispersionPreview(item.run_id, scope);
      if (data.missing.length) toast.error(`Faltan datos bancarios de: ${data.missing.join(', ')}`);
      if (data.ready.length) saveBlob(await payrollAPI.downloadDispersion(item.run_id, scope), `dispersion_${item.number}.csv`);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible generar el archivo de pagos'));
    }
  };

  if (loading) return <LoadingState />;
  const totals = run?.totals;
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Nueva nómina</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <label className="text-sm">Año
              <input className="nexus-field" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} data-testid="run-year" />
            </label>
            <label className="text-sm">Mes
              <select className="nexus-field" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} data-testid="run-month">
                {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
            </label>
            <label className="text-sm">Frecuencia
              <select className="nexus-field" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} data-testid="run-frequency">
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
              </select>
            </label>
            {form.frequency === 'biweekly' && (
              <label className="text-sm">Quincena
                <select className="nexus-field" value={form.half} onChange={(e) => setForm({ ...form, half: e.target.value })}>
                  <option value={1}>Primera (1 al 15)</option>
                  <option value={2}>Segunda (16 al fin)</option>
                </select>
              </label>
            )}
            <button type="button" className="nexus-button nexus-button-primary" disabled={busy} onClick={create} data-testid="create-run"><Plus size={16} /> Crear nómina</button>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-2">
          <h2 className="text-lg">Nóminas</h2>
          {runs.length === 0 ? <EmptyState title="Aún no hay nóminas" description="Define los contratos del equipo y crea la primera nómina del mes." /> : runs.map((item) => (
            <button key={item.run_id} type="button" className="nexus-button w-full text-left justify-between" onClick={() => open(item.run_id)} data-testid="run-row">
              <span>{item.number} · {runLabel(item)}</span>
              <span>{STATUS[item.status]} · {cop(item.totals?.total_personnel_cost)}</span>
            </button>
          ))}
        </div>
      </SurfaceCard>

      {run && (
        <SurfaceCard>
          <div className="p-4 space-y-4" data-testid="run-detail">
            <h2 className="text-lg">{run.number} · {runLabel(run)} <span className="text-sm text-[var(--app-text-secondary)]">({STATUS[run.status]} · versión {run.version})</span></h2>
            <div className="nexus-metric-grid">
              <MetricCard label="Neto a pagar" value={cop(totals.net)} />
              <MetricCard label="Deducciones empleados" value={cop(totals.deductions)} />
              <MetricCard label="Aportes del empleador" value={cop(totals.employer)} />
              <MetricCard label="Provisiones" value={cop(totals.provisions)} />
              <MetricCard label="Honorarios por servicio" value={cop(totals.commissions)} />
              <MetricCard label="Costo total de personal" value={cop(totals.total_personnel_cost)} />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="nexus-button" onClick={() => download(() => payrollAPI.downloadReport(run.run_id, scope), `${run.number}_gastos_de_personal.xlsx`)} data-testid="download-report"><FileSpreadsheet size={16} /> Descargar Excel</button>
              {['approved', 'paid'].includes(run.status) && <button type="button" className="nexus-button" onClick={() => payments(run)} data-testid="download-dispersion">Archivo de pagos (CSV)</button>}
              {run.status === 'draft' && <button type="button" className="nexus-button nexus-button-primary" disabled={busy} onClick={() => act(() => payrollAPI.approve(run.run_id, scope), 'Nómina aprobada')} data-testid="approve-run">Aprobar</button>}
              {run.status === 'draft' && <button type="button" className="nexus-button" disabled={busy} onClick={() => act(() => payrollAPI.cancel(run.run_id, scope), 'Nómina cancelada')}>Cancelar nómina</button>}
              {run.status === 'approved' && <button type="button" className="nexus-button nexus-button-primary" disabled={busy} onClick={() => act(() => payrollAPI.pay(run.run_id, scope), 'Nómina marcada como pagada')}>Marcar como pagada</button>}
              {['approved', 'paid'].includes(run.status) && <button type="button" className="nexus-button" onClick={() => { setReason(''); setReopening(true); }} data-testid="reopen-run">Reabrir para corregir</button>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="run-lines">
                <thead><tr className="text-left text-[var(--app-text-secondary)]"><th className="p-2">Empleado</th><th className="p-2">Contrato</th><th className="p-2 text-right">Días</th><th className="p-2 text-right">Devengado</th><th className="p-2 text-right">Deducciones</th><th className="p-2 text-right">Neto / honorarios</th><th className="p-2 text-right">Costo empleador</th><th className="p-2">Acciones</th></tr></thead>
                <tbody>
                  {run.lines.map((line) => (
                    <tr key={line.barber_id} className="border-t border-[var(--app-border)]">
                      <td className="p-2">{line.name}</td>
                      <td className="p-2">{CONTRACT[line.contract_type]}</td>
                      <td className="p-2 text-right">{line.computed ? line.computed.days_worked : '—'}</td>
                      <td className="p-2 text-right">{line.computed ? cop(line.computed.gross) : '—'}</td>
                      <td className="p-2 text-right">{line.computed ? cop(line.computed.deductions_total) : '—'}</td>
                      <td className="p-2 text-right">{line.computed ? cop(line.computed.net_pay) : cop(line.settlement_total)}</td>
                      <td className="p-2 text-right">{line.computed ? cop(line.computed.employer_cost) : '—'}</td>
                      <td className="p-2 whitespace-nowrap space-x-2">
                        {run.status === 'draft' && line.computed && <button type="button" className="nexus-link-action" onClick={() => setEditing(line)} data-testid="edit-line">Editar</button>}
                        <button type="button" className="nexus-link-action" onClick={() => download(() => payrollAPI.downloadSlip(run.run_id, line.barber_id, scope), `colilla_${line.name}.pdf`)}><Download size={14} /> Colilla</button>
                      </td>
                    </tr>
                  ))}
                  {run.lines.length === 0 && <tr><td className="p-3" colSpan={8}>Esta nómina no tiene empleados. Revisa los contratos del equipo.</td></tr>}
                </tbody>
              </table>
            </div>
            {run.lines.some((line) => line.computed?.notes?.length) && (
              <ul className="text-xs text-[var(--app-text-secondary)] list-disc pl-5 space-y-1">
                {run.lines.flatMap((line) => (line.computed?.notes || []).map((note) => <li key={`${line.barber_id}-${note}`}>{line.name}: {note}</li>))}
              </ul>
            )}
            {run.corrections?.length > 0 && (
              <div className="text-sm" data-testid="corrections">
                <h3 className="font-medium">Correcciones</h3>
                <ul className="list-disc pl-5">{run.corrections.map((item) => <li key={item.at}>{item.at.slice(0, 10)} — {item.reason}</li>)}</ul>
              </div>
            )}
          </div>
        </SurfaceCard>
      )}

      {editing && <LineEditor line={editing} onClose={() => setEditing(null)} onSave={async (data) => { await act(() => payrollAPI.saveLine(run.run_id, editing.barber_id, data, scope), 'Cambios guardados'); setEditing(null); }} />}
      {reopening && (
        <AccessibleModal open onClose={() => setReopening(false)} labelledBy="reopen-title">
          <section className="nexus-void-modal">
            <h2 id="reopen-title">Reabrir para corregir</h2>
            <p>La nómina vuelve a borrador (nueva versión) y queda registro del motivo.</p>
            <label className="text-sm block">Motivo de la corrección
              <textarea className="nexus-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reopen-reason" />
            </label>
            <footer className="flex gap-3 mt-3">
              <button type="button" className="nexus-button" onClick={() => setReopening(false)}>Cancelar</button>
              <button type="button" className="nexus-button nexus-button-primary" disabled={reason.trim().length < 5 || busy} data-testid="confirm-reopen"
                onClick={async () => { await act(() => payrollAPI.reopen(run.run_id, { reason }, scope), 'Nómina reabierta'); setReopening(false); }}>Reabrir</button>
            </footer>
          </section>
        </AccessibleModal>
      )}
    </div>
  );
}

function LineEditor({ line, onClose, onSave }) {
  const [days, setDays] = useState(line.computed.days_worked);
  const [rows, setRows] = useState((line.adjustments || []).map((a) => ({ ...a })));
  const setRow = (index, patch) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <AccessibleModal open onClose={onClose} labelledBy="line-title">
      <section className="nexus-void-modal">
        <h2 id="line-title">Novedades de {line.name}</h2>
        <label className="text-sm block">Días pagados (0 a {line.computed.period_days})
          <input className="nexus-field" type="number" min="0" max={line.computed.period_days} step="0.5" value={days} onChange={(e) => setDays(e.target.value)} data-testid="line-days" />
        </label>
        <h3 className="font-medium mt-3">Devengos y descuentos adicionales</h3>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end mt-2" data-testid="adjustment-row">
            <label className="text-xs md:col-span-2">Concepto<input className="nexus-field" value={row.label} onChange={(e) => setRow(index, { label: e.target.value })} /></label>
            <label className="text-xs">Tipo
              <select className="nexus-field" value={row.kind} onChange={(e) => setRow(index, { kind: e.target.value })}>
                <option value="earning">Devengo</option>
                <option value="deduction">Descuento</option>
              </select>
            </label>
            <label className="text-xs">Valor<input className="nexus-field" type="number" min="0" value={row.amount} onChange={(e) => setRow(index, { amount: e.target.value })} /></label>
            <button type="button" aria-label="Quitar" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
            {row.kind === 'earning' && <label className="text-xs col-span-2 md:col-span-5 flex gap-2"><input type="checkbox" checked={!!row.constitutes_salary} onChange={(e) => setRow(index, { constitutes_salary: e.target.checked })} /> Constituye salario (cuenta para aportes y prestaciones)</label>}
          </div>
        ))}
        <button type="button" className="nexus-button mt-3" onClick={() => setRows([...rows, { label: '', kind: 'earning', amount: '', constitutes_salary: false }])} data-testid="add-adjustment"><Plus size={16} /> Agregar novedad</button>
        <footer className="flex gap-3 mt-4">
          <button type="button" className="nexus-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="nexus-button nexus-button-primary" data-testid="save-line"
            onClick={() => onSave({ days_worked: Number(days), adjustments: rows.filter((r) => r.label.trim() && Number(r.amount) > 0).map((r) => ({ label: r.label.trim(), kind: r.kind, amount: Number(r.amount), constitutes_salary: !!r.constitutes_salary })) })}>Guardar</button>
        </footer>
      </section>
    </AccessibleModal>
  );
}

// ---------------------------------------------------------------------------------- Contratos
function ContractsTab({ scope }) {
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [contracts, config] = await Promise.all([payrollAPI.listContracts(scope), payrollAPI.getSettings(scope)]);
      setRows(contracts.data.items || []);
      setSettings(config.data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar los contratos'));
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const body = { ...scope, contract_type: editing.contract_type, pay_frequency: editing.pay_frequency || 'monthly', arl_risk_class: editing.arl_risk_class || 'I', start_date: editing.start_date || null, bank_name: editing.bank_name || null, account_type: editing.account_type || null, account_number: editing.account_number || null, birth_date: editing.birth_date || null, cost_center: editing.cost_center || null, document: editing.document || null, position: editing.position || null };
      if (editing.contract_type === 'fixed_salary') body.base_salary = Number(editing.base_salary);
      await payrollAPI.saveContract(editing.barber_id, body);
      toast.success('Contrato guardado');
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible guardar el contrato'));
    }
  };

  if (loading) return <LoadingState />;
  const smmlv = settings?.params?.smmlv;
  return (
    <SurfaceCard>
      <div className="p-4 space-y-3">
        <h2 className="text-lg">Contrato de cada profesional</h2>
        <p className="text-sm text-[var(--app-text-secondary)]">
          <strong>Por servicio:</strong> gana un porcentaje de los servicios (se paga con las liquidaciones). <strong>Fijo:</strong> salario básico (nunca menor al mínimo{smmlv ? `, ${cop(smmlv)}` : ''}) con aportes y prestaciones.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="contracts-table">
            <thead><tr className="text-left text-[var(--app-text-secondary)]"><th className="p-2">Profesional</th><th className="p-2">Contrato</th><th className="p-2 text-right">Salario básico</th><th className="p-2">Pago</th><th className="p-2" /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.barber_id} className="border-t border-[var(--app-border)]" data-testid="contract-row">
                  <td className="p-2">{row.name}</td>
                  <td className="p-2">{CONTRACT[row.contract_type]}</td>
                  <td className="p-2 text-right">{row.contract_type === 'fixed_salary' ? cop(row.base_salary) : '—'}</td>
                  <td className="p-2">{row.contract_type === 'fixed_salary' ? FREQUENCY[row.pay_frequency] : '—'}</td>
                  <td className="p-2"><button type="button" className="nexus-link-action" onClick={() => setEditing({ ...row })} data-testid="edit-contract">Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <AccessibleModal open onClose={() => setEditing(null)} labelledBy="contract-title">
          <section className="nexus-void-modal">
            <h2 id="contract-title">Contrato de {editing.name}</h2>
            <label className="text-sm block">Tipo de contrato
              <select className="nexus-field" value={editing.contract_type} onChange={(e) => setEditing({ ...editing, contract_type: e.target.value })} data-testid="contract-type">
                <option value="service_commission">Por servicio (porcentaje)</option>
                <option value="fixed_salary">Fijo (salario)</option>
              </select>
            </label>
            {editing.contract_type === 'fixed_salary' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <label className="text-sm">Salario básico (COP)
                  <input className="nexus-field" type="number" min="0" value={editing.base_salary ?? ''} onChange={(e) => setEditing({ ...editing, base_salary: e.target.value })} data-testid="contract-salary" />
                  {smmlv && <button type="button" className="nexus-link-action" onClick={() => setEditing({ ...editing, base_salary: smmlv })}>Usar salario mínimo ({cop(smmlv)})</button>}
                </label>
                <label className="text-sm">Frecuencia de pago
                  <select className="nexus-field" value={editing.pay_frequency || 'monthly'} onChange={(e) => setEditing({ ...editing, pay_frequency: e.target.value })}>
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                  </select>
                </label>
                <label className="text-sm">Clase de riesgo ARL
                  <select className="nexus-field" value={editing.arl_risk_class || 'I'} onChange={(e) => setEditing({ ...editing, arl_risk_class: e.target.value })}>
                    {Object.entries(settings?.risk_classes || { I: 'Riesgo I' }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Fecha de ingreso
                  <input className="nexus-field" type="date" value={editing.start_date || ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
                </label>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="text-sm">Documento (para la colilla)<input className="nexus-field" value={editing.document || ''} onChange={(e) => setEditing({ ...editing, document: e.target.value })} /></label>
              <label className="text-sm">Cargo<input className="nexus-field" value={editing.position || ''} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></label>
              <label className="text-sm">Fecha de nacimiento (cumpleaños del equipo)<input className="nexus-field" type="date" value={editing.birth_date || ''} onChange={(e) => setEditing({ ...editing, birth_date: e.target.value })} /></label>
              <label className="text-sm">Banco (para el archivo de pagos)<input className="nexus-field" value={editing.bank_name || ''} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} /></label>
              <label className="text-sm">Tipo de cuenta
                <select className="nexus-field" value={editing.account_type || ''} onChange={(e) => setEditing({ ...editing, account_type: e.target.value })}>
                  <option value="">—</option>
                  <option value="savings">Ahorros</option>
                  <option value="checking">Corriente</option>
                </select>
              </label>
              <label className="text-sm">Número de cuenta<input className="nexus-field" value={editing.account_number || ''} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} /></label>
              <label className="text-sm">Centro de costos (opcional)<input className="nexus-field" value={editing.cost_center || ''} onChange={(e) => setEditing({ ...editing, cost_center: e.target.value })} placeholder="Ej: Sede Norte" /></label>
            </div>
            <footer className="flex gap-3 mt-4">
              <button type="button" className="nexus-button" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="nexus-button nexus-button-primary" onClick={save} data-testid="save-contract">Guardar contrato</button>
            </footer>
          </section>
        </AccessibleModal>
      )}
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------------- Auxilios extras
const EMPTY_EXTRA = { name: '', kind: 'fixed', value: '', constitutes_salary: false, applies_to: 'all', barber_ids: [], active: true };

function ExtrasTab({ scope }) {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [extras, contracts] = await Promise.all([payrollAPI.listExtras(scope), payrollAPI.listContracts(scope)]);
      setItems(extras.data.items || []);
      setStaff(contracts.data.items || []);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar los auxilios'));
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const body = { ...scope, name: editing.name, kind: editing.kind, value: Number(editing.value), constitutes_salary: !!editing.constitutes_salary, applies_to: editing.applies_to, barber_ids: editing.applies_to === 'selected' ? editing.barber_ids : [], active: editing.active };
      if (editing.extra_id) await payrollAPI.updateExtra(editing.extra_id, body);
      else await payrollAPI.createExtra(body);
      toast.success('Auxilio guardado');
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible guardar el auxilio'));
    }
  };
  const remove = async (item) => {
    try {
      await payrollAPI.deleteExtra(item.extra_id, scope);
      toast.success('Auxilio eliminado');
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible eliminar'));
    }
  };

  if (loading) return <LoadingState />;
  return (
    <SurfaceCard>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg">Auxilios extras</h2>
            <p className="text-sm text-[var(--app-text-secondary)]">Internet, rodamiento, celular u otros. Valor fijo mensual o porcentaje del básico. Solo se aplican a contratos fijos.</p>
          </div>
          <button type="button" className="nexus-button nexus-button-primary" onClick={() => setEditing({ ...EMPTY_EXTRA })} data-testid="new-extra"><Plus size={16} /> Nuevo auxilio</button>
        </div>
        {items.length === 0 ? <EmptyState title="Sin auxilios extras" description="Crea los que tu negocio otorga además de los beneficios obligatorios." /> : items.map((item) => (
          <div key={item.extra_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="extra-row">
            <div>
              <strong>{item.name}</strong>{!item.active && ' (inactivo)'}
              <div className="text-sm text-[var(--app-text-secondary)]">{item.kind === 'percent' ? `${item.value}% del básico` : `${cop(item.value)} al mes`} · {item.constitutes_salary ? 'Constituye salario' : 'No constituye salario'} · {item.applies_to === 'all' ? 'Todos los contratos fijos' : `${item.barber_ids.length} persona(s)`}</div>
            </div>
            <div className="flex gap-3">
              <button type="button" className="nexus-link-action" onClick={() => setEditing({ ...item })}>Editar</button>
              <button type="button" className="nexus-link-action" onClick={() => remove(item)} data-testid="delete-extra">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <AccessibleModal open onClose={() => setEditing(null)} labelledBy="extra-title">
          <section className="nexus-void-modal">
            <h2 id="extra-title">{editing.extra_id ? 'Editar auxilio' : 'Nuevo auxilio'}</h2>
            <label className="text-sm block">Nombre<input className="nexus-field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Auxilio de internet" data-testid="extra-name" /></label>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-sm">Tipo de valor
                <select className="nexus-field" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} data-testid="extra-kind">
                  <option value="fixed">Valor fijo (COP al mes)</option>
                  <option value="percent">% del salario básico</option>
                </select>
              </label>
              <label className="text-sm">{editing.kind === 'percent' ? 'Porcentaje' : 'Valor'}<input className="nexus-field" type="number" min="0" value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} data-testid="extra-value" /></label>
            </div>
            <label className="text-sm flex gap-2 mt-3"><input type="checkbox" checked={editing.constitutes_salary} onChange={(e) => setEditing({ ...editing, constitutes_salary: e.target.checked })} /> Constituye salario (cuenta para aportes, prima y cesantías)</label>
            <label className="text-sm flex gap-2 mt-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Activo</label>
            <label className="text-sm block mt-3">Aplica a
              <select className="nexus-field" value={editing.applies_to} onChange={(e) => setEditing({ ...editing, applies_to: e.target.value })}>
                <option value="all">Todos los contratos fijos</option>
                <option value="selected">Personas elegidas</option>
              </select>
            </label>
            {editing.applies_to === 'selected' && (
              <div className="mt-2 space-y-1">
                {staff.filter((s) => s.contract_type === 'fixed_salary').map((person) => (
                  <label key={person.barber_id} className="text-sm flex gap-2">
                    <input type="checkbox" checked={editing.barber_ids.includes(person.barber_id)} onChange={(e) => setEditing({ ...editing, barber_ids: e.target.checked ? [...editing.barber_ids, person.barber_id] : editing.barber_ids.filter((id) => id !== person.barber_id) })} /> {person.name}
                  </label>
                ))}
              </div>
            )}
            <footer className="flex gap-3 mt-4">
              <button type="button" className="nexus-button" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="nexus-button nexus-button-primary" onClick={save} data-testid="save-extra">Guardar</button>
            </footer>
          </section>
        </AccessibleModal>
      )}
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------------- Parámetros
function SettingsTab({ scope }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: loaded } = await payrollAPI.getSettings(scope);
      setData(loaded);
      setForm({ exonerated: loaded.exonerated, default_arl_class: loaded.default_arl_class, smmlv: loaded.params.smmlv, transport_aid: loaded.params.transport_aid });
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar los parámetros'));
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  if (!data || !form) return <LoadingState />;
  const year = data.params.year;
  const save = async () => {
    try {
      await payrollAPI.saveSettings({ ...scope, exonerated: form.exonerated, default_arl_class: form.default_arl_class, params_overrides: { ...(data.params_overrides || {}), [year]: { smmlv: Number(form.smmlv), transport_aid: Number(form.transport_aid) } } });
      toast.success('Parámetros guardados');
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible guardar'));
    }
  };
  return (
    <SurfaceCard>
      <div className="p-4 space-y-4">
        <h2 className="text-lg">Parámetros legales {year}</h2>
        <p className="text-sm text-[var(--app-text-secondary)]">Valores por defecto de Nexus. Verifica el decreto vigente y ajústalos aquí si cambian. Después de 2 SMMLV no aplica auxilio de transporte.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">Salario mínimo (SMMLV)<input className="nexus-field" type="number" value={form.smmlv} onChange={(e) => setForm({ ...form, smmlv: e.target.value })} data-testid="param-smmlv" /></label>
          <label className="text-sm">Auxilio de transporte<input className="nexus-field" type="number" value={form.transport_aid} onChange={(e) => setForm({ ...form, transport_aid: e.target.value })} data-testid="param-transport" /></label>
          <label className="text-sm">Clase de riesgo ARL por defecto
            <select className="nexus-field" value={form.default_arl_class} onChange={(e) => setForm({ ...form, default_arl_class: e.target.value })}>
              {Object.entries(data.risk_classes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="text-sm flex gap-2"><input type="checkbox" checked={form.exonerated} onChange={(e) => setForm({ ...form, exonerated: e.target.checked })} data-testid="param-exonerated" /> Empleador exonerado de salud, SENA e ICBF (art. 114-1 E.T.) para salarios menores a 10 SMMLV</label>
        <p className="text-xs text-[var(--app-text-secondary)]">{data.disclaimer}</p>
        <button type="button" className="nexus-button nexus-button-primary" onClick={save} data-testid="save-settings">Guardar parámetros</button>
      </div>
    </SurfaceCard>
  );
}

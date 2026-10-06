import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { wellbeingAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState, MotionPage, PageHeader, SegmentedControl, SurfaceCard } from '../components/design';

const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const STAGES = { received: 'Recibida', interview: 'En entrevista', trial: 'En prueba', hired: 'Contratado', rejected: 'No continúa' };
const REWARD_TYPES = { amount: 'Monto en COP (bono no constitutivo de salario)', points: 'Puntos de la billetera', text: 'Otra (ej. medio día libre)' };

// Bienestar y cultura para el manager: catalogo de beneficios, referidos, buzon de la linea etica y beneficiarios.
export default function ManagerWellbeing() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? params.get('org_id') : user?.organization_id) || user?.organization_id;
  const scope = useMemo(() => ({ organization_id: organizationId }), [organizationId]);
  const [tab, setTab] = useState('benefits');
  return (
    <MotionPage>
      <PageHeader eyebrow="Equipo" title="Bienestar y cultura" description="Beneficios del equipo, programa de referidos, línea ética confidencial y beneficiarios." />
      <SegmentedControl value={tab} onChange={setTab} options={[{ value: 'benefits', label: 'Beneficios' }, { value: 'referrals', label: 'Referidos' }, { value: 'ethics', label: 'Línea ética' }, { value: 'beneficiaries', label: 'Beneficiarios' }]} />
      <div className="mt-4">
        {tab === 'benefits' && <BenefitsTab scope={scope} />}
        {tab === 'referrals' && <ReferralsTab scope={scope} />}
        {tab === 'ethics' && <EthicsTab scope={scope} />}
        {tab === 'beneficiaries' && <BeneficiariesTab scope={scope} />}
      </div>
      <p className="mt-6 text-xs text-[var(--app-text-secondary)]">Herramienta de gestión interna. No sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP, ni reemplaza el Comité de Convivencia Laboral.</p>
    </MotionPage>
  );
}

function useScoped(fn, scope) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try {
      setData((await fn(scope)).data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar la información'));
    }
  }, [fn, scope]);
  useEffect(() => {
    load();
  }, [load]);
  return [data, load];
}

function useAct(load) {
  return async (fn, success) => {
    try {
      await fn();
      if (success) toast.success(success);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible completar la acción'));
    }
  };
}

function BenefitsTab({ scope }) {
  const [data, load] = useScoped(wellbeingAPI.benefits, scope);
  const act = useAct(load);
  const [form, setForm] = useState({ name: '', description: '', points_cost: '' });
  const [grant, setGrant] = useState({ barber_id: '', points: '', reason: '' });
  if (!data) return <LoadingState />;
  const pending = data.redemptions.filter((row) => row.status === 'pending');
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3" data-testid="redemptions">
          <h2 className="text-lg">Canjes por aprobar ({pending.length})</h2>
          {pending.length === 0 ? <EmptyState title="Sin canjes pendientes" description="Cuando alguien canjee puntos aparecerá aquí." /> : pending.map((row) => (
            <div key={row.redemption_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="redemption-row">
              <span><strong>{row.employee_name}</strong> — {row.benefit_name} ({row.points_cost} puntos)</span>
              <span className="flex gap-2">
                <button type="button" className="nexus-button nexus-button-primary" onClick={() => act(() => wellbeingAPI.decideRedemption(row.redemption_id, { approve: true }, scope), 'Canje aprobado')} data-testid="approve-redemption">Aprobar</button>
                <button type="button" className="nexus-button" onClick={() => act(() => wellbeingAPI.decideRedemption(row.redemption_id, { approve: false }, scope), 'Canje rechazado, puntos devueltos')}>Rechazar</button>
              </span>
            </div>
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Catálogo de beneficios extralegales</h2>
          <p className="text-sm text-[var(--app-text-secondary)]">Auxilio de educación, bonos, medicina prepagada u otros. Cada uno cuesta una cantidad de puntos que tú asignas al equipo.</p>
          {data.catalog.filter((item) => item.active).map((item) => (
            <div key={item.benefit_id} className="flex flex-wrap items-center justify-between gap-2" data-testid="catalog-row">
              <span><strong>{item.name}</strong> · {item.points_cost} puntos{item.description ? ` · ${item.description}` : ''}</span>
              <button type="button" className="nexus-link-action" onClick={() => act(() => wellbeingAPI.archiveBenefit(item.benefit_id, scope), 'Beneficio archivado')}>Archivar</button>
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="text-sm">Nombre<input className="nexus-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="benefit-name" /></label>
            <label className="text-sm">Descripción<input className="nexus-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="text-sm">Costo en puntos<input className="nexus-field" type="number" min="1" value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: e.target.value })} data-testid="benefit-cost" /></label>
            <button type="button" className="nexus-button nexus-button-primary" disabled={form.name.trim().length < 2 || !(Number(form.points_cost) > 0)}
              onClick={() => act(async () => { await wellbeingAPI.createBenefit({ ...scope, name: form.name, description: form.description || null, points_cost: Number(form.points_cost) }); setForm({ name: '', description: '', points_cost: '' }); }, 'Beneficio creado')} data-testid="benefit-create">Crear</button>
          </div>
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Asignar puntos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="text-sm">Persona
              <select className="nexus-field" value={grant.barber_id} onChange={(e) => setGrant({ ...grant, barber_id: e.target.value })} data-testid="grant-person">
                <option value="">Selecciona</option>
                {data.balances.map((row) => <option key={row.barber_id} value={row.barber_id}>{`${row.name} (${row.balance} puntos)`}</option>)}
              </select>
            </label>
            <label className="text-sm">Puntos<input className="nexus-field" type="number" value={grant.points} onChange={(e) => setGrant({ ...grant, points: e.target.value })} data-testid="grant-points" /></label>
            <label className="text-sm">Motivo<input className="nexus-field" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} data-testid="grant-reason" /></label>
            <button type="button" className="nexus-button nexus-button-primary" disabled={!grant.barber_id || !Number(grant.points) || grant.reason.trim().length < 3}
              onClick={() => act(async () => { await wellbeingAPI.grantPoints({ ...scope, barber_id: grant.barber_id, points: Number(grant.points), reason: grant.reason }); setGrant({ barber_id: '', points: '', reason: '' }); }, 'Puntos asignados')} data-testid="grant-submit">Asignar</button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

function ReferralsTab({ scope }) {
  const [vacancies, loadVacancies] = useScoped(wellbeingAPI.vacancies, scope);
  const [referrals, loadReferrals] = useScoped(wellbeingAPI.referrals, scope);
  const reload = useCallback(async () => { await Promise.all([loadVacancies(), loadReferrals()]); }, [loadVacancies, loadReferrals]);
  const act = useAct(reload);
  const [form, setForm] = useState({ title: '', reward_type: 'amount', reward_value: '', reward_text: '' });
  if (!vacancies || !referrals) return <LoadingState />;
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Vacantes abiertas</h2>
          {vacancies.items.map((v) => (
            <div key={v.vacancy_id} className="flex flex-wrap items-center justify-between gap-2" data-testid="vacancy-row">
              <span><strong>{v.title}</strong> · {v.open ? 'abierta' : 'cerrada'}</span>
              <button type="button" className="nexus-link-action" onClick={() => act(() => wellbeingAPI.toggleVacancy(v.vacancy_id, scope), 'Vacante actualizada')}>{v.open ? 'Cerrar' : 'Abrir'}</button>
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="text-sm">Cargo<input className="nexus-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="vacancy-title" /></label>
            <label className="text-sm">Recompensa
              <select className="nexus-field" value={form.reward_type} onChange={(e) => setForm({ ...form, reward_type: e.target.value })} data-testid="vacancy-reward-type">
                {Object.entries(REWARD_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            {form.reward_type === 'text'
              ? <label className="text-sm">Descripción<input className="nexus-field" value={form.reward_text} onChange={(e) => setForm({ ...form, reward_text: e.target.value })} /></label>
              : <label className="text-sm">Valor<input className="nexus-field" type="number" min="1" value={form.reward_value} onChange={(e) => setForm({ ...form, reward_value: e.target.value })} data-testid="vacancy-reward-value" /></label>}
            <button type="button" className="nexus-button nexus-button-primary" disabled={form.title.trim().length < 2}
              onClick={() => act(async () => { await wellbeingAPI.createVacancy({ ...scope, title: form.title, reward_type: form.reward_type, reward_value: Number(form.reward_value) || 0, reward_text: form.reward_text || null }); setForm({ title: '', reward_type: 'amount', reward_value: '', reward_text: '' }); }, 'Vacante creada')} data-testid="vacancy-create">Crear vacante</button>
          </div>
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="referral-pipeline">
          <h2 className="text-lg">Referidos</h2>
          {referrals.items.length === 0 ? <EmptyState title="Sin referidos" description="Cuando tu equipo recomiende a alguien aparecerá aquí." /> : referrals.items.map((row) => (
            <div key={row.referral_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="referral-manager-row">
              <div>
                <strong>{row.candidate_name}</strong> ({row.candidate_contact}) — {row.vacancy_title}
                <div className="text-sm text-[var(--app-text-secondary)]">Referido por {row.referrer_name} · {row.stage_label}{row.reward_detail ? ` · ${row.reward_detail}` : ''}</div>
              </div>
              {!['hired', 'rejected'].includes(row.stage) && (
                <select className="nexus-field" style={{ maxWidth: '12rem' }} value="" onChange={(e) => e.target.value && act(() => wellbeingAPI.moveReferral(row.referral_id, { stage: e.target.value }, scope), 'Etapa actualizada')} data-testid="referral-stage">
                  <option value="">Mover a…</option>
                  {Object.entries(STAGES).filter(([key]) => key !== row.stage && key !== 'received').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

function EthicsTab({ scope }) {
  const [data, load] = useScoped(wellbeingAPI.ethicsInbox, scope);
  const act = useAct(load);
  const [reply, setReply] = useState({});
  if (!data) return <LoadingState />;
  return (
    <SurfaceCard>
      <div className="p-4 space-y-3" data-testid="ethics-inbox">
        <h2 className="text-lg">Buzón confidencial</h2>
        <p className="text-sm text-[var(--app-text-secondary)]">Los mensajes anónimos no tienen autor registrado. Puedes responder (la persona lo ve con su código) o escalar a Recursos Humanos o al Comité de Convivencia Laboral.</p>
        {data.items.length === 0 ? <EmptyState title="Sin reportes" description="Aquí llegarán las quejas y sugerencias de tu equipo." /> : data.items.map((row) => (
          <div key={row.report_id} className="p-3 rounded-xl border border-[var(--app-border)] space-y-2" data-testid="ethics-row">
            <div className="text-sm text-[var(--app-text-secondary)]">{row.category_label} · {row.status_label} · {row.anonymous ? 'Anónimo' : row.reporter_name} · {row.created_at.slice(0, 10)}</div>
            <p>{row.message}</p>
            {row.escalations.map((item) => <p key={item.at} className="text-xs">Escalado a {item.to_label}{item.note ? `: ${item.note}` : ''}</p>)}
            {row.replies.map((item) => <p key={item.at} className="text-xs">Respuesta: {item.message}</p>)}
            <div className="flex flex-wrap items-end gap-2">
              <input className="nexus-field" style={{ maxWidth: '22rem' }} placeholder="Escribe una respuesta" value={reply[row.report_id] || ''} onChange={(e) => setReply({ ...reply, [row.report_id]: e.target.value })} data-testid="ethics-reply" />
              <button type="button" className="nexus-button" disabled={(reply[row.report_id] || '').trim().length < 2} onClick={() => act(async () => { await wellbeingAPI.respondEthics(row.report_id, { message: reply[row.report_id], status: 'in_review' }, scope); setReply({ ...reply, [row.report_id]: '' }); }, 'Respuesta enviada')} data-testid="ethics-respond">Responder</button>
              <button type="button" className="nexus-button" onClick={() => act(() => wellbeingAPI.escalateEthics(row.report_id, { to: 'hr' }, scope), 'Escalado a Recursos Humanos')} data-testid="ethics-escalate-hr">A Recursos Humanos</button>
              <button type="button" className="nexus-button" onClick={() => act(() => wellbeingAPI.escalateEthics(row.report_id, { to: 'convivencia' }, scope), 'Escalado al Comité de Convivencia')} data-testid="ethics-escalate-committee">Al Comité de Convivencia</button>
            </div>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function BeneficiariesTab({ scope }) {
  const [data] = useScoped(wellbeingAPI.beneficiaries, scope);
  if (!data) return <LoadingState />;
  return (
    <SurfaceCard>
      <div className="p-4 space-y-2" data-testid="beneficiaries-list">
        <h2 className="text-lg">Beneficiarios del equipo (caja de compensación)</h2>
        {data.items.length === 0 ? <EmptyState title="Sin beneficiarios" description="Tu equipo los registra desde Bienestar." /> : data.items.map((row) => (
          <div key={row.beneficiary_id} className="text-sm" data-testid="beneficiary-manager-row">{row.employee_name} — <strong>{row.full_name}</strong> · {row.relationship_label} · {row.document_type} {row.document_number}{row.birth_date ? ` · nació el ${row.birth_date}` : ''}{row.document_id ? ' · con documento' : ''}</div>
        ))}
      </div>
    </SurfaceCard>
  );
}

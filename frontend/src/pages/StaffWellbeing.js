import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { hrAPI, wellbeingAPI } from '../api';
import { LoadingState, MotionPage, PageHeader, SegmentedControl, SurfaceCard } from '../components/design';

const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};
const REDEMPTION = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
const CATEGORIES = { workplace_climate: 'Clima laboral', harassment: 'Acoso laboral', safety_risk: 'Riesgo o seguridad', misconduct: 'Conducta indebida', other: 'Otro' };
const RELATIONSHIPS = { spouse: 'Cónyuge o compañero(a)', child: 'Hijo(a)', parent: 'Padre o madre', other: 'Otro' };

// Bienestar del empleado: billetera de beneficios, referidos, linea etica (anonima) y beneficiarios para la caja de compensacion.
export default function StaffWellbeing() {
  const [tab, setTab] = useState('wallet');
  return (
    <MotionPage className="nexus-staff-page space-y-6">
      <PageHeader eyebrow="Mi trabajo" title="Bienestar" description="Tus beneficios, referidos, la línea ética y los datos de tus beneficiarios." />
      <SegmentedControl value={tab} onChange={setTab} options={[{ value: 'wallet', label: 'Beneficios' }, { value: 'referrals', label: 'Referidos' }, { value: 'ethics', label: 'Línea ética' }, { value: 'beneficiaries', label: 'Beneficiarios' }]} />
      {tab === 'wallet' && <Wallet />}
      {tab === 'referrals' && <Referrals />}
      {tab === 'ethics' && <Ethics />}
      {tab === 'beneficiaries' && <Beneficiaries />}
      <p className="text-xs text-[var(--app-text-secondary)]">Herramienta de gestión interna. No sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP.</p>
    </MotionPage>
  );
}

function useLoader(fn) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try {
      setData((await fn()).data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar la información'));
    }
  }, [fn]);
  useEffect(() => {
    load();
  }, [load]);
  return [data, load];
}

function Wallet() {
  const [data, load] = useLoader(wellbeingAPI.myWallet);
  const redeem = async (benefit) => {
    try {
      await wellbeingAPI.redeem(benefit.benefit_id);
      toast.success('Canje enviado: tu manager lo confirmará');
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible canjear'));
    }
  };
  if (!data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4" data-testid="wallet-balance"><h2 className="text-lg">Mis puntos</h2><p className="text-3xl font-semibold">{data.balance}</p></div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="benefit-catalog">
          <h2 className="text-lg">Catálogo de beneficios</h2>
          {data.catalog.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">Tu negocio aún no ha publicado beneficios.</p> : data.catalog.map((item) => (
            <div key={item.benefit_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="benefit-row">
              <div><strong>{item.name}</strong><div className="text-sm text-[var(--app-text-secondary)]">{item.description} · {item.points_cost} puntos</div></div>
              <button type="button" className="nexus-button nexus-button-primary" disabled={data.balance < item.points_cost} onClick={() => redeem(item)} data-testid="redeem-benefit">Canjear</button>
            </div>
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-1">
          <h2 className="text-lg">Mis canjes</h2>
          {data.redemptions.map((row) => <p key={row.redemption_id} className="text-sm">{row.benefit_name} · {row.points_cost} puntos · {REDEMPTION[row.status]}</p>)}
        </div>
      </SurfaceCard>
    </div>
  );
}

function Referrals() {
  const [data, load] = useLoader(wellbeingAPI.myReferrals);
  const [form, setForm] = useState({ vacancy_id: '', candidate_name: '', candidate_contact: '', note: '' });
  const [file, setFile] = useState(null);
  const submit = async () => {
    try {
      const documentId = file ? (await hrAPI.uploadDocument(file)).data.document_id : null;
      await wellbeingAPI.submitReferral({ ...form, note: form.note || null, document_id: documentId });
      toast.success('Referido enviado');
      setForm({ vacancy_id: form.vacancy_id, candidate_name: '', candidate_contact: '', note: '' });
      setFile(null);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible enviar el referido'));
    }
  };
  if (!data) return <LoadingState />;
  const reward = (vacancy) => (vacancy.reward_type === 'amount' ? `$ ${new Intl.NumberFormat('es-CO').format(vacancy.reward_value)}` : vacancy.reward_type === 'points' ? `${vacancy.reward_value} puntos` : vacancy.reward_text);
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3" data-testid="referral-form">
          <h2 className="text-lg">Recomienda a alguien</h2>
          {data.vacancies.length === 0 ? <p className="text-sm text-[var(--app-text-secondary)]">No hay vacantes abiertas por ahora.</p> : (
            <>
              <label className="text-sm block">Vacante
                <select className="nexus-field" value={form.vacancy_id} onChange={(e) => setForm({ ...form, vacancy_id: e.target.value })} data-testid="referral-vacancy">
                  <option value="">Selecciona</option>
                  {data.vacancies.map((v) => <option key={v.vacancy_id} value={v.vacancy_id}>{`${v.title} — recompensa: ${reward(v)}`}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">Nombre de tu conocido<input className="nexus-field" value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} data-testid="referral-name" /></label>
                <label className="text-sm">Teléfono o correo<input className="nexus-field" value={form.candidate_contact} onChange={(e) => setForm({ ...form, candidate_contact: e.target.value })} data-testid="referral-contact" /></label>
              </div>
              <label className="text-sm block">Hoja de vida (opcional)<input className="nexus-field" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
              <button type="button" className="nexus-button nexus-button-primary" disabled={!form.vacancy_id || form.candidate_name.trim().length < 2 || form.candidate_contact.trim().length < 4} onClick={submit} data-testid="referral-submit">Enviar referido</button>
            </>
          )}
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="my-referrals">
          <h2 className="text-lg">Mis referidos</h2>
          {data.items.map((row) => (
            <div key={row.referral_id} className="p-3 rounded-xl border border-[var(--app-border)]" data-testid="referral-row">
              <strong>{row.candidate_name}</strong> — {row.vacancy_title}
              <div className="text-sm text-[var(--app-text-secondary)]">{row.stage_label}{row.reward_detail ? ` · Recompensa: ${row.reward_detail}` : ''}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

function Ethics() {
  const [form, setForm] = useState({ category: 'workplace_climate', message: '', anonymous: true });
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState(null);
  const submit = async () => {
    try {
      setSent((await wellbeingAPI.submitReport(form)).data);
      setForm({ ...form, message: '' });
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible enviar el reporte'));
    }
  };
  const check = async () => {
    try {
      setStatus((await wellbeingAPI.reportStatus(code.trim())).data);
    } catch (error) {
      toast.error(messageOf(error, 'No encontramos ese código'));
    }
  };
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Línea ética y quejas</h2>
          <p className="text-sm text-[var(--app-text-secondary)]">Cuéntanos situaciones de clima laboral, riesgo o acoso (Ley 1010 de 2006). Con el anonimato activo no guardamos quién eres: solo recibirás un código para ver la respuesta. El mensaje se guarda cifrado.</p>
          <label className="text-sm block">Tema
            <select className="nexus-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm block">Mensaje<textarea className="nexus-field" rows={4} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="ethics-message" /></label>
          <label className="text-sm flex gap-2"><input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} data-testid="ethics-anonymous" /> Enviar de forma anónima</label>
          <button type="button" className="nexus-button nexus-button-primary" disabled={form.message.trim().length < 10} onClick={submit} data-testid="ethics-submit">Enviar</button>
          {sent && <p role="status" className="p-3 rounded-xl border border-[var(--app-border)] text-sm" data-testid="ethics-code">Código de seguimiento: <strong>{sent.tracking_code}</strong>. {sent.note}</p>}
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Consultar una respuesta</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">Código<input className="nexus-field" value={code} onChange={(e) => setCode(e.target.value)} data-testid="ethics-lookup-code" /></label>
            <button type="button" className="nexus-button" disabled={!code.trim()} onClick={check} data-testid="ethics-lookup">Consultar</button>
          </div>
          {status && (
            <div className="text-sm space-y-1" data-testid="ethics-status">
              <p>{status.category_label} · <strong>{status.status_label}</strong></p>
              {status.replies.map((reply) => <p key={reply.at}>Respuesta: {reply.message}</p>)}
            </div>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

function Beneficiaries() {
  const [data, load] = useLoader(wellbeingAPI.myBeneficiaries);
  const [form, setForm] = useState({ full_name: '', relationship: 'child', document_type: 'RC', document_number: '', birth_date: '' });
  const [file, setFile] = useState(null);
  const add = async () => {
    try {
      const documentId = file ? (await hrAPI.uploadDocument(file)).data.document_id : null;
      await wellbeingAPI.addBeneficiary({ ...form, birth_date: form.birth_date || null, document_id: documentId });
      toast.success('Beneficiario agregado');
      setForm({ ...form, full_name: '', document_number: '', birth_date: '' });
      setFile(null);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible agregar al beneficiario'));
    }
  };
  const remove = async (id) => {
    try {
      await wellbeingAPI.removeBeneficiary(id);
      await load();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible eliminar'));
    }
  };
  if (!data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-3" data-testid="beneficiary-form">
          <h2 className="text-lg">Agregar beneficiario</h2>
          <p className="text-sm text-[var(--app-text-secondary)]">Cónyuge, hijos o padres que cubre tu caja de compensación. Solo tú y tu manager ven estos datos.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">Nombre completo<input className="nexus-field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="beneficiary-name" /></label>
            <label className="text-sm">Parentesco
              <select className="nexus-field" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                {Object.entries(RELATIONSHIPS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">Tipo de documento
              <select className="nexus-field" value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
                {['CC', 'TI', 'RC', 'CE', 'PA', 'OTRO'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-sm">Número<input className="nexus-field" value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} data-testid="beneficiary-number" /></label>
            <label className="text-sm">Fecha de nacimiento<input className="nexus-field" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
            <label className="text-sm">Documento (foto o PDF)<input className="nexus-field" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>
          <button type="button" className="nexus-button nexus-button-primary" disabled={form.full_name.trim().length < 2 || form.document_number.trim().length < 3} onClick={add} data-testid="beneficiary-add">Agregar</button>
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="p-4 space-y-2" data-testid="my-beneficiaries">
          <h2 className="text-lg">Mis beneficiarios</h2>
          {data.items.map((row) => (
            <div key={row.beneficiary_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="beneficiary-row">
              <span><strong>{row.full_name}</strong> · {row.relationship_label} · {row.document_type} {row.document_number}</span>
              <button type="button" className="nexus-link-action" onClick={() => remove(row.beneficiary_id)}>Quitar</button>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

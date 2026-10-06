import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryAPI, teamAPI } from '../api';
import { EmptyState, SurfaceCard } from './design';

const fmt = (value) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value || 0));
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};

const STATUS = {
  pending: { label: 'Sin contar', tone: 'text-[var(--app-text-secondary)]' },
  mismatch: { label: 'Conteos distintos', tone: 'text-amber-400' },
  variance: { label: 'Diferencia por definir', tone: 'text-amber-400' },
  ok: { label: 'Coincide', tone: 'text-emerald-400' },
  resolved: { label: 'Diferencia definida', tone: 'text-sky-400' },
  dismissed: { label: 'Descartada', tone: 'text-[var(--app-text-secondary)]' },
};
const COUNT_STATUS = { counting: 'En conteo', closed: 'Cerrado', cancelled: 'Cancelado' };
const FIELD_LABELS = { quantity: 'cantidad', state: 'estado', code: 'código', price: 'precio de etiqueta' };
const CONDITION_LABELS = { good: 'Bueno', damaged: 'Dañado', expired: 'Vencido', other: 'Otro' };
const placeOf = (row) => [row.warehouse, row.location, row.pallet].filter(Boolean).join(' · ') || 'Sin ubicación';

// Conteo fisico con equipo: el manager crea la sesion, habilita personas por un tiempo, compara lo que cuenta cada una,
// pide reconteos, define perdidas/excedentes y cierra para actualizar el stock.
export default function InventoryCountsTab({ organizationId }) {
  const [counts, setCounts] = useState([]);
  const [mine, setMine] = useState([]);
  const [members, setMembers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [review, setReview] = useState([]);
  const [form, setForm] = useState({ name: '', scopeType: 'all', scopeValue: '', blind: true });
  const [assign, setAssign] = useState({ user_id: '', hours: 24 });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const activeId = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const [list, own, team] = await Promise.all([
        inventoryAPI.listCounts({ organization_id: organizationId }),
        inventoryAPI.myCounts(),
        teamAPI.getMembers(organizationId).catch(() => ({ data: [] })),
      ]);
      setCounts(list.data.items || []);
      setMine(own.data.items || []);
      const rows = Array.isArray(team.data) ? team.data : team.data?.members || [];
      setMembers(rows.filter((m) => ['manager', 'admin', 'staff'].includes(m.role) && m.user_id));
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar los conteos'));
    }
  }, [organizationId]);

  const open = useCallback(
    async (countId) => {
      activeId.current = countId;
      try {
        const [head, rev] = await Promise.all([
          inventoryAPI.getCount(countId, { organization_id: organizationId }),
          inventoryAPI.reviewCount(countId, { organization_id: organizationId }),
        ]);
        setDetail(head.data);
        setReview([...(rev.data.items || [])].sort((a, b) => `${a.sku}${placeOf(a)}`.localeCompare(`${b.sku}${placeOf(b)}`)));
      } catch (error) {
        toast.error(messageOf(error, 'No fue posible abrir el conteo'));
      }
    },
    [organizationId],
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      await loadList();
      if (activeId.current) await open(activeId.current);
    } catch (error) {
      const data = error?.response?.data?.detail;
      toast.error(data?.code === 'COUNT_NOT_READY' ? 'Aún hay artículos con conteos distintos, diferencias sin definir o sin contar.' : messageOf(error, 'No fue posible completar la acción'));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const scope = { type: form.scopeType };
      if (['warehouse', 'location', 'pallet'].includes(form.scopeType)) scope[form.scopeType] = form.scopeValue;
      const { data } = await inventoryAPI.createCount({ organization_id: organizationId, name: form.name, scope, blind_count: form.blind });
      setForm({ name: '', scopeType: 'all', scopeValue: '', blind: true });
      await open(data.count_id);
    }, 'Conteo creado');

  const editable = detail?.status === 'counting';
  const needsValue = ['warehouse', 'location', 'pallet'].includes(form.scopeType);
  const attention = review.filter((row) => ['mismatch', 'variance'].includes(row.status));

  return (
    <div className="space-y-6">
      {mine.length > 0 && (
        <SurfaceCard>
          <div className="p-4 space-y-2" data-testid="my-counts">
            <h2 className="text-lg">Conteos que te asignaron</h2>
            {mine.map((c) => (
              <Link key={c.count_id} to={`/inventory/count/${c.count_id}`} className="block nexus-button">
                {c.count_number} · {c.name} — vence {new Date(c.expires_at).toLocaleString('es-CO')}
              </Link>
            ))}
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard>
        <div className="p-4 space-y-4">
          <h2 className="text-lg">Nuevo conteo físico</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm md:col-span-2">Nombre
              <input className="nexus-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Conteo de cierre de mes" data-testid="count-name" />
            </label>
            <label className="text-sm">Qué se cuenta
              <select className="nexus-field" value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value, scopeValue: '' })} data-testid="count-scope">
                <option value="all">Todo el inventario</option>
                <option value="warehouse">Una bodega</option>
                <option value="location">Una ubicación / sección</option>
                <option value="pallet">Un palet</option>
              </select>
            </label>
            {needsValue && (
              <label className="text-sm">Nombre exacto
                <input className="nexus-field" value={form.scopeValue} onChange={(e) => setForm({ ...form, scopeValue: e.target.value })} />
              </label>
            )}
          </div>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={form.blind} onChange={(e) => setForm({ ...form, blind: e.target.checked })} />
            Conteo ciego (quien cuenta no ve la cantidad del sistema)
          </label>
          <button type="button" className="nexus-button nexus-button-primary" disabled={busy || form.name.trim().length < 2 || (needsValue && !form.scopeValue.trim())} onClick={create} data-testid="create-count">
            Crear conteo
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-3">
          <h2 className="text-lg">Conteos</h2>
          {counts.length === 0 ? (
            <EmptyState title="Aún no hay conteos" description="Crea uno para empezar a contar con tu equipo." />
          ) : (
            counts.map((c) => (
              <button key={c.count_id} type="button" className="nexus-button w-full text-left" onClick={() => open(c.count_id)} data-testid="count-row">
                {c.count_number} · {c.name} — {COUNT_STATUS[c.status] || c.status}
              </button>
            ))
          )}
        </div>
      </SurfaceCard>

      {detail && (
        <SurfaceCard>
          <div className="p-4 space-y-5" data-testid="count-detail">
            <h2 className="text-lg">{detail.count_number} · {detail.name} <span className="text-sm text-[var(--app-text-secondary)]">({COUNT_STATUS[detail.status] || detail.status})</span></h2>
            <p className="text-sm" data-testid="count-progress">
              {detail.target_total} puntos de conteo · sin contar {detail.progress.pending} · conteos distintos {detail.progress.mismatch} · por definir {detail.progress.variance} · coinciden {detail.progress.ok + detail.progress.resolved + detail.progress.dismissed}
            </p>

            {editable && (
              <div className="space-y-3">
                <h3 className="font-medium">Habilitar a una persona (acceso temporal)</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <label className="text-sm md:col-span-2">Persona
                    <select className="nexus-field" value={assign.user_id} onChange={(e) => setAssign({ ...assign, user_id: e.target.value })} data-testid="assign-user">
                      <option value="">Selecciona</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email} ({m.role})</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Horas de acceso
                    <input className="nexus-field" type="number" min="1" max="336" value={assign.hours} onChange={(e) => setAssign({ ...assign, hours: Number(e.target.value) || 1 })} />
                  </label>
                  <button type="button" className="nexus-button" disabled={busy || !assign.user_id} data-testid="assign-btn"
                    onClick={() => run(() => inventoryAPI.assignCount(detail.count_id, { organization_id: organizationId, user_id: assign.user_id, hours: assign.hours }), 'Acceso habilitado')}>
                    Habilitar
                  </button>
                </div>
              </div>
            )}
            {detail.assignments.length > 0 && (
              <ul className="text-sm space-y-1" data-testid="assignments">
                {detail.assignments.map((a) => (
                  <li key={a.assignment_id} className="flex flex-wrap gap-2 items-center">
                    <span>{a.user_name || a.user_id}</span>
                    <span className="text-[var(--app-text-secondary)]">
                      {a.revoked ? 'acceso retirado' : `hasta ${new Date(a.expires_at).toLocaleString('es-CO')}`}{a.submitted_at ? ' · envió su conteo' : ''}
                    </span>
                    {editable && !a.revoked && (
                      <button type="button" className="nexus-link-action" onClick={() => run(() => inventoryAPI.revokeCountAccess(detail.count_id, a.assignment_id, { organization_id: organizationId }), 'Acceso retirado')}>Retirar</button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {attention.length > 0 && (
              <p role="alert" className="text-amber-400 text-sm" data-testid="attention">{attention.length} artículo(s) requieren tu decisión.</p>
            )}
            {editable && (
              <label className="text-sm block">Comentario para la decisión (opcional)
                <input className="nexus-field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej: frasco roto, confirmado en bodega" />
              </label>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="review-table">
                <thead>
                  <tr className="text-left text-[var(--app-text-secondary)]">
                    <th className="p-2">Artículo</th><th className="p-2">Lugar</th><th className="p-2 text-right">Sistema</th>
                    <th className="p-2 text-right">Contado</th><th className="p-2">Estado</th><th className="p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {review.map((row) => {
                    const info = STATUS[row.status] || STATUS.pending;
                    return (
                      <tr key={row.target_id} className="border-t border-[var(--app-border)] align-top" data-testid="review-row">
                        <td className="p-2">{row.sku ? `${row.sku} · ` : ''}{row.name}{row.round > 1 ? ` (ronda ${row.round})` : ''}</td>
                        <td className="p-2">{placeOf(row)}</td>
                        <td className="p-2 text-right">{fmt(row.system_quantity)}</td>
                        <td className="p-2 text-right">{row.counted ? fmt(row.counted.total) : '—'}{row.difference ? ` (${row.difference > 0 ? '+' : ''}${fmt(row.difference)})` : ''}</td>
                        <td className={`p-2 ${info.tone}`}>
                          {info.label}{row.resolution ? ` · ${row.resolution === 'loss' ? 'pérdida' : row.resolution === 'surplus' ? 'excedente' : 'descartada'}` : ''}
                          {row.discrepancies.length > 0 && <div className="text-xs">Difieren en: {[...new Set(row.discrepancies.map((d) => FIELD_LABELS[d.field] || d.field))].join(', ')}</div>}
                          {row.counters.map((c) => (
                            <div key={c.user_id} className="text-xs text-[var(--app-text-secondary)]">
                              {c.name || c.user_id}: {c.entries.map((e) => `${fmt(e.quantity)} ${CONDITION_LABELS[e.condition]}`).join(', ')}
                            </div>
                          ))}
                        </td>
                        <td className="p-2 space-x-2 whitespace-nowrap">
                          {editable && row.counters.length > 0 && (
                            <button type="button" className="nexus-link-action" data-testid="recount-btn" onClick={() => run(() => inventoryAPI.requestRecount(detail.count_id, row.target_id, { organization_id: organizationId, note: comment || null }), 'Reconteo solicitado')}>Pedir reconteo</button>
                          )}
                          {editable && ['variance', 'resolved', 'dismissed'].includes(row.status) && (
                            <>
                              {row.difference < 0 && <button type="button" className="nexus-link-action" data-testid="loss-btn" onClick={() => run(() => inventoryAPI.resolveCountTarget(detail.count_id, row.target_id, { organization_id: organizationId, resolution: 'loss', comment }), 'Pérdida registrada')}>Es pérdida</button>}
                              {row.difference > 0 && <button type="button" className="nexus-link-action" data-testid="surplus-btn" onClick={() => run(() => inventoryAPI.resolveCountTarget(detail.count_id, row.target_id, { organization_id: organizationId, resolution: 'surplus', comment }), 'Excedente registrado')}>Es excedente</button>}
                              <button type="button" className="nexus-link-action" onClick={() => run(() => inventoryAPI.resolveCountTarget(detail.count_id, row.target_id, { organization_id: organizationId, resolution: 'dismiss', comment }), 'Diferencia descartada')}>Descartar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editable && (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="nexus-button nexus-button-primary" disabled={busy} data-testid="close-count"
                  onClick={() => run(() => inventoryAPI.closeCount(detail.count_id, { organization_id: organizationId }), 'Conteo cerrado: inventario actualizado')}>
                  Aceptar y actualizar inventario
                </button>
                <button type="button" className="nexus-button" disabled={busy} onClick={() => run(() => inventoryAPI.cancelCount(detail.count_id, { organization_id: organizationId }), 'Conteo cancelado')}>
                  Cancelar conteo
                </button>
              </div>
            )}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}

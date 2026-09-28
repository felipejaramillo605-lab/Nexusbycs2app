import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ownerAPI, ownerCapabilityAPI } from '../api';
import { ActionButton, confirmAction, EmptyState, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;
const eventLabels = { bootstrap_granted: 'Otorgado (arranque de plataforma)', granted: 'Otorgado', revoked: 'Revocado' };

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 18): administers who holds the
// manage_portal_template_entitlements capability -- the one gap the plan
// PR 17 investigation confirmed under "capabilities in the UI": the backend
// (platform_capabilities.py) already has fully audited grant/revoke
// endpoints with test coverage, but zero frontend callers existed before
// this page. Activating/deactivating an ORGANIZATION's Premium access
// (spending the capability) already has its own UI -- OwnerPremiumPlanPanel,
// inside OwnerSubscriptions -- and needed no change; this page is strictly
// about who is allowed to do that.
export default function OwnerCapabilityGrants() {
  const [grants, setGrants] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [revokeReasonByUser, setRevokeReasonByUser] = useState({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grantsRes, usersRes] = await Promise.all([
        ownerCapabilityAPI.listGrants(),
        ownerAPI.getUsers(),
      ]);
      setGrants(grantsRes.data.active_grants || []);
      setAuditEvents(grantsRes.data.audit_events || []);
      setUsers(usersRes.data || []);
    } catch (e) {
      toast.error(detail(e, 'No fue posible cargar los administradores de entitlements'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.user_id, u])), [users]);
  const grantedIds = useMemo(() => new Set(grants.map((g) => g.user_id)), [grants]);
  // NEXUS_8A3A_CAPABILITY_AUTHORITY_V1: mirrors _is_eligible_platform_owner
  // (platform_capabilities.py) exactly -- an ineligible target is rejected
  // server-side with a 409 anyway, but filtering here means the dropdown
  // only ever offers someone the grant can actually succeed for.
  const eligibleUsers = useMemo(() => users.filter((u) =>
    u.role === 'owner' && u.access_status === 'approved' && u.active !== false && !u.deleted_at && !grantedIds.has(u.user_id),
  ), [users, grantedIds]);

  const grant = async (e) => {
    e.preventDefault();
    if (!selectedUserId || !reason.trim()) return;
    setBusy('grant');
    try {
      await ownerCapabilityAPI.grant({ user_id: selectedUserId, reason: reason.trim() });
      toast.success('Permiso otorgado');
      setSelectedUserId('');
      setReason('');
      await load();
    } catch (e) {
      toast.error(detail(e, 'No fue posible otorgar el permiso'));
    } finally {
      setBusy('');
    }
  };

  const revoke = async (grantRow) => {
    const target = usersById[grantRow.user_id];
    const name = target?.name || target?.email || grantRow.user_id;
    const revokeReason = (revokeReasonByUser[grantRow.user_id] || '').trim();
    if (grants.length <= 1) {
      toast.error('No puedes revocar el último administrador de entitlements: debe quedar al menos uno.');
      return;
    }
    if (!revokeReason) return;
    if (!await confirmAction(`¿Revocar el permiso de administrar entitlements a ${name}?`, { title: 'Revocar permiso', confirmLabel: 'Revocar', tone: 'danger' })) return;
    setBusy(`revoke:${grantRow.user_id}`);
    try {
      await ownerCapabilityAPI.revoke(grantRow.user_id, { reason: revokeReason });
      toast.success('Permiso revocado');
      setRevokeReasonByUser({ ...revokeReasonByUser, [grantRow.user_id]: '' });
      await load();
    } catch (e) {
      toast.error(detail(e, 'No fue posible revocar el permiso'));
    } finally {
      setBusy('');
    }
  };

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader
        eyebrow="IT y auditoría"
        title="Administradores de entitlements"
        description="Controla quiénes pueden activar o desactivar el paquete Premium de una organización."
        actions={<ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Actualizar</ActionButton>}
      />
      <SurfaceCard>
        <h2>Otorgar permiso</h2>
        <form className="nexus-guided-form" onSubmit={grant}>
          <label>
            <span>Owner</span>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} required>
              <option value="">Selecciona un owner aprobado</option>
              {eligibleUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name || u.email || u.user_id}</option>)}
            </select>
          </label>
          <label className="nexus-field-wide">
            <span>Motivo</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
          </label>
          <ActionButton type="submit" icon={UserPlus} disabled={!selectedUserId || !reason.trim() || busy === 'grant'}>Otorgar permiso</ActionButton>
        </form>
        {!eligibleUsers.length && !loading && <p>No hay más owners aprobados disponibles para otorgar este permiso.</p>}
      </SurfaceCard>
      <SurfaceCard>
        <h2>Con permiso activo</h2>
        {loading ? <p role="status">Cargando…</p> : !grants.length ? (
          <EmptyState icon={ShieldCheck} title="Sin administradores" description="Ningún owner tiene este permiso activo." />
        ) : (
          <ul className="nexus-audit-list">
            {grants.map((g) => {
              const target = usersById[g.user_id];
              return (
                <li key={g.user_id}>
                  <strong>{target?.name || target?.email || g.user_id}</strong>
                  <span>Desde {String(g.granted_at || '').slice(0, 10)} · {g.reason}</span>
                  {grants.length > 1 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        className="nexus-field"
                        placeholder="Motivo de la revocación"
                        value={revokeReasonByUser[g.user_id] || ''}
                        onChange={(e) => setRevokeReasonByUser({ ...revokeReasonByUser, [g.user_id]: e.target.value })}
                      />
                      <ActionButton
                        variant="destructive"
                        disabled={busy === `revoke:${g.user_id}` || !(revokeReasonByUser[g.user_id] || '').trim()}
                        onClick={() => revoke(g)}
                      >
                        Revocar
                      </ActionButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SurfaceCard>
      <SurfaceCard>
        <h2>Historial de auditoría</h2>
        {!auditEvents.length ? (
          <EmptyState icon={ShieldCheck} title="Sin eventos" description="Los otorgamientos y revocaciones aparecerán aquí." />
        ) : (
          <ul className="nexus-audit-list">
            {[...auditEvents].reverse().map((event) => {
              const target = usersById[event.target_user_id];
              return (
                <li key={event.event_id}>
                  <strong>{eventLabels[event.type] || event.type}</strong>
                  <span>{target?.name || target?.email || event.target_user_id} · {String(event.created_at || '').slice(0, 10)}</span>
                  <p>{event.reason}</p>
                </li>
              );
            })}
          </ul>
        )}
      </SurfaceCard>
    </MotionPage>
  );
}

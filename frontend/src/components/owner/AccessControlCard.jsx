import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { subscriptionAPI } from '../../api';
import { AccessibleModal, ActionButton, SurfaceCard } from '../design';
import { formatCOPMinor as money } from '../../lib/currency';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6, fourth increment -- the first of the money-critical pieces, done
// carefully and alone rather than bundled with the invoices table). `subscription`
// and `pending` stay owned by the parent's org-scoped load() (they're also read
// by the metrics grid and the invoices table); this card only reads them, it
// never writes them directly -- every mutation goes through `onReload`.
//
// The idempotency-key ref is local to this card now instead of sharing the
// parent's single `requestIds` ref keyed by "block-{orgId}"/"reactivate-{orgId}"
// -- those keys never collided with anything else in the parent ref either, so
// this is a pure relocation, not a behavior change.
export default function AccessControlCard({ subscription, pending, organizationId, organizationName, onReload }) {
  const [action, setAction] = useState(null); // 'block' | 'reactivate' | null
  const [reason, setReason] = useState('');
  const [overrideDebt, setOverrideDebt] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestIds = useRef({});

  const stableRequestId = (key) => {
    if (!requestIds.current[key]) {
      requestIds.current[key] = `owner-${key}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    }
    return requestIds.current[key];
  };

  const openBlock = () => {
    setReason('');
    setAction('block');
  };

  const openReactivate = () => {
    setReason('');
    setOverrideDebt(false);
    setAction('reactivate');
  };

  const run = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      toast.error('El motivo debe tener entre 3 y 500 caracteres');
      return;
    }
    setBusy(true);
    try {
      if (action === 'block') {
        await subscriptionAPI.blockOrganization(organizationId, {
          reason: trimmed,
          idempotency_key: stableRequestId(`block-${organizationId}`),
        });
      } else {
        await subscriptionAPI.reactivateOrganization(organizationId, {
          reason: trimmed,
          idempotency_key: stableRequestId(`reactivate-${organizationId}`),
          override_open_debt: overrideDebt,
        });
      }
      delete requestIds.current[`${action}-${organizationId}`];
      toast.success(action === 'block' ? 'Organización bloqueada temporalmente' : 'Acceso reactivado');
      setAction(null);
      setReason('');
      setOverrideDebt(false);
      await onReload();
    } catch (err) {
      toast.error(detail(err, action === 'block' ? 'No fue posible bloquear la organización' : 'No fue posible reactivar la organización'));
    } finally {
      setBusy(false);
    }
  };

  const blocked = subscription?.manual_access_blocked;
  const balance = money(pending.reduce((sum, x) => sum + Number(x.balance_minor ?? x.amount_minor ?? 0), 0), 'COP');

  return (
    <SurfaceCard>
      <h2>Control de acceso de la organización</h2>
      <p><strong>Estado:</strong> {blocked ? 'Bloqueo manual activo' : subscription?.subscription_access_state === 'suspended' ? 'Suspendida' : 'Acceso activo'}</p>
      <p><strong>Saldo abierto:</strong> {balance} en {pending.length} factura(s).</p>
      <p>
        {blocked
          ? 'Managers, staff y administradores de esta organización no pueden usar las áreas autenticadas de Nexus.'
          : pending.length
            ? 'Existe saldo pendiente. El Owner puede suspender temporalmente toda la organización.'
            : 'No hay deuda abierta para justificar un bloqueo.'}
      </p>
      {blocked ? (
        <ActionButton onClick={openReactivate}>Reactivar organización</ActionButton>
      ) : (
        <ActionButton disabled={!pending.length} onClick={openBlock}>Bloquear organización</ActionButton>
      )}

      {action && (
        <AccessibleModal
          open={!!action}
          onClose={() => !busy && setAction(null)}
          role="alertdialog"
          labelledBy="owner-organization-action-title"
          describedBy="owner-organization-action-description"
          panelClassName="nexus-accessible-modal-panel"
        >
          <h2 id="owner-organization-action-title">{action === 'block' ? 'Bloquear organización' : 'Reactivar organización'}</h2>
          <p id="owner-organization-action-description">
            {action === 'block'
              ? `Se bloqueará temporalmente el acceso de managers y profesionales de ${organizationName || 'esta organización'}.`
              : `Se reactivará el acceso de ${organizationName || 'esta organización'}.`}
          </p>
          {action === 'reactivate' && pending.length > 0 && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={overrideDebt} onChange={(e) => setOverrideDebt(e.target.checked)} />
              <span>Todavía hay saldo pendiente. Reactivar por excepción.</span>
            </label>
          )}
          <label>
            Motivo (3 a 500 caracteres)
            <textarea className="nexus-field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} required />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <ActionButton variant="secondary" disabled={busy} onClick={() => setAction(null)}>Cancelar</ActionButton>
            <ActionButton
              variant={action === 'block' ? 'destructive' : 'primary'}
              loading={busy}
              disabled={reason.trim().length < 3 || reason.trim().length > 500 || (action === 'reactivate' && pending.length > 0 && !overrideDebt)}
              onClick={run}
            >
              {action === 'block' ? 'Bloquear organización' : 'Reactivar organización'}
            </ActionButton>
          </div>
        </AccessibleModal>
      )}
    </SurfaceCard>
  );
}

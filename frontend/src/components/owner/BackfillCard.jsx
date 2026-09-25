import React, { useState } from 'react';
import { toast } from 'sonner';
import { deliveryOperationsAPI } from '../../api';
import { AccessibleModal, ActionButton, SurfaceCard } from '../design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6, second increment), confirm modal included. `backfill`/`backfillConfirm`
// were only read by this one card in the parent, so both move in along with the
// modal. The parent's `actionReason` field was shared across three unrelated
// modals (invoice action, organization action, this one) -- giving this one its
// own local `reason` state removes that cross-talk risk entirely rather than
// just relocating it.
export default function BackfillCard({ organizationId, onReload }) {
  const [items, setItems] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const runDiagnostic = async () => {
    try {
      const r = await deliveryOperationsAPI.backfill({ organization_id: organizationId, apply: false });
      setItems(r.data.items || []);
    } catch (err) {
      toast.error(detail(err, 'No fue posible ejecutar el diagnóstico'));
    }
  };

  const apply = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      toast.error('El motivo debe tener entre 3 y 500 caracteres');
      return;
    }
    setBusy(true);
    try {
      await deliveryOperationsAPI.backfill({ organization_id: organizationId, apply: true, reason: trimmed });
      toast.success('Backfill aplicado');
      setItems([]);
      setConfirmOpen(false);
      setReason('');
      await onReload();
    } catch (err) {
      toast.error(detail(err, 'No fue posible aplicar el backfill'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard>
      <h2>Backfill histórico</h2>
      <p>Primero ejecuta el diagnóstico. La aplicación no envía correos.</p>
      <ActionButton onClick={runDiagnostic}>Diagnóstico dry-run</ActionButton>
      {items.length > 0 && (
        <>
          <p>{items.length} documento(s) requieren revisión.</p>
          <ActionButton onClick={() => { setReason(''); setConfirmOpen(true); }}>Aplicar backfill</ActionButton>
        </>
      )}
      {confirmOpen && (
        <AccessibleModal
          open={confirmOpen}
          onClose={() => !busy && setConfirmOpen(false)}
          role="alertdialog"
          labelledBy="owner-backfill-title"
          describedBy="owner-backfill-description"
          panelClassName="nexus-accessible-modal-panel"
        >
          <h2 id="owner-backfill-title">Confirmar aplicación del backfill</h2>
          <p id="owner-backfill-description">Se aplicará el backfill a {items.length} documento(s). Esta acción quedará registrada.</p>
          <label>
            Motivo (3 a 500 caracteres)
            <textarea className="nexus-field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} required />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <ActionButton variant="secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancelar</ActionButton>
            <ActionButton variant="destructive" loading={busy} disabled={reason.trim().length < 3 || reason.trim().length > 500} onClick={apply}>Confirmar backfill</ActionButton>
          </div>
        </AccessibleModal>
      )}
    </SurfaceCard>
  );
}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ownerAPI } from '../../api';
import { AccessibleModal, ActionButton } from '../design';

const sameName = (a, b) => a.trim().replace(/\s+/g, ' ').toLowerCase() === (b || '').trim().replace(/\s+/g, ' ').toLowerCase();

const detailOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || fallback;
};

export function DeleteOrganizationDialog({ organization, onClose, onDeleted }) {
  const [impact, setImpact] = useState(null);
  const [impactError, setImpactError] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const id = organization?.organization_id;

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    setImpact(null);
    setImpactError(false);
    setConfirmName('');
    setReason('');
    ownerAPI.getDeletionImpact(id).then(
      (response) => { if (active) setImpact(response.data); },
      () => { if (active) setImpactError(true); },
    );
    return () => { active = false; };
  }, [id]);

  if (!organization) return null;

  const blocked = impact?.enabled_owners > 0;
  const ready = !!impact && !blocked && sameName(confirmName, organization.name) && reason.trim().length >= 10;

  const close = () => { if (!busy) onClose(); };

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { data } = await ownerAPI.deleteOrganization(id, { confirm_name: confirmName.trim(), reason: reason.trim() });
      toast.success(`Organización eliminada. ${data.users_removed} cuenta(s) sin acceso; los registros se conservan.`);
      onDeleted?.(data);
    } catch (error) {
      toast.error(detailOf(error, 'No fue posible eliminar la organización'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open onClose={close} role="alertdialog" labelledBy="delete-org-title" describedBy="delete-org-description">
      <form onSubmit={submit} className="space-y-4">
        <h2 id="delete-org-title">Eliminar organización</h2>
        <p id="delete-org-description">
          Vas a eliminar <strong>{organization.name}</strong>. Desaparece del directorio y de su página pública, y todas sus cuentas pierden el acceso. Los registros (clientes, citas, cobros) se conservan por obligación legal.
        </p>
        {impactError && <p role="alert">No se pudo calcular el impacto. Cierra y vuelve a intentarlo.</p>}
        {!impact && !impactError && <p>Calculando impacto...</p>}
        {impact && (
          <ul data-testid="delete-org-impact">
            <li>{impact.users} cuenta(s) perderán el acceso y se anonimizarán.</li>
            <li>{impact.upcoming_appointments} cita(s) futura(s) confirmada(s) <strong>no se cancelan ni se avisa a los clientes</strong>.</li>
            <li>{impact.clients} cliente(s) conservados.</li>
          </ul>
        )}
        {blocked && (
          <p role="alert">Esta organización tiene una cuenta Owner vinculada. Desvincúlala antes de eliminar la organización.</p>
        )}
        <label className="block text-sm" htmlFor="delete-org-name">Para confirmar, escribe el nombre exacto: <strong>{organization.name}</strong></label>
        <input id="delete-org-name" autoComplete="off" className="nexus-field w-full" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} disabled={!impact || blocked} />
        <label className="block text-sm" htmlFor="delete-org-reason">Motivo (mínimo 10 caracteres)</label>
        <textarea id="delete-org-reason" className="nexus-field w-full" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} disabled={!impact || blocked} />
        <div className="nexus-account-actions">
          <ActionButton type="button" variant="secondary" onClick={close}>Cancelar</ActionButton>
          <ActionButton type="submit" variant="destructive" disabled={!ready || busy}>{busy ? 'Eliminando...' : 'Eliminar definitivamente'}</ActionButton>
        </div>
      </form>
    </AccessibleModal>
  );
}

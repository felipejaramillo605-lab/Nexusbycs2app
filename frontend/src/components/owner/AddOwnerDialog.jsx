import React, { useState } from 'react';
import { toast } from 'sonner';
import { ownerAPI } from '../../api';
import { AccessibleModal, ActionButton } from '../design';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const detailOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || fallback;
};

export function AddOwnerDialog({ open, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = EMAIL.test(email.trim()) && reason.trim().length >= 10;

  const close = () => {
    if (busy) return;
    setEmail('');
    setReason('');
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { data } = await ownerAPI.addOwner(email.trim(), reason.trim());
      const messages = {
        promoted: `${data.email} ahora es Owner y ya tiene acceso.`,
        already_owner: `${data.email} ya es Owner.`,
        invited: `Invitación creada para ${data.email}. Debe iniciar sesión con Google usando ese correo antes de que expire.`,
        already_invited: `Ya existe una invitación pendiente para ${data.email}.`,
      };
      toast.success(messages[data.result] || 'Listo');
      setEmail('');
      setReason('');
      onDone?.(data);
      onClose();
    } catch (error) {
      toast.error(detailOf(error, 'No fue posible agregar al Owner'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open={open} onClose={close} labelledBy="add-owner-title" describedBy="add-owner-description">
      <form onSubmit={submit} className="space-y-4">
        <h2 id="add-owner-title">Agregar un Owner</h2>
        <p id="add-owner-description">
          Un Owner administra toda la plataforma. Si el correo ya tiene cuenta, pasa a ser Owner de inmediato. Si no la tiene, queda una invitación de 14 días que solo se acepta al iniciar sesión con Google con ese mismo correo. Queda registrado en la auditoría.
        </p>
        <label className="block text-sm" htmlFor="add-owner-email">Correo de la persona</label>
        <input id="add-owner-email" type="email" autoComplete="off" className="nexus-field w-full" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="block text-sm" htmlFor="add-owner-reason">Motivo (mínimo 10 caracteres)</label>
        <textarea id="add-owner-reason" className="nexus-field w-full" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} required />
        <div className="nexus-account-actions">
          <ActionButton type="button" variant="secondary" onClick={close}>Cancelar</ActionButton>
          <ActionButton type="submit" disabled={!valid || busy}>{busy ? 'Agregando...' : 'Agregar Owner'}</ActionButton>
        </div>
      </form>
    </AccessibleModal>
  );
}

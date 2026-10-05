import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { mediaRightsAPI } from '../api';
import { onMediaRightsRequest } from '../lib/mediaRights';
import { AccessibleModal } from './design/AccessibleModal';
import { ActionButton } from './design';

// Se muestra la primera vez que el usuario sube una imagen: declaracion de derechos de uso y de autorizacion de las
// personas que aparezcan (profesionales, clientes). Si acepta, la subida se reintenta sola.
export default function MediaRightsDialog() {
  const [request, setRequest] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onMediaRightsRequest((detail, resolve) => {
        setChecked(false);
        setRequest({ detail, resolve });
      }),
    [],
  );

  const finish = (result) => {
    request?.resolve(result);
    setRequest(null);
  };

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      await mediaRightsAPI.accept(request.detail?.version);
      finish(true);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No fue posible registrar la autorización');
      finish(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal
      open={!!request}
      onClose={() => !busy && finish(false)}
      labelledBy="media-rights-title"
      describedBy="media-rights-text"
    >
      <h2 id="media-rights-title">Antes de subir imágenes</h2>
      <p id="media-rights-text">
        Para proteger a tu negocio y a las personas que aparecen en las fotos, confirma lo siguiente. Solo te lo pediremos una vez.
      </p>
      <label className="nexus-account-check">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>{request?.detail?.message}</span>
      </label>
      <p className="text-xs">
        Más información en los <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline">Términos de servicio</a> y la{' '}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Política de privacidad</a>.
      </p>
      <div className="nexus-account-actions">
        <ActionButton variant="secondary" disabled={busy} onClick={() => finish(false)}>Cancelar</ActionButton>
        <ActionButton loading={busy} disabled={!checked} onClick={accept}>Aceptar y continuar</ActionButton>
      </div>
    </AccessibleModal>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { mediaRightsAPI } from '../api';
import { onMediaRightsRequest } from '../lib/mediaRights';
import { ActionButton } from './design';

// Se muestra la primera vez que el usuario sube una imagen: declaracion de derechos de uso y de autorizacion de las
// personas que aparezcan (profesionales, clientes). Si acepta, la subida se reintenta sola.
//
// Importante (movil): la subida suele hacerse dentro de otro cuadro modal (p. ej. el formulario de un profesional, un
// Dialog de Radix) que bloquea los toques y el scroll fuera de su contenido y se cierra con cualquier toque externo.
// Por eso este dialogo NO usa AccessibleModal: tiene su propia capa con pointer-events activos, por encima de todo, y
// detiene la propagacion de los eventos para que el cuadro de abajo no los reciba.
const stop = (event) => event.stopPropagation();

export default function MediaRightsDialog() {
  const [request, setRequest] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);

  useEffect(
    () =>
      onMediaRightsRequest((detail, resolve) => {
        setChecked(false);
        setRequest({ detail, resolve });
      }),
    [],
  );

  useEffect(() => {
    if (!request) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        request.resolve(false);
        setRequest(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector('input,button')?.focus?.({ preventScroll: true }));
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.cancelAnimationFrame(frame);
    };
  }, [request, busy]);

  if (!request) return null;

  const finish = (result) => {
    request.resolve(result);
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

  return createPortal(
    <div
      className="nexus-media-rights-layer"
      data-testid="media-rights-layer"
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={stop}
      onKeyDown={stop}
    >
      <div
        ref={panelRef}
        className="nexus-media-rights-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-rights-title"
        aria-describedby="media-rights-text"
      >
        <h2 id="media-rights-title">Antes de subir imágenes</h2>
        <p id="media-rights-text">
          Para proteger a tu negocio y a las personas que aparecen en las fotos, confirma lo siguiente. Solo te lo pediremos una vez.
        </p>
        <label className="nexus-media-rights-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>{request.detail?.message}</span>
        </label>
        <p className="text-xs">
          Más información en los <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline">Términos de servicio</a> y la{' '}
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Política de privacidad</a>.
        </p>
        <div className="nexus-media-rights-actions">
          <ActionButton variant="secondary" disabled={busy} onClick={() => finish(false)}>Cancelar</ActionButton>
          <ActionButton loading={busy} disabled={!checked} onClick={accept}>Aceptar y continuar</ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { organizationAPI } from '../api';
import { IMAGE_SPECS } from '../lib/portalLanding';

/** Medidas recomendadas de una imagen (portada, experiencia o logo). */
export function ImageSpecNote({ spec }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-secondary)]" data-testid="image-spec">
      <dt className="font-medium text-[var(--app-text-primary)]">Tamaño ideal</dt><dd>{spec.size} ({spec.ratio})</dd>
      <dt className="font-medium text-[var(--app-text-primary)]">Mínimo</dt><dd>{spec.minimum}</dd>
      <dt className="font-medium text-[var(--app-text-primary)]">Formato</dt><dd>{spec.weight}</dd>
      <dt className="font-medium text-[var(--app-text-primary)]">Consejo</dt><dd>{spec.tip}</dd>
    </dl>
  );
}

/**
 * Imagen de portada de las plantillas con pagina de inicio. Se sube aqui al elegir la plantilla;
 * si no se sube, la plantilla usa su portada predeterminada (sin foto).
 */
export default function PortalHeroImageField({ organizationId, organization, onChanged }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const hasImage = !!organization?.portal_background_url && ['image', 'video'].includes(organization?.portal_background_type);

  const upload = async (file) => {
    if (!file || !organizationId) return;
    setBusy(true);
    try {
      const response = await organizationAPI.uploadPortalBackground(organizationId, file);
      onChanged?.(response.data);
      toast.success('Imagen de portada actualizada');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No fue posible subir la imagen');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const useDefault = async () => {
    setBusy(true);
    try {
      const response = await organizationAPI.deletePortalBackground(organizationId);
      onChanged?.(response.data);
      toast.success('Se usará la portada predeterminada de la plantilla');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No fue posible quitar la imagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[var(--app-border)] p-4 space-y-3" data-testid="hero-image-field">
      <div>
        <h4 className="text-sm font-semibold text-[var(--app-text-primary)]">Imagen de portada</h4>
        <p className="text-xs text-[var(--app-text-secondary)]">
          Esta plantilla abre con una portada a pantalla completa. Sube tu imagen o deja la predeterminada de la plantilla (sin foto).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-20 w-36 overflow-hidden rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)] grid place-items-center text-[10px] text-[var(--app-text-muted)]">
          {hasImage && organization.portal_background_type === 'image'
            ? <img src={organization.portal_background_url} alt="Vista previa de la portada" className="h-full w-full object-cover" />
            : hasImage ? 'Video' : 'Predeterminada'}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="nexus-button nexus-button-primary inline-flex cursor-pointer items-center gap-2 text-sm">
            <ImagePlus size={15} /> {hasImage ? 'Cambiar imagen' : 'Subir imagen'}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              disabled={busy}
              data-testid="hero-image-input"
              onChange={(event) => upload(event.target.files?.[0])}
            />
          </label>
          {hasImage && (
            <button type="button" onClick={useDefault} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-text-primary)]">
              <Trash2 size={14} /> Usar la predeterminada
            </button>
          )}
        </div>
      </div>
      <ImageSpecNote spec={IMAGE_SPECS.hero} />
    </section>
  );
}

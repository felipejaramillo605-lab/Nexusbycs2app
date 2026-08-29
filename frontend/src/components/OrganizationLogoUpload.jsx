// NEXUS_ORGANIZATION_LOGO_UPLOAD_V1
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, UploadCloud, Info } from 'lucide-react';
import { toast } from 'sonner';
import { organizationAPI } from '../api';

// Kept in sync with organization_media.py's ALLOWED_FORMATS. SVG is
// deliberately excluded everywhere (frontend accept/validation AND
// backend) -- an uploaded SVG can embed <script>/event handlers and would
// be served back to every visitor of the client portal and admin nav bar,
// so it's a real stored-XSS vector rather than just an inconsistency.
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const LIMIT = 5 * 1024 * 1024;

export default function OrganizationLogoUpload({ organizationId, value, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const objectUrlRef = useRef('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const choose = async (file) => {
    setError('');
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setError('Selecciona una imagen JPG, PNG, WebP o HEIC. SVG no se admite por seguridad.');
      return;
    }
    if (file.size > LIMIT) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setPreview(objectUrlRef.current);
    setBusy(true);
    setProgress(0);
    try {
      const response = await organizationAPI.uploadLogo(organizationId, file, (event) => {
        setProgress(event.total ? Math.round((event.loaded * 100) / event.total) : 0);
      });
      const logoUrl = response?.data?.logo_url;
      if (!logoUrl) throw new Error('missing logo_url');
      onChange(logoUrl);
      toast.success('Logo actualizado correctamente');
      setPreview('');
    } catch (e) {
      setPreview('');
      const detail = e?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      setError(message || 'No fue posible cargar el logo.');
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!value || busy) return;
    if (!window.confirm('¿Eliminar el logo de la organización?')) return;
    setBusy(true);
    setError('');
    try {
      await organizationAPI.deleteLogo(organizationId);
      onChange('');
      toast.success('Logo eliminado');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      setError(message || 'No fue posible eliminar el logo.');
    } finally {
      setBusy(false);
    }
  };

  const drop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) choose(e.dataTransfer.files?.[0]);
  };

  const image = preview || value;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--app-text-primary)]">Logo de la organización</h3>
        <p className="text-sm text-[var(--app-text-secondary)] mt-1">
          Se muestra en el dashboard y en las páginas públicas de reserva/portal.
        </p>
      </div>

      {/* NEXUS_ORGANIZATION_LOGO_UPLOAD_V1: explicit, upfront format guidance
          so the requirements are clear BEFORE a user hits an error, not just
          in the error message after a failed attempt. */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--app-primary-soft)] border border-[var(--app-border)]">
        <Info size={16} className="text-[var(--app-primary)] mt-0.5 shrink-0" />
        <div className="text-xs text-[var(--app-text-secondary)] space-y-0.5">
          <p><strong className="text-[var(--app-text-primary)]">Formatos aceptados:</strong> JPG, PNG, WebP o HEIC (fotos de iPhone). SVG no se admite por seguridad.</p>
          <p><strong className="text-[var(--app-text-primary)]">Tamaño máximo:</strong> 5 MB.</p>
          <p><strong className="text-[var(--app-text-primary)]">Recomendado:</strong> imagen cuadrada, PNG con fondo transparente para que se vea bien tanto en modo claro como oscuro.</p>
        </div>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${dragging ? 'border-[var(--app-primary)] bg-[var(--app-primary-soft)]' : 'border-[var(--app-border)] bg-[var(--app-surface)]'}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        aria-busy={busy}
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {image ? (
            <img src={image} alt="Logo de la organización" className="h-20 w-20 rounded-xl object-contain bg-[var(--app-surface-solid)] border border-[var(--app-border)] p-2" />
          ) : (
            <span className="h-20 w-20 rounded-xl grid place-items-center bg-[var(--app-surface-solid)] border border-[var(--app-border)] text-[var(--app-text-muted)]">
              <ImagePlus size={28} />
            </span>
          )}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0])}
                disabled={disabled || busy}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-on-primary,#fff)] text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadCloud size={16} />
                {value ? 'Reemplazar logo' : 'Subir logo'}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={disabled || busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--app-danger-soft)] hover:opacity-90 text-[var(--app-danger)] text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
        {busy && (
          <div className="mt-3" role="status" aria-live="polite">
            <div className="h-2 rounded-full bg-[var(--app-surface-muted)] overflow-hidden">
              <span className="block h-full bg-[var(--app-primary)] transition-all" style={{ width: `${progress || 8}%` }} />
            </div>
            <small className="text-[var(--app-text-secondary)]">Procesando logo{progress ? ` ${progress}%` : '...'}</small>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-[var(--app-danger)]" role="alert">{error}</p>}
    </div>
  );
}

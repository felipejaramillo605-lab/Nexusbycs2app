import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { legalAPI } from '../api';
import { ActionButton, MotionPage, PageHeader, StatusBadge, SurfaceCard } from '../components/design';

// Ruta del Owner para corregir los documentos legales sin tocar el código (pedido del abogado).
// El texto base viene de /legal/*.md; lo guardado aquí lo reemplaza. Publicar una nueva versión
// obliga a todos los usuarios a aceptar de nuevo.
const BASE_URLS = {
  terminos: '/legal/terminos.md',
  'contrato-transmision': '/legal/contrato-transmision.md',
  'uso-aceptable-ia': '/legal/uso-aceptable-ia.md',
};

export default function OwnerLegalDocuments() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState('terminos');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (key, source) => {
    const custom = source.documents[key];
    setActive(key);
    setPublish(false);
    if (custom) {
      setTitle(custom.title);
      setBody(custom.body_md);
      return;
    }
    setTitle(source.titles[key]);
    try {
      const response = await fetch(BASE_URLS[key]);
      setBody(response.ok ? await response.text() : '');
    } catch (error) {
      setBody('');
    }
  }, []);

  const load = useCallback(async (key) => {
    try {
      const response = await legalAPI.ownerGetDocuments();
      setData(response.data);
      await open(key, response.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No pudimos cargar los documentos');
    }
  }, [open]);

  useEffect(() => {
    load('terminos');
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const response = await legalAPI.ownerSaveDocument(active, { title, body_md: body, publish_new_version: publish });
      toast.success(publish ? `Nueva versión publicada: ${response.data.version}` : 'Cambios guardados');
      await load(active);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Revisa el texto (mínimo 20 caracteres)');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await legalAPI.ownerRestoreDocument(active);
      toast.success('Texto base restaurado');
      await load(active);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No fue posible restaurar');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="nexus-screen"><div className="max-w-4xl mx-auto px-4 py-8">Cargando…</div></div>;
  }

  return (
    <div className="nexus-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <MotionPage className="space-y-6">
          <PageHeader
            eyebrow="IT y auditoría"
            title="Documentos legales"
            description="Edita los términos, el contrato de transmisión y el uso aceptable. Usa formato Markdown."
            actions={<StatusBadge tone="info">{`Versión vigente ${data.version}`}</StatusBadge>}
          />
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.titles).map(([key, label]) => (
              <ActionButton key={key} variant={key === active ? 'primary' : 'secondary'} onClick={() => open(key, data)}>
                {label}
                {data.documents[key] ? ' •' : ''}
              </ActionButton>
            ))}
          </div>
          <SurfaceCard>
            <p className="text-sm mb-3">
              {data.documents[active] ? 'Este documento tiene un texto editado por el Owner.' : 'Este documento usa el texto base.'}
            </p>
            <label className="block mb-3">
              Título
              <input className="nexus-field" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="block mb-3">
              Texto (Markdown)
              <textarea
                className="nexus-field font-mono"
                rows={22}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-3 mb-4">
              <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
              <span>Publicar como nueva versión: todos los usuarios deberán aceptar de nuevo al ingresar. Úsalo para cambios de fondo; para corregir una errata déjalo sin marcar.</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <ActionButton icon={Save} loading={busy} onClick={save}>Guardar</ActionButton>
              {data.documents[active] && (
                <ActionButton variant="secondary" icon={RotateCcw} disabled={busy} onClick={restore}>Restaurar texto base</ActionButton>
              )}
            </div>
            <p className="text-xs mt-4">Los marcadores {'{{CC_RESPONSABLE}}'} y {'{{DIRECCION_COMPLETA}}'} se reemplazan solo para quien aceptó el contrato.</p>
          </SurfaceCard>
        </MotionPage>
      </div>
    </div>
  );
}

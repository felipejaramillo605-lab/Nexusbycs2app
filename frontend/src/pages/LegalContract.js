import React, { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { legalAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { getHomeForRole } from '../lib/roleNavigation';
import { ActionButton, MotionPage, PageHeader, StatusBadge, SurfaceCard } from '../components/design';

// Contrato y politicas para usuarios registrados. El documento de identidad y la direccion completa del
// Responsable NO estan en este archivo ni en /public: llegan del backend solo tras aceptar (Ley 527 de 1999).
// Cada documento puede ser reemplazado por el Owner desde /owner/legal-documents; si no, se usa el texto base.
const DOCUMENTS = [
  ['terminos', 'Términos de servicio', '/legal/terminos.md'],
  ['contrato-transmision', 'Contrato de transmisión de datos', '/legal/contrato-transmision.md'],
  ['uso-aceptable-ia', 'Uso aceptable e inteligencia artificial', '/legal/uso-aceptable-ia.md'],
];

export function fillPlaceholders(text, privateData) {
  const documentLabel = privateData ? `${privateData.document_type || 'C.C.'} ${privateData.document_number}` : null;
  return text
    .split('{{CC_RESPONSABLE}}')
    .join(documentLabel ? privateData.document_number : '(visible tras aceptar)')
    .split('{{DIRECCION_COMPLETA}}')
    .join(privateData ? privateData.full_address : '(visible tras aceptar)')
    .split('{{DOCUMENTO_RESPONSABLE}}')
    .join(documentLabel || '(visible tras aceptar)');
}

async function sha256(text) {
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    return null;
  }
}

export default function LegalContract() {
  const [info, setInfo] = useState(null);
  const [texts, setTexts] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [response, custom, ...docs] = await Promise.all([
        legalAPI.getResponsible(),
        legalAPI.getDocuments().catch(() => ({ data: { documents: {} } })),
        ...DOCUMENTS.map(([, , url]) => fetch(url).then((r) => (r.ok ? r.text() : ''))),
      ]);
      const overrides = custom.data.documents || {};
      setInfo(response.data);
      setTexts(DOCUMENTS.map(([key], index) => (overrides[key] ? overrides[key].body_md : docs[index])));
    } catch (err) {
      setError(err?.response?.data?.detail || 'No pudimos cargar el contrato. Intenta de nuevo.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    if (!checked || busy || !info) return;
    setBusy(true);
    try {
      const hash = await sha256((texts || []).join('\n'));
      await legalAPI.accept(info.version, hash);
      toast.success('Aceptación registrada');
      window.dispatchEvent(new Event('nexus:legal-accepted'));
      await load();
      const from = location.state?.from;
      if (from && from !== '/legal/contrato') navigate(from, { replace: true });
      else if (user) navigate(getHomeForRole(user.role), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No fue posible registrar la aceptación');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="nexus-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <p role="alert">{error}</p>
        </div>
      </div>
    );
  }
  if (!info || !texts) {
    return (
      <div className="nexus-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  const { public: contact, private: privateData, accepted } = info;
  return (
    <div className="nexus-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <MotionPage className="space-y-6">
          <PageHeader
            eyebrow="Legal"
            title="Contrato y políticas"
            description="Lee y acepta el contrato para ver los datos completos del Responsable."
            actions={<StatusBadge tone={accepted ? 'success' : 'warning'}>{accepted ? 'Aceptado' : 'Pendiente de aceptar'}</StatusBadge>}
          />
          <SurfaceCard>
            <h2 className="text-lg">Responsable del tratamiento</h2>
            <ul className="mt-3 space-y-1">
              <li>Nombre: {contact.full_name || '—'}</li>
              <li>Municipio: {contact.municipality || '—'}</li>
              <li>Correo: {contact.email || '—'}</li>
              <li>Teléfono para atención de solicitudes: {contact.phone || '—'}</li>
              <li>Documento de identidad: {privateData ? `${privateData.document_type} ${privateData.document_number}` : 'Visible tras aceptar el contrato'}</li>
              <li>Dirección: {privateData ? privateData.full_address : 'Visible tras aceptar el contrato'}</li>
            </ul>
          </SurfaceCard>
          {DOCUMENTS.map(([, title], index) => (
            <SurfaceCard key={title}>
              <h2 className="text-lg mb-3">{title}</h2>
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown>{fillPlaceholders(texts[index] || '', privateData)}</ReactMarkdown>
              </div>
            </SurfaceCard>
          ))}
          {!accepted && (
            <SurfaceCard>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                <span>He leído y acepto los términos de servicio, el contrato de transmisión de datos y la política de uso aceptable (versión {info.version}).</span>
              </label>
              <div className="mt-4">
                <ActionButton icon={ShieldCheck} disabled={!checked} loading={busy} onClick={accept}>Aceptar y ver datos completos</ActionButton>
              </div>
            </SurfaceCard>
          )}
        </MotionPage>
      </div>
    </div>
  );
}

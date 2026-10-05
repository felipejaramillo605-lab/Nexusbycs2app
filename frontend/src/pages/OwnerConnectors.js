import React, { useCallback, useEffect, useState } from 'react';
import { Mail, HardDrive, Sparkles, RefreshCw, Send } from 'lucide-react';
import { ownerConnectorsAPI } from '../api';
import { ActionButton, MotionPage, PageHeader, StatusBadge, SurfaceCard } from '../components/design';

const EVENT_LABELS = {
  'email.sent': 'Enviados',
  'email.delivered': 'Entregados',
  'email.delivery_delayed': 'Demorados',
  'email.bounced': 'Rebotados',
  'email.complained': 'Quejas',
  'email.suppressed': 'Bloqueados',
  'email.failed': 'Fallidos',
};

function Row({ label, ok, okText = 'Configurado', offText = 'Sin configurar', offTone = 'warning' }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <StatusBadge tone={ok ? 'success' : offTone}>{ok ? okText : offText}</StatusBadge>
    </li>
  );
}

export default function OwnerConnectors() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResponse, eventsResponse] = await Promise.all([
        ownerConnectorsAPI.getStatus(),
        ownerConnectorsAPI.getEmailEvents().catch(() => null),
      ]);
      setStatus(statusResponse.data);
      setEvents(eventsResponse ? eventsResponse.data : null);
    } catch {
      setError('No disponible. Reintenta la consulta.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await ownerConnectorsAPI.sendTestEmail();
      const via = { resend: 'Resend', smtp: 'Gmail (SMTP)', smtp_fallback: 'Gmail (SMTP) porque Resend falló' }[data.provider] || 'proveedor desconocido';
      setTestResult(data.sent
        ? { ok: true, text: `Correo enviado a ${data.recipient} por ${via}. Revisa tu bandeja (y spam).` }
        : { ok: false, text: `No se pudo enviar${data.resend_error ? ` (Resend: ${data.resend_error})` : ''}. Revisa la configuración.` });
    } catch (err) {
      setTestResult({ ok: false, text: err?.response?.status === 429 ? 'Demasiadas pruebas seguidas. Intenta en una hora.' : 'No se pudo enviar la prueba.' });
    } finally {
      setTesting(false);
    }
  };

  const email = status?.email;
  const counts = events?.counts || {};
  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader
        eyebrow="IT y auditoría"
        title="Conectores"
        description="Estado de los servicios externos de Nexus. Solo lectura: nunca se muestran claves."
        actions={<ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Actualizar</ActionButton>}
      />
      {error ? <SurfaceCard><p role="alert">{error}</p><ActionButton variant="secondary" onClick={load}>Reintentar</ActionButton></SurfaceCard> : null}
      {loading && !status ? <SurfaceCard><div className="nexus-skeleton-row" /></SurfaceCard> : null}
      {status ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SurfaceCard>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><HardDrive className="shrink-0" size={18} /> Almacenamiento de medios</h2>
            <ul>
              <Row label="Almacenamiento durable (Cloudflare R2)" ok={Boolean(status.storage.durable_provider)} okText="Activo" offText="Apagado" />
              <Row label="Copia de respaldo en la base de datos" ok={status.storage.mongo_mirror} okText="Activa" offText="Apagada" />
            </ul>
            <p className="nexus-owner-caption">Sin R2, los archivos de más de 15 MB (videos de fondo) no tienen copia durable.</p>
          </SurfaceCard>
          <SurfaceCard>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Mail className="shrink-0" size={18} /> Correo</h2>
            <ul>
              <Row label="Envío principal" ok={email.resend_enabled} okText="Resend" offText="Gmail (SMTP)" offTone="info" />
              <Row label="Clave y remitente de Resend" ok={email.resend_api_key_set && email.sender_set} />
              <Row label="Respaldo por SMTP" ok={email.smtp_fallback_ready} okText="Listo" offText="No disponible" />
              <Row label="Webhook de rebotes (firma)" ok={email.webhook_secret_set} />
            </ul>
            <ActionButton variant="secondary" icon={Send} onClick={sendTest} disabled={testing}>Enviar correo de prueba</ActionButton>
            {testResult ? <p role="status" className="nexus-owner-caption">{testResult.text}</p> : null}
          </SurfaceCard>
          <SurfaceCard>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="shrink-0" size={18} /> Motor de decisiones</h2>
            <ul>
              <Row label="Motor de decisiones" ok={status.decisions.engine_enabled} okText="Encendido" offText="Apagado" offTone="info" />
              <Row label="Clave de Jev" ok={status.decisions.jev_key_set} offTone="info" />
            </ul>
            <p className="nexus-owner-caption">Las sugerencias solo proponen; una persona confirma.</p>
          </SurfaceCard>
        </div>
      ) : null}
      {events ? (
        <SurfaceCard>
          <h2 className="font-semibold">Correo de los últimos {events.window_days} días</h2>
          {Object.keys(counts).length === 0 ? (
            <p className="nexus-owner-caption">Aún no hay eventos. Aparecerán cuando el webhook de Resend esté activo.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 py-2">
              {Object.entries(counts).map(([type, total]) => (
                <li key={type}><StatusBadge tone={type === 'email.delivered' || type === 'email.sent' ? 'success' : 'warning'}>{EVENT_LABELS[type] || type}: {total}</StatusBadge></li>
              ))}
            </ul>
          )}
          {events.suppressed?.length ? (
            <>
              <h3 className="mt-3 font-medium">Direcciones que dejaron de recibir correo</h3>
              <ul>
                {events.suppressed.map((row) => (
                  <li key={`${row.address_masked}-${row.updated_at}`} className="py-1">{row.address_masked} <small>({EVENT_LABELS[row.reason] || row.reason})</small></li>
                ))}
              </ul>
            </>
          ) : null}
        </SurfaceCard>
      ) : null}
    </MotionPage>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ownerSecurityAPI } from '../api';
import { ActionButton, AnimatedNumber, EmptyState, MetricCard, MotionPage, PageHeader, ResponsiveDataView, SegmentedControl, StatusBadge, SurfaceCard } from '../components/design';

const eventTypeLabels = {
  origin_blocked: 'Origen bloqueado',
  cross_site_request_blocked: 'Solicitud entre sitios bloqueada',
  authentication_rate_limited: 'Límite de intentos de autenticación',
  cross_tenant_access_blocked: 'Acceso entre organizaciones bloqueado',
};
const severityTones = { high: 'danger', warning: 'warning', info: 'neutral' };
const safeDetail = (e) => e.response?.data?.detail || 'No fue posible cargar los eventos de seguridad';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 22): first read-only view over
// security_events -- record_security_event() (request_security.py, server.py,
// professional_media.py, support_center.py) has written here since this
// module was first built, with zero frontend consumers before this page.
// source_fingerprint/actor_fingerprint/organization_fingerprint are one-way
// HMAC hashes, not reversible to a real identity -- shown as-is, matching
// this module's existing privacy stance (never a name/email/IP in the UI).
export default function OwnerSecurityEvents() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ownerSecurityAPI.listEvents({
        page,
        page_size: 25,
        event_type: eventType === 'all' ? undefined : eventType,
        severity: severity === 'all' ? undefined : severity,
      });
      setRows(r.data.items || []);
      setMeta(r.data);
    } catch (e) {
      toast.error(safeDetail(e));
    } finally {
      setLoading(false);
    }
  }, [page, eventType, severity]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    ownerSecurityAPI.getEventsSummary().then((r) => setSummary(r.data)).catch(() => setSummary(null));
  }, []);

  const changeType = (v) => { setEventType(v); setPage(1); };
  const changeSeverity = (v) => { setSeverity(v); setPage(1); };

  const typeOptions = [{ value: 'all', label: 'Todos los tipos' }, ...Object.keys(eventTypeLabels).map((key) => ({ value: key, label: eventTypeLabels[key] }))];

  const columns = [
    { key: 'type', label: 'Tipo', render: (x) => eventTypeLabels[x.event_type] || x.event_type },
    { key: 'severity', label: 'Severidad', render: (x) => <StatusBadge tone={severityTones[x.severity] || 'warning'}>{x.severity}</StatusBadge> },
    { key: 'path', label: 'Ruta', render: (x) => <span>{x.request_method} {x.normalized_path}</span> },
    { key: 'source', label: 'Origen', render: (x) => x.source_fingerprint || x.actor_fingerprint || x.organization_fingerprint || '—' },
    { key: 'occurrences', label: 'Ocurrencias', render: (x) => x.occurrence_count },
    { key: 'last_seen', label: 'Última vez', render: (x) => x.last_seen_at?.slice(0, 16).replace('T', ' ') || '—' },
    { key: 'code', label: 'Código', render: (x) => x.diagnostic_code },
  ];

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader eyebrow="IT y auditoría" title="Eventos de seguridad" description="Bloqueos de origen, límites de intentos y accesos entre organizaciones rechazados por el backend." />
      {summary && <p role="note">{summary.scope?.filtered === false ? "Resumen global: los filtros de la tabla no se aplican a estas cifras." : "Alcance del resumen no informado por el servidor."} {summary.retention_days != null && `Retención configurada: ${summary.retention_days} días; no garantiza cobertura completa de ese periodo.`} {summary.generated_at && <>Consulta generada: <time dateTime={summary.generated_at}>{summary.generated_at} (UTC)</time>.</>}</p>}
      {summary && (
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Tipos de evento" value={<AnimatedNumber value={summary.by_event_type?.length || 0} format={(v) => Math.round(v)} />} icon={ShieldAlert} />
          <MetricCard label="Eventos distintos" value={<AnimatedNumber value={summary.total_events || 0} format={(v) => Math.round(v)} />} icon={ShieldAlert} />
          <MetricCard label="Ocurrencias totales" value={<AnimatedNumber value={summary.total_occurrences || 0} format={(v) => Math.round(v)} />} icon={ShieldAlert} />
        </section>
      )}
      <SurfaceCard>
        <div className="nexus-owner-toolbar">
          <SegmentedControl value={eventType} onChange={changeType} options={typeOptions} />
          <SegmentedControl value={severity} onChange={changeSeverity} options={[
            { value: 'all', label: 'Todas las severidades' },
            { value: 'warning', label: 'Advertencia' },
            { value: 'high', label: 'Alta' },
          ]} />
        </div>
        {loading ? (
          <div className="nexus-loading-state"><div className="nexus-skeleton-row" /><div className="nexus-skeleton-row" /></div>
        ) : (
          <ResponsiveDataView
            items={rows}
            columns={columns}
            rowKey={(x) => x.security_event_id}
            empty={<EmptyState icon={ShieldAlert} title="Sin eventos" description="No hay eventos de seguridad para estos filtros." />}
            renderCard={(x) => (
              <div>
                <div className="flex justify-between gap-3">
                  <strong>{eventTypeLabels[x.event_type] || x.event_type}</strong>
                  <StatusBadge tone={severityTones[x.severity] || 'warning'}>{x.severity}</StatusBadge>
                </div>
                <p>{x.request_method} {x.normalized_path}</p>
                <small>{x.occurrence_count} ocurrencia(s) · última vez {x.last_seen_at?.slice(0, 16).replace('T', ' ') || '—'}</small>
              </div>
            )}
          />
        )}
        <div className="flex justify-between items-center gap-3 mt-5">
          <small>Página {meta.page || 1} de {meta.total_pages || 1} · {meta.total || 0} resultado(s)</small>
          <div className="flex gap-2">
            <ActionButton variant="secondary" icon={ChevronLeft} disabled={!meta.has_previous || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</ActionButton>
            <ActionButton variant="secondary" icon={ChevronRight} disabled={!meta.has_next || loading} onClick={() => setPage((p) => p + 1)}>Siguiente</ActionButton>
          </div>
        </div>
      </SurfaceCard>
    </MotionPage>
  );
}

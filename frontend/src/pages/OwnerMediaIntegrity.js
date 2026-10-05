import React, { useCallback, useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ownerAPI, ownerMediaIntegrityAPI, thirdPartyMatrixAPI } from '../api';
import { ActionButton, confirmAction, EmptyState, MotionPage, PageHeader, ResponsiveDataView, StatusBadge, SurfaceCard } from '../components/design';

export default function OwnerMediaIntegrity() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [organizationNames, setOrganizationNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [reportResponse, organizationsResponse] = await Promise.all([
        ownerMediaIntegrityAPI.getReport(),
        thirdPartyMatrixAPI.list({ page_size: 2000 }).catch(() => null),
      ]);
      setReport(reportResponse.data);
      setOrganizationNames(Object.fromEntries((organizationsResponse?.data?.items || []).map((row) => [row.organization_id, row.name || row.legal_name || row.organization_id])));
    }
    catch { setError('No disponible. Reintenta la consulta.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const backfill = async () => {
    const accepted = await confirmAction('Se copiarán los medios disponibles al almacenamiento durable. Esta operación no borra las copias existentes.', { title: 'Copiar medios a almacenamiento durable', confirmLabel: 'Copiar medios' });
    if (!accepted) return;
    setBackfilling(true); setBackfillResult(null);
    try {
      const result = (await ownerAPI.backfillObjectStorage()).data;
      setBackfillResult(result);
      if (result.enabled) await load();
    } catch { setBackfillResult({ error: true }); }
    finally { setBackfilling(false); }
  };
  const columns = [
    { key: 'kind', label: 'Tipo', render: x => x.kind.replaceAll('_', ' ') },
    { key: 'organization_id', label: 'Organización', render: x => x.organization_id ? organizationNames[x.organization_id] || x.organization_id : 'Plataforma' },
    { key: 'url', label: 'Archivo', render: x => x.url },
    { key: 'recoverable', label: 'Copia durable', render: x => <StatusBadge tone={x.recoverable_from_mirror ? 'success' : 'warning'}>{x.recoverable_from_mirror ? 'Disponible' : 'No disponible'}</StatusBadge> },
  ];
  const unrecoverableByOrganization = (report?.broken || []).filter((item) => !item.recoverable_from_mirror).reduce((groups, item) => {
    const key = item.organization_id || 'platform';
    groups[key] = [...(groups[key] || []), item];
    return groups;
  }, {});
  const uploadInstructions = (kind) => ({
    organization_logo: 'Configuración → General → Logo de la organización',
    portal_background: 'Configuración → Mi Portal → Fondo del portal',
    professional_photo: 'Equipo → abre el profesional → foto',
    service_image: 'Servicios → abre el servicio → imágenes',
    catalog_image: 'Inventario → abre el producto → imágenes',
    platform_logo: 'Owner → IT y auditoría → Marca de Nexus',
  }[kind] || 'la pantalla de configuración del recurso');
  return <MotionPage className="nexus-owner-page space-y-6">
    <PageHeader eyebrow="IT y auditoría" title="Integridad de medios" description="Detecta imágenes administradas que faltan en el almacenamiento. Este reporte es de solo lectura." actions={<><ActionButton variant="secondary" onClick={backfill} disabled={loading || backfilling} loading={backfilling}>Copiar medios a almacenamiento durable</ActionButton><ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={loading || backfilling}>Reintentar</ActionButton></>} />
    {error ? <SurfaceCard><p role="alert">{error}</p><ActionButton variant="secondary" onClick={load}>Reintentar</ActionButton></SurfaceCard> : null}
    {backfillResult ? <SurfaceCard><p role={backfillResult.error ? 'alert' : 'status'}>{backfillResult.error ? 'No fue posible copiar los medios. Reintenta la operación.' : backfillResult.enabled === false ? 'Almacenamiento durable no configurado' : `Proceso terminado: ${backfillResult.copied || 0} copiados y ${backfillResult.failed || 0} con error.`}</p></SurfaceCard> : null}
    {!loading && report ? <SurfaceCard>{report.truncated ? <p>La lista fue limitada para proteger el rendimiento.</p> : null}<p className="nexus-owner-caption">Si una copia durable no está disponible, vuelve a cargarla desde Marca de Nexus o la personalización de la organización.</p>{Object.entries(unrecoverableByOrganization).map(([organizationId, findings]) => <section key={organizationId} className="mt-4 rounded-xl border border-amber-500/30 p-4" data-testid={`unrecoverable-${organizationId}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{organizationId === 'platform' ? 'Plataforma Nexus' : organizationNames[organizationId] || organizationId}</h2><p className="nexus-owner-caption">{findings.length} medio(s) no recuperable(s): vuelve a subirlos.</p></div>{organizationId !== 'platform' ? <ActionButton variant="secondary" onClick={() => navigate(`/owner/organizations?organization_id=${encodeURIComponent(organizationId)}`)}>Abrir organización</ActionButton> : null}</div><ul className="mt-3 space-y-2">{findings.map((item) => <li key={`${item.kind}-${item.entity_id}-${item.url}`}><strong>{item.kind.replaceAll('_', ' ')}</strong><span className="block text-sm">Subir de nuevo desde {uploadInstructions(item.kind)}.</span></li>)}</ul></section>)}<ResponsiveDataView items={report.broken || []} columns={columns} rowKey={x => `${x.kind}-${x.entity_id}-${x.url}`} empty={<EmptyState icon={ImageOff} title="Todo está disponible" description="No se encontraron medios administrados faltantes." />} renderCard={x => <div><strong>{x.kind.replaceAll('_', ' ')}</strong><p>{x.url}</p><StatusBadge tone={x.recoverable_from_mirror ? 'success' : 'warning'}>{x.recoverable_from_mirror ? 'Copia durable disponible' : 'No disponible'}</StatusBadge></div>} /></SurfaceCard> : loading ? <SurfaceCard><div className="nexus-skeleton-row" /></SurfaceCard> : null}
  </MotionPage>;
}

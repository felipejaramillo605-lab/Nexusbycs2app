import React, { useCallback, useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { ownerAPI, ownerMediaIntegrityAPI } from '../api';
import { ActionButton, confirmAction, EmptyState, MotionPage, PageHeader, ResponsiveDataView, StatusBadge, SurfaceCard } from '../components/design';

export default function OwnerMediaIntegrity() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setReport((await ownerMediaIntegrityAPI.getReport()).data); }
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
    { key: 'organization_id', label: 'Organización', render: x => x.organization_id || 'Plataforma' },
    { key: 'url', label: 'Archivo', render: x => x.url },
    { key: 'recoverable', label: 'Copia durable', render: x => <StatusBadge tone={x.recoverable_from_mirror ? 'success' : 'warning'}>{x.recoverable_from_mirror ? 'Disponible' : 'No disponible'}</StatusBadge> },
  ];
  return <MotionPage className="nexus-owner-page space-y-6">
    <PageHeader eyebrow="IT y auditoría" title="Integridad de medios" description="Detecta imágenes administradas que faltan en el almacenamiento. Este reporte es de solo lectura." actions={<><ActionButton variant="secondary" onClick={backfill} disabled={loading || backfilling} loading={backfilling}>Copiar medios a almacenamiento durable</ActionButton><ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={loading || backfilling}>Reintentar</ActionButton></>} />
    {error ? <SurfaceCard><p role="alert">{error}</p><ActionButton variant="secondary" onClick={load}>Reintentar</ActionButton></SurfaceCard> : null}
    {backfillResult ? <SurfaceCard><p role={backfillResult.error ? 'alert' : 'status'}>{backfillResult.error ? 'No fue posible copiar los medios. Reintenta la operación.' : backfillResult.enabled === false ? 'Almacenamiento durable no configurado' : `Proceso terminado: ${backfillResult.copied || 0} copiados y ${backfillResult.failed || 0} con error.`}</p></SurfaceCard> : null}
    {!loading && report ? <SurfaceCard>{report.truncated ? <p>La lista fue limitada para proteger el rendimiento.</p> : null}<p className="nexus-owner-caption">Si una copia durable no está disponible, vuelve a cargarla desde Marca de Nexus o la personalización de la organización.</p><ResponsiveDataView items={report.broken || []} columns={columns} rowKey={x => `${x.kind}-${x.entity_id}-${x.url}`} empty={<EmptyState icon={ImageOff} title="Todo está disponible" description="No se encontraron medios administrados faltantes." />} renderCard={x => <div><strong>{x.kind.replaceAll('_', ' ')}</strong><p>{x.url}</p><StatusBadge tone={x.recoverable_from_mirror ? 'success' : 'warning'}>{x.recoverable_from_mirror ? 'Copia durable disponible' : 'No disponible'}</StatusBadge></div>} /></SurfaceCard> : loading ? <SurfaceCard><div className="nexus-skeleton-row" /></SurfaceCard> : null}
  </MotionPage>;
}

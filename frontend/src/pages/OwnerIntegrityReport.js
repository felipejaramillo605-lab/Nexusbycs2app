import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { ownerIntegrityAPI } from '../api';
import { ActionButton, EmptyState, MetricCard, MotionPage, PageHeader, ResponsiveDataView, SegmentedControl, StatusBadge, SurfaceCard } from '../components/design';

const domainLabels = { bookings: 'Reservas y citas', billing: 'Facturación', procurement: 'Inventario/compras' };
const kindLabels = {
  orphaned_class_booking: 'Reserva sin clase',
  class_session_missing_barber: 'Clase sin profesional',
  class_session_missing_service: 'Clase sin servicio',
  appointment_missing_barber: 'Cita sin profesional',
  appointment_missing_service: 'Cita sin servicio',
  invoice_missing_organization: 'Factura sin organización',
  subscription_missing_organization: 'Suscripción sin organización',
  purchase_order_missing_supplier: 'Orden de compra sin proveedor',
  purchase_receipt_missing_order: 'Recibo sin orden de compra',
};
const safeDetail = (e) => e.response?.data?.detail || 'No fue posible cargar el reporte de integridad';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 23): first cross-domain integrity
// view, extending the read-only reconciliation pattern
// professional_media_lifecycle.py already established (orphan/broken-
// reference findings, never a write) to the three domains the user chose:
// bookings/appointments, billing/subscriptions, and inventory/procurement.
// Strictly read-only, same stance as every other IT y auditoría page.
export default function OwnerIntegrityReport() {
  const [report, setReport] = useState(null);
  const [domain, setDomain] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ownerIntegrityAPI.getReport({ domain: domain === 'all' ? undefined : domain });
      setReport(r.data);
    } catch (e) {
      toast.error(safeDetail(e));
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'domain', label: 'Dominio', render: (x) => domainLabels[x.domain] || x.domain },
    { key: 'kind', label: 'Hallazgo', render: (x) => <StatusBadge tone="warning">{kindLabels[x.kind] || x.kind}</StatusBadge> },
    { key: 'organization', label: 'Organización', render: (x) => x.organization_id || '—' },
    { key: 'entity', label: 'Entidad', render: (x) => `${x.entity_type} · ${x.entity_id || '—'}` },
    { key: 'detail', label: 'Detalle', render: (x) => x.detail },
  ];

  const summary = report?.summary || {};

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader
        eyebrow="IT y auditoría"
        title="Reporte de integridad"
        description="Referencias huérfanas entre reservas, facturación e inventario. Solo lectura -- no corrige nada automáticamente."
        actions={<ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Actualizar</ActionButton>}
      />
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Hallazgos totales" value={report?.total_findings ?? '—'} icon={ShieldQuestion} />
        <MetricCard label="Reservas y citas" value={summary.bookings ?? '—'} icon={ShieldQuestion} />
        <MetricCard label="Facturación" value={summary.billing ?? '—'} icon={ShieldQuestion} />
        <MetricCard label="Inventario/compras" value={summary.procurement ?? '—'} icon={ShieldQuestion} />
      </section>
      <SurfaceCard>
        <div className="nexus-owner-toolbar">
          <SegmentedControl value={domain} onChange={setDomain} options={[
            { value: 'all', label: 'Todos los dominios' },
            { value: 'bookings', label: domainLabels.bookings },
            { value: 'billing', label: domainLabels.billing },
            { value: 'procurement', label: domainLabels.procurement },
          ]} />
        </div>
        {loading ? (
          <div className="nexus-loading-state"><div className="nexus-skeleton-row" /><div className="nexus-skeleton-row" /></div>
        ) : (
          <ResponsiveDataView
            items={report?.findings || []}
            columns={columns}
            rowKey={(x) => `${x.entity_type}-${x.entity_id}-${x.kind}`}
            empty={<EmptyState icon={ShieldQuestion} title="Sin hallazgos" description="No se encontraron referencias huérfanas para este dominio." />}
            renderCard={(x) => (
              <div>
                <div className="flex justify-between gap-3">
                  <strong>{kindLabels[x.kind] || x.kind}</strong>
                  <StatusBadge tone="warning">{domainLabels[x.domain] || x.domain}</StatusBadge>
                </div>
                <p>{x.entity_type} · {x.entity_id || '—'}</p>
                <small>{x.detail}</small>
              </div>
            )}
          />
        )}
      </SurfaceCard>
    </MotionPage>
  );
}

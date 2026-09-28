import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { ownerAuditAPI } from '../api';
import { ActionButton, EmptyState, MotionPage, PageHeader, ResponsiveDataView, SegmentedControl, StatusBadge, SurfaceCard } from '../components/design';

const categoryLabels = {
  account: 'Cuentas de usuario',
  billing: 'Facturación',
  fiscal_profile: 'Perfil fiscal',
  capability: 'Permisos de plataforma',
};
const categoryTones = { account: 'info', billing: 'warning', fiscal_profile: 'neutral', capability: 'danger' };
const safeDetail = (e) => e.response?.data?.detail || 'No fue posible cargar el registro de auditoría';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 21/24): first unified view over the
// audit contract (audit_contracts.py) -- merges what used to be four
// separately-read (or never-read) audit trails into one timeline. Read-only
// by design, same as the security events view: this page never mutates
// anything, it only surfaces what other admin actions already recorded.
export default function OwnerAuditLog() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ownerAuditAPI.listEvents({ page, page_size: 25, category: category === 'all' ? undefined : category });
      setRows(r.data.items || []);
      setMeta(r.data);
    } catch (e) {
      toast.error(safeDetail(e));
    } finally {
      setLoading(false);
    }
  }, [page, category]);

  useEffect(() => { load(); }, [load]);

  const changeCategory = (v) => { setCategory(v); setPage(1); };

  const columns = [
    { key: 'category', label: 'Categoría', render: (x) => <StatusBadge tone={categoryTones[x.category] || 'neutral'}>{categoryLabels[x.category] || x.category}</StatusBadge> },
    { key: 'event', label: 'Evento', render: (x) => x.event_type },
    { key: 'entity', label: 'Entidad', render: (x) => x.entity_type ? `${x.entity_type} · ${x.entity_id || '—'}` : '—' },
    { key: 'organization', label: 'Organización', render: (x) => x.organization_id || '—' },
    { key: 'actor', label: 'Actor', render: (x) => x.actor_user_id || '—' },
    { key: 'reason', label: 'Motivo', render: (x) => x.reason || '—' },
    { key: 'created', label: 'Fecha', render: (x) => x.created_at?.slice(0, 16).replace('T', ' ') || '—' },
  ];

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader eyebrow="IT y auditoría" title="Registro de auditoría" description="Línea de tiempo unificada de cambios de cuentas, facturación, perfil fiscal y permisos de plataforma." />
      <SurfaceCard>
        <div className="nexus-owner-toolbar">
          <SegmentedControl value={category} onChange={changeCategory} options={[
            { value: 'all', label: 'Todas las categorías' },
            { value: 'account', label: categoryLabels.account },
            { value: 'billing', label: categoryLabels.billing },
            { value: 'fiscal_profile', label: categoryLabels.fiscal_profile },
            { value: 'capability', label: categoryLabels.capability },
          ]} />
        </div>
        {loading ? (
          <div className="nexus-loading-state"><div className="nexus-skeleton-row" /><div className="nexus-skeleton-row" /></div>
        ) : (
          <ResponsiveDataView
            items={rows}
            columns={columns}
            rowKey={(x) => x.audit_id}
            empty={<EmptyState icon={ScrollText} title="Sin eventos" description="No hay eventos de auditoría para esta categoría." />}
            renderCard={(x) => (
              <div>
                <div className="flex justify-between gap-3">
                  <strong>{x.event_type}</strong>
                  <StatusBadge tone={categoryTones[x.category] || 'neutral'}>{categoryLabels[x.category] || x.category}</StatusBadge>
                </div>
                <p>{x.entity_type ? `${x.entity_type} · ${x.entity_id || '—'}` : x.organization_id || '—'}</p>
                <small>{x.created_at?.slice(0, 16).replace('T', ' ') || '—'}</small>
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

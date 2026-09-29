import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CreditCard, LifeBuoy, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ownerAPI, organizationAPI, platformBillingAPI, subscriptionAPI, supportAPI } from '../api';
import { ActionButton, AdminShell, LoadingState, MetricCard, MotionPage, PageHeader, SurfaceCard } from '../components/design';
import { formatCOPMinor as money } from '../lib/currency';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7, cartera tile updated in PR 14):
// the platform's landing page. Every tile here is backed by an endpoint
// that already exists and is already consumed elsewhere in the app --
// nothing here is estimated or simulated. Cartera pendiente now reads the
// real cross-organization summary (GET /owner/billing/summary, plan PR
// 14) -- until that endpoint existed, this tile deliberately showed no
// number rather than fabricate one; see CarteraAgingCard.jsx for the same
// per-organization discipline.
export default function OwnerHome() {
  const [summary, setSummary] = useState({ loading: true, orgCount: null, pendingAccess: null, pendingOnboarding: null, pendingPqrs: null, failedDeliveries: null, billing: null });

  const load = useCallback(() => {
    let cancelled = false;
    (async () => {
      setSummary((current) => ({ ...current, loading: true }));
      const [orgs, users, pqrs, health, billing] = await Promise.allSettled([
          organizationAPI.getAll(),
          ownerAPI.getUsers(),
          supportAPI.ownerList({ status: 'waiting_owner', page_size: 1 }),
          platformBillingAPI.getOperationalHealth(),
          subscriptionAPI.getBillingSummary(),
      ]);
      if (cancelled) return;
      const userRows = users.status === 'fulfilled' ? users.value.data || [] : null;
      const failed = [orgs, users, pqrs, health, billing].filter((result) => result.status === 'rejected');
      if (failed.length) toast.error(detail(failed[0].reason, 'Algunos indicadores no están disponibles.'));
      setSummary({
        loading: false,
        orgCount: orgs.status === 'fulfilled' ? (orgs.value.data || []).length : null,
        pendingAccess: userRows ? userRows.filter((u) => u.access_status === 'pending').length : null,
        pendingOnboarding: userRows ? userRows.filter((u) => ['manager', 'admin'].includes(u.role) && u.access_status === 'approved' && u.active !== false && !u.deleted_at && !u.organization_id).length : null,
        pendingPqrs: pqrs.status === 'fulfilled' ? pqrs.value.data?.total || 0 : null,
        failedDeliveries: health.status === 'fulfilled' ? health.value.data?.delivery_status_counts?.failed || 0 : null,
        billing: billing.status === 'fulfilled' ? billing.value.data : null,
      });
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => load(), [load]);

  const unavailable = (value) => value === null || value === undefined;
  const metricValue = (value) => unavailable(value) ? '—' : value;
  const metricDetail = (text, value) => unavailable(value) ? 'No disponible; actualiza para reintentar.' : text;

  return (
    <AdminShell organizationName="Owner — Nexus">
      <MotionPage>
        <PageHeader eyebrow="Owner" title="Inicio" description="Resumen accionable de la plataforma. Cada indicador enlaza a su bandeja de trabajo." actions={<ActionButton variant="secondary" icon={RefreshCw} onClick={load} disabled={summary.loading}>Actualizar</ActionButton>} />
        {summary.loading ? (
          <LoadingState label="Cargando resumen" />
        ) : (
          <>
            <div className="nexus-metric-grid">
              <Link to="/owner/organizations" className="nexus-metric-card-link">
                <MetricCard label="Organizaciones" value={metricValue(summary.orgCount)} detail={metricDetail('', summary.orgCount)} icon={Building2} />
              </Link>
              <Link to="/owner/billing" className="nexus-metric-card-link">
                <MetricCard label="Cartera pendiente" value={summary.billing ? money(summary.billing.total_pending_minor || 0, summary.billing.currency || 'COP') : '—'} detail={metricDetail(`${summary.billing?.organizations_with_balance || 0} organización(es)`, summary.billing)} icon={CreditCard} />
              </Link>
              <Link to="/owner/access" className="nexus-metric-card-link">
                <MetricCard label="Accesos pendientes" value={metricValue(summary.pendingAccess)} detail={metricDetail('', summary.pendingAccess)} icon={ShieldCheck} />
              </Link>
              <Link to="/owner/organizations/new" className="nexus-metric-card-link">
                <MetricCard label="Managers sin organización" value={metricValue(summary.pendingOnboarding)} detail={metricDetail('', summary.pendingOnboarding)} icon={UserRoundCheck} />
              </Link>
              <Link to="/owner/support" className="nexus-metric-card-link">
                <MetricCard label="PQRS esperando respuesta" value={metricValue(summary.pendingPqrs)} detail={metricDetail('', summary.pendingPqrs)} icon={LifeBuoy} />
              </Link>
            </div>
            <div className="nexus-subscription-grid">
              <Link to="/owner/security-events" className="nexus-metric-card-link">
                <SurfaceCard interactive>
                  <h2><AlertTriangle size={18} /> Salud operativa</h2>
                  <p>{unavailable(summary.failedDeliveries) ? 'No disponible; actualiza para reintentar.' : summary.failedDeliveries > 0 ? `${summary.failedDeliveries} entregas fallidas registradas.` : 'Sin entregas fallidas registradas.'}</p>
                </SurfaceCard>
              </Link>
            </div>
          </>
        )}
      </MotionPage>
    </AdminShell>
  );
}

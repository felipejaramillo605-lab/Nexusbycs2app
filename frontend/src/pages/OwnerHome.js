import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CreditCard, LifeBuoy, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ownerAPI, organizationAPI, platformBillingAPI, supportAPI } from '../api';
import { AdminShell, LoadingState, MetricCard, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7): the platform's landing page.
// Every tile here is backed by an endpoint that already exists and is
// already consumed elsewhere in the app -- nothing new was built to feed
// this page, and nothing is estimated or simulated. Cartera intentionally
// has no aggregate number: there is no cross-organization balance endpoint
// yet (confirmed during the Cartera/Organizaciones inventory), so showing
// one here would be exactly the fabricated KPI the plan forbids. That
// aggregate is PR 14's job, not this one's.
export default function OwnerHome() {
  const [loading, setLoading] = useState(true);
  const [orgCount, setOrgCount] = useState(0);
  const [pendingAccess, setPendingAccess] = useState(0);
  const [pendingOnboarding, setPendingOnboarding] = useState(0);
  const [pendingPqrs, setPendingPqrs] = useState(0);
  const [failedDeliveries, setFailedDeliveries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [orgs, users, pqrs, health] = await Promise.all([
          organizationAPI.getAll(),
          ownerAPI.getUsers(),
          supportAPI.ownerList({ status: 'waiting_owner', page_size: 1 }),
          platformBillingAPI.getOperationalHealth(),
        ]);
        if (cancelled) return;
        const userRows = users.data || [];
        setOrgCount((orgs.data || []).length);
        setPendingAccess(userRows.filter((u) => u.access_status === 'pending').length);
        setPendingOnboarding(userRows.filter((u) => ['manager', 'admin'].includes(u.role) && u.access_status === 'approved' && u.active !== false && !u.deleted_at && !u.organization_id).length);
        setPendingPqrs(pqrs.data?.total || 0);
        setFailedDeliveries(health.data?.delivery_status_counts?.failed || 0);
      } catch (err) {
        if (!cancelled) toast.error(detail(err, 'No fue posible cargar el resumen de la plataforma'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AdminShell organizationName="Owner — Nexus">
      <MotionPage>
        <PageHeader eyebrow="Owner" title="Inicio" description="Resumen accionable de la plataforma. Cada indicador enlaza a su bandeja de trabajo." />
        {loading ? (
          <LoadingState label="Cargando resumen" />
        ) : (
          <>
            <div className="nexus-metric-grid">
              <Link to="/owner/organizations" className="nexus-metric-card-link">
                <MetricCard label="Organizaciones" value={orgCount} icon={Building2} />
              </Link>
              <Link to="/owner/access" className="nexus-metric-card-link">
                <MetricCard label="Accesos pendientes" value={pendingAccess} icon={ShieldCheck} />
              </Link>
              <Link to="/owner/organizations/new" className="nexus-metric-card-link">
                <MetricCard label="Managers sin organización" value={pendingOnboarding} icon={UserRoundCheck} />
              </Link>
              <Link to="/owner/support" className="nexus-metric-card-link">
                <MetricCard label="PQRS esperando respuesta" value={pendingPqrs} icon={LifeBuoy} />
              </Link>
            </div>
            <div className="nexus-subscription-grid">
              <Link to="/owner/billing" className="nexus-metric-card-link">
                <SurfaceCard interactive>
                  <h2><CreditCard size={18} /> Cartera y facturación</h2>
                  <p>Sin agregado global todavía (pendiente de un endpoint de resumen entre organizaciones) — entra a Cartera para ver saldos y facturas por organización.</p>
                </SurfaceCard>
              </Link>
              <Link to="/owner/platform-branding" className="nexus-metric-card-link">
                <SurfaceCard interactive>
                  <h2><AlertTriangle size={18} /> Salud operativa</h2>
                  <p>{failedDeliveries > 0 ? `${failedDeliveries} entregas fallidas registradas.` : 'Sin entregas fallidas registradas.'}</p>
                </SurfaceCard>
              </Link>
            </div>
          </>
        )}
      </MotionPage>
    </AdminShell>
  );
}

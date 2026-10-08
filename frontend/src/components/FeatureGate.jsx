import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { AdminShell } from './design/AdminShell';
import { StaffNav } from './design/StaffNav';
import { FEATURE_LABELS, featureEnabled, getCountryProfile } from '../lib/countryProfile';

export function FeatureUnavailable({ feature, organization, home }) {
  const profile = getCountryProfile(organization);
  const label = FEATURE_LABELS[feature] || 'Esta función';
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 p-6 text-center" data-testid="feature-unavailable">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--app-primary-soft)] text-[var(--app-primary)]"><Hourglass size={26} /></span>
      <h1 className="text-2xl text-[var(--app-text-primary)]">{label}: disponible pronto</h1>
      <p className="text-[var(--app-text-secondary)]">
        {label} está desactivada de forma temporal para organizaciones de {profile.label} mientras la adaptamos a la normativa local.
        Las citas, los recordatorios y las confirmaciones a tus clientes siguen funcionando con normalidad.
      </p>
      <Link className="nexus-button nexus-button-primary" to={home}>Volver al inicio</Link>
    </div>
  );
}

/**
 * Pagina de una funcion que depende del pais de la organizacion. En Estados Unidos muestra un aviso en lugar de la
 * pagina; la API tambien la rechaza, asi que esto es solo la cara visible. Mientras carga la organizacion muestra la pagina.
 */
export default function FeatureGate({ feature, shell = 'manager', children }) {
  const { user } = useAuth();
  const { organization, loadOrganization } = useOrganization();
  const requested = user?.role === 'owner' ? new URLSearchParams(window.location.search).get('org_id') : null;
  const orgId = requested || user?.organization_id;

  useEffect(() => {
    if (orgId && organization?.organization_id !== orgId) loadOrganization(orgId);
  }, [orgId, organization?.organization_id, loadOrganization]);

  const loaded = !!orgId && organization?.organization_id === orgId;
  if (!loaded || featureEnabled(organization, feature)) return children;

  if (shell === 'staff') {
    return (
      <>
        <FeatureUnavailable feature={feature} organization={organization} home="/staff/appointments" />
        <StaffNav />
      </>
    );
  }
  return (
    <AdminShell organizationName={organization?.name} organizationId={orgId}>
      <FeatureUnavailable feature={feature} organization={organization} home={`/manager/dashboard${requested ? `?org_id=${requested}` : ''}`} />
    </AdminShell>
  );
}

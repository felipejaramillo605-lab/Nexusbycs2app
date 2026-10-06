import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganization } from '../context/OrganizationContext';
import { resolvePortalTheme } from '../portal-templates';
import { isLandingActive } from '../lib/portalLanding';
import BookingFlow from './BookingFlow';
import PortalLanding from './PortalLanding';

/**
 * Entrada publica /book/:orgId. Las plantillas con pagina de inicio (clases grupales) muestran primero la portada;
 * "Reservar" lleva al mismo flujo de siempre con ?reservar=1. Las demas plantillas siguen directo a la reserva.
 */
export default function BookEntry() {
  const { orgId } = useParams();
  const { organization, loadOrganization } = useOrganization();

  useEffect(() => { loadOrganization(orgId); }, [orgId, loadOrganization]);

  const ready = organization?.organization_id === orgId;
  const wantsBooking = new URLSearchParams(window.location.search).has('reservar');
  if (wantsBooking) return <BookingFlow />;
  if (!ready) return <div className="nexus-booking-deep" aria-busy="true" />;
  return isLandingActive(organization, resolvePortalTheme(organization, orgId)) ? <PortalLanding /> : <BookingFlow />;
}

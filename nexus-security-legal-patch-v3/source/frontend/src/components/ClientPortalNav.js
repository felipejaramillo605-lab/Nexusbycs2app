import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, User } from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';

/**
 * Persistent navigation bar for public client pages
 * Shows "Book Appointment" and "My Account" / "Sign In" buttons
 * Visible on BookingFlow, CustomerPortal, and CancelAppointment pages
 */
export default function ClientPortalNav({ orgId }) {
  const navigate = useNavigate();
  const { organization } = useOrganization();

  if (!orgId) return null;

  // Check if there's an active client session
  const hasSession = !!sessionStorage.getItem(`nexus_customer_phone_${orgId}`);
  // NEXUS_PORTAL_PERSONALIZATION_V1: show the manager's own branding instead of a generic label
  const brandName = organization?.organization_id === orgId ? (organization?.name || 'Nexus') : 'Nexus';
  const logoUrl = organization?.organization_id === orgId ? organization?.logo_url : null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-lg border-t border-white/10 md:top-0 md:bottom-auto md:border-t-0 md:border-b"
      style={{
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="hidden md:flex items-center gap-2 min-w-0">
            {logoUrl && (
              <img src={logoUrl} alt={brandName} className="h-7 w-7 rounded-md object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
            <span className="text-sm font-medium text-white truncate">{brandName}</span>
          </div>
          <div className="flex items-center justify-center gap-3 flex-1 md:flex-none">
            <button
              onClick={() => navigate(`/book/${orgId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--client-accent-primary,#7c3aed)] hover:opacity-90 text-white rounded-lg transition-all text-sm font-medium"
            >
              <Calendar size={16} />
              <span className="hidden sm:inline">Agendar cita</span>
              <span className="sm:hidden">Agendar</span>
            </button>

            <button
              onClick={() => navigate(`/portal/${orgId}/auth`)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg transition-all text-sm font-medium"
            >
              <User size={16} />
              <span className="hidden sm:inline">
                {hasSession ? 'Mi cuenta' : 'Iniciar sesión'}
              </span>
              <span className="sm:hidden">
                {hasSession ? 'Cuenta' : 'Entrar'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

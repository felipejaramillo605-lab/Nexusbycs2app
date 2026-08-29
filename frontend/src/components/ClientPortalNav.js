import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, User, ShoppingBag, ShoppingCart } from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useCart } from '../lib/cart';

/**
 * Persistent navigation bar for public client pages
 * Shows "Book Appointment" and "My Account" / "Sign In" buttons
 * Visible on BookingFlow, CustomerPortal, and CancelAppointment pages
 */
export default function ClientPortalNav({ orgId }) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  // NEXUS_PRODUCT_CATALOG_V11: cart badge, only meaningful once the org record for
  // this orgId has loaded — until then we don't know if catalog_enabled is true.
  const { count } = useCart(orgId);

  if (!orgId) return null;

  // Check if there's an active client session
  const hasSession = !!sessionStorage.getItem(`nexus_customer_phone_${orgId}`);
  // NEXUS_PORTAL_PERSONALIZATION_V1: show the manager's own branding instead of a generic label
  const brandName = organization?.organization_id === orgId ? (organization?.name || 'Nexus') : 'Nexus';
  const logoUrl = organization?.organization_id === orgId ? organization?.logo_url : null;
  const catalogEnabled = organization?.organization_id === orgId && !!organization?.catalog_enabled;

  // NEXUS_CLIENT_NAV_THEME_AWARE_V1: this bar used to be hardcoded to
  // bg-black/95 + text-white regardless of the organization's selected
  // client-portal theme, so a light theme (e.g. a light bgEnd) still got
  // a black nav bar. ClientPortalThemeWrapper (the parent) already scopes
  // --app-* vars to match the active theme, so use those here too, same
  // as the rest of the client-facing pages.
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg border-t border-[var(--app-border)] md:top-0 md:bottom-auto md:border-t-0 md:border-b"
      style={{
        background: 'var(--app-surface-elevated)',
        boxShadow: 'var(--app-shadow-md)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="hidden md:flex items-center gap-2 min-w-0">
            {logoUrl && (
              <img src={logoUrl} alt={brandName} className="h-7 w-7 rounded-md object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
            <span className="text-sm font-medium text-[var(--app-text-primary)] truncate">{brandName}</span>
          </div>
          <div className="flex items-center justify-center gap-3 flex-1 md:flex-none">
            {catalogEnabled && (
              <button
                onClick={() => navigate(`/portal/${orgId}/catalog`)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--app-surface-hover)] hover:bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-primary)] rounded-lg transition-all text-sm font-medium"
              >
                <ShoppingBag size={16} />
                <span className="hidden sm:inline">Catálogo</span>
                <span className="sm:hidden">Tienda</span>
              </button>
            )}

            {catalogEnabled && count > 0 && (
              <button
                onClick={() => navigate(`/portal/${orgId}/cart`)}
                className="relative flex items-center gap-2 px-3 py-2 bg-[var(--app-surface-hover)] hover:bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-primary)] rounded-lg transition-all text-sm font-medium"
                title="Ver carrito"
              >
                <ShoppingCart size={16} />
                <span className="absolute -top-1.5 -right-1.5 bg-[var(--app-primary)] text-[var(--app-on-primary)] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{count}</span>
              </button>
            )}

            <button
              onClick={() => navigate(`/book/${orgId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-on-primary)] rounded-lg transition-all text-sm font-medium"
            >
              <Calendar size={16} />
              <span className="hidden sm:inline">Agendar cita</span>
              <span className="sm:hidden">Agendar</span>
            </button>

            <button
              onClick={() => navigate(`/portal/${orgId}/auth`)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--app-surface-hover)] hover:bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-primary)] rounded-lg transition-all text-sm font-medium"
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

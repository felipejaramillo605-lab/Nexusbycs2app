import React, { useEffect } from 'react';
import { useClientPortalOrganizationTheme } from '../hooks/useClientPortalOrganizationTheme';
import OnboardingTour from './onboarding/OnboardingTour';
import PortalWhatsAppButton from './PortalWhatsAppButton';
import { usePortalT } from '../lib/portalI18n';
import '../portal-templates/landing.css';
import '../portal-templates/premium/barberia-real/barberia-real.css';
import '../portal-templates/premium/bloom/bloom.css';
import '../portal-templates/premium/ignition/ignition.css';
import '../portal-templates/premium/noir/noir.css';
import '../portal-templates/premium/obsidiana/obsidiana.css';
import '../portal-templates/premium/porcelana/porcelana.css';
import '../portal-templates/premium/voltaje/voltaje.css';
import '../portal-templates/premium/cadencia/cadencia.css';
import '../portal-templates/premium/aliento/aliento.css';
import '../portal-templates/standard/estudio.css';

export const ClientPortalThemeWrapper = ({ children }) => {
  const {
    wrapperRef,
    setBackgroundFailed,
    reduceMotion,
    activeTemplate,
    themeKey,
    themeVariables,
    backgroundType,
    backgroundUrl,
    backgroundOverlay,
    showBackground,
    handleMouseMove,
    organization,
    orgId,
  } = useClientPortalOrganizationTheme();
  const { lang } = usePortalT();
  // Idioma del documento para lectores de pantalla y traductores del navegador.
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = previous; };
  }, [lang]);

  return (
    <div
      ref={wrapperRef}
      className="nexus-client-theme"
      data-client-theme={themeKey}
      data-portal-template={activeTemplate?.key}
      data-reduced-motion={reduceMotion ? 'true' : 'false'}
      style={themeVariables}
      onMouseMove={handleMouseMove}
    >
      {showBackground && <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-[var(--app-background)]">
        {backgroundType === 'video' ? <video className="h-full w-full object-cover" src={backgroundUrl} autoPlay={!reduceMotion} muted loop={!reduceMotion} playsInline preload="metadata" onError={() => setBackgroundFailed(true)} /> : <img className="h-full w-full object-cover" src={backgroundUrl} alt="" onError={() => setBackgroundFailed(true)} />}
        <div className={`absolute inset-0 ${backgroundOverlay === 'dark' ? 'bg-black/65' : backgroundOverlay === 'light' ? 'bg-white/30' : ''}`} />
      </div>}
      <OnboardingTour role="client" />
      {children}
      <PortalWhatsAppButton organization={organization?.organization_id === orgId ? organization : null} />
    </div>
  );
};

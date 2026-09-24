import React from 'react';
import { useClientPortalOrganizationTheme } from '../hooks/useClientPortalOrganizationTheme';
import OnboardingTour from './onboarding/OnboardingTour';
import '../portal-templates/premium/barberia-real/barberia-real.css';
import '../portal-templates/premium/bloom/bloom.css';
import '../portal-templates/premium/ignition/ignition.css';
import '../portal-templates/premium/noir/noir.css';

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
  } = useClientPortalOrganizationTheme();

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
    </div>
  );
};

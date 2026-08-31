// NEXUS_PLATFORM_BRANDING_V1
// The Nexus PLATFORM's own logo -- global, owner-only. This changes the
// Nexus mark everywhere it appears app-wide: the browser tab's default
// favicon, the admin sidebar's fallback brand (when no tenant is
// selected), and the small "Con tecnología de Nexus" badge every
// tenant's public booking/portal page shows above their own store brand.
// It is completely separate from OrganizationLogoUpload.jsx, which is
// each TENANT's own store logo and only ever applies to that tenant.
import React from 'react';
import { platformAPI } from '../api';
import { usePlatformBranding } from '../context/PlatformBrandingContext';
import LogoUploadField from './LogoUploadField';

export default function PlatformLogoUpload() {
  const { platformLogoUrl, refreshPlatformBranding } = usePlatformBranding();

  const handleChange = async (newUrl) => {
    // The upload/delete endpoints already return the new value, but other
    // parts of the app (favicon, every tenant's public header) read this
    // through PlatformBrandingContext -- refresh it so they update without
    // needing a full page reload.
    await refreshPlatformBranding();
    void newUrl; // context refresh is the source of truth here, not the raw return value
  };

  return (
    <LogoUploadField
      value={platformLogoUrl || ''}
      onChange={handleChange}
      title="Logo de Nexus"
      description="El logo de la plataforma Nexus en sí -- distinto al logo de cada tienda. Aplica al ícono del navegador y a la marca 'Nexus' en toda la app, incluyendo el panel del owner y el encabezado de las páginas públicas de todas las organizaciones."
      removeConfirmMessage="¿Eliminar el logo de Nexus? Se volverá a mostrar la marca por defecto."
      successUploadMessage="Logo de Nexus actualizado en toda la app"
      successDeleteMessage="Logo de Nexus eliminado, volviendo a la marca por defecto"
      uploadFn={(file, onUploadProgress) => platformAPI.uploadLogo(file, onUploadProgress)}
      deleteFn={() => platformAPI.deleteLogo()}
    />
  );
}

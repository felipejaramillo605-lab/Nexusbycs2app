// NEXUS_ORGANIZATION_LOGO_UPLOAD_V3
// A TENANT's (barbershop/salon) own store logo -- only ever shown on that
// tenant's own pages (its admin sidebar, its booking/portal pages). See
// PlatformLogoUpload.jsx for the Nexus PLATFORM's own logo, which is a
// completely separate, global, owner-only concept -- the two must never
// be confused in a multi-tenant app.
import React from 'react';
import { organizationAPI } from '../api';
import LogoUploadField from './LogoUploadField';

export default function OrganizationLogoUpload({ organizationId, value, onChange, disabled = false }) {
  return (
    <LogoUploadField
      value={value}
      onChange={onChange}
      disabled={disabled}
      title="Logo de la organización"
      description="Se muestra en el dashboard y en las páginas públicas de reserva/portal de tu propio negocio."
      removeConfirmMessage="¿Eliminar el logo de la organización?"
      uploadFn={(file, onUploadProgress) => organizationAPI.uploadLogo(organizationId, file, onUploadProgress)}
      deleteFn={() => organizationAPI.deleteLogo(organizationId)}
    />
  );
}

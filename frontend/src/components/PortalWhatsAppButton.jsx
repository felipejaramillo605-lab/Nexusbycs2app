import React from 'react';
import { MessageCircle } from 'lucide-react';
import { whatsappHref } from '../lib/whatsapp';

/** Boton flotante: abre el WhatsApp que el manager configuro en el perfil del negocio. */
export default function PortalWhatsAppButton({ organization }) {
  if (!organization?.portal_whatsapp_button) return null;
  const href = whatsappHref(
    organization.whatsapp_link || organization.phone,
    `Hola ${organization.name || ''}, quisiera más información.`.replace(/\s+,/, ','),
  );
  if (!href) return null;
  return (
    <a
      className="nexus-whatsapp-fab"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribir por WhatsApp"
      data-testid="portal-whatsapp-button"
    >
      <MessageCircle size={26} strokeWidth={1.8} aria-hidden="true" />
    </a>
  );
}

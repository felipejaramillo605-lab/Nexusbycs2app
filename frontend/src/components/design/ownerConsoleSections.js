import { Building2, CreditCard, Home, LifeBuoy, Megaphone, ServerCog, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7): Owner's own navigation registry,
// separate from `adminSections` (Manager's operational menu). Only reused
// routes today -- Organizaciones/Cartera/Accesos point at the exact same
// page components as before, just at new canonical URLs (see
// ownerRouteRedirect.js for the old-URL compatibility redirects). Nothing
// under "IT y auditoría" beyond platform branding exists yet -- that section
// stays intentionally thin until PR 21-24 add real health/audit reads,
// rather than showing capabilities that don't exist.
export const ownerConsoleSections = [
  { label: 'Inicio', items: [['/owner', 'Inicio', Home]] },
  {
    label: 'Organizaciones',
    items: [
      ['/owner/organizations', 'Directorio', Building2],
      ['/owner/organizations/new', 'Nueva organización', UserPlus],
    ],
  },
  { label: 'Cartera y facturación', items: [['/owner/billing', 'Suscripciones y facturas', CreditCard]] },
  { label: 'Control de accesos', items: [['/owner/access', 'Control de accesos', ShieldCheck]] },
  {
    label: 'Comunicados y PQRS',
    items: [
      ['/owner/announcements', 'Comunicados', Megaphone],
      ['/owner/support', 'Bandeja de PQRS', LifeBuoy],
    ],
  },
  { label: 'IT y auditoría', items: [['/owner/platform-branding', 'Marca de Nexus', Sparkles]] },
];

// Mobile bottom bar per the approved IA: Inicio/Cartera/Accesos/IT visible,
// Organizaciones and Comunicados/PQRS live inside "Más" (the shared drawer).
export const ownerMobilePrimary = [
  ['/owner', 'Inicio', Home],
  ['/owner/billing', 'Cartera', CreditCard],
  ['/owner/access', 'Accesos', ShieldCheck],
  ['/owner/platform-branding', 'IT', ServerCog],
];

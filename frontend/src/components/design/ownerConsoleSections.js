import { Building2, CreditCard, Home, KeyRound, LifeBuoy, Megaphone, Receipt, ScrollText, ServerCog, ShieldAlert, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7): Owner's own navigation registry,
// separate from `adminSections` (Manager's operational menu). Only reused
// routes today -- Organizaciones/Cartera/Accesos point at the exact same
// page components as before, just at new canonical URLs (see
// ownerRouteRedirect.js for the old-URL compatibility redirects). "IT y
// auditoría" grew entitlement grants (PR 18), the unified audit log
// (PR 21/24), and security events (PR 22); PR 23 (health/integrity beyond
// the existing professional-media reconciliation) is still undecided in
// scope -- see the roadmap notes in the project vault.
export const ownerConsoleSections = [
  { label: 'Inicio', items: [['/owner', 'Inicio', Home]] },
  {
    label: 'Organizaciones',
    items: [
      ['/owner/organizations', 'Directorio', Building2],
      ['/owner/organizations/new', 'Nueva organización', UserPlus],
    ],
  },
  {
    label: 'Cartera y facturación',
    items: [
      ['/owner/billing', 'Suscripciones y facturas', CreditCard],
      ['/owner/billing/invoices', 'Facturas globales', Receipt],
    ],
  },
  { label: 'Control de accesos', items: [['/owner/access', 'Control de accesos', ShieldCheck]] },
  {
    label: 'Comunicados y PQRS',
    items: [
      ['/owner/announcements', 'Comunicados', Megaphone],
      ['/owner/support', 'Bandeja de PQRS', LifeBuoy],
    ],
  },
  {
    label: 'IT y auditoría',
    items: [
      ['/owner/platform-branding', 'Marca de Nexus', Sparkles],
      ['/owner/capability-grants', 'Administradores de entitlements', KeyRound],
      ['/owner/audit-log', 'Registro de auditoría', ScrollText],
      ['/owner/security-events', 'Eventos de seguridad', ShieldAlert],
    ],
  },
];

// Mobile bottom bar per the approved IA: Inicio/Cartera/Accesos/IT visible,
// Organizaciones and Comunicados/PQRS live inside "Más" (the shared drawer).
export const ownerMobilePrimary = [
  ['/owner', 'Inicio', Home],
  ['/owner/billing', 'Cartera', CreditCard],
  ['/owner/access', 'Accesos', ShieldCheck],
  ['/owner/platform-branding', 'IT', ServerCog],
];

import { Building2, CreditCard, Home, KeyRound, LifeBuoy, Megaphone, Receipt, ScrollText, ServerCog, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, UserPlus } from 'lucide-react';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7): Owner's own navigation registry,
// separate from `adminSections` (Manager's operational menu). Only reused
// routes today -- Organizaciones/Cartera/Accesos point at the exact same
// page components as before, just at new canonical URLs (see
// ownerRouteRedirect.js for the old-URL compatibility redirects). "IT y
// auditoría" now covers entitlement grants (PR 18), the unified audit log
// (PR 21/24), security events (PR 22), and the cross-domain integrity
// report (PR 23) -- the full PR 21-24 batch this section was left thin for
// is complete.
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
      ['/owner/integrity-report', 'Reporte de integridad', ShieldQuestion],
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

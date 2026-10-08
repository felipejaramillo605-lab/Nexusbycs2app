import { Banknote, BriefcaseBusiness, CalendarOff, HeartHandshake, Building2, BookOpen, ContactRound, CalendarDays, ChartNoAxesCombined, CreditCard, Gauge, LifeBuoy, LayoutDashboard, Megaphone, Package, Scissors, ShieldCheck, ShoppingBag, ShoppingCart, Settings, Sparkles, Store, Users } from 'lucide-react';
import { getBusinessProfile } from '../../lib/businessProfiles';
import { featureEnabled, featureForPath } from '../../lib/countryProfile';

export const adminSections=[{label:'Operación',items:[['/manager/dashboard','Inicio',LayoutDashboard],['/manager/appointments','Agenda',CalendarDays],['/manager/clients','Clientes',Users],['/manager/services','Servicios',Scissors],['/manager/barbers','Equipo',BriefcaseBusiness],['/manager/hr','Ausencias',CalendarOff],['/manager/wellbeing','Bienestar',HeartHandshake],['/manager/catalog','Catálogo',ShoppingBag],['/manager/capacity','Capacidad',Gauge]]},{label:'Finanzas',items:[['/manager/revenue','Ingresos',ChartNoAxesCombined],['/manager/settlements','Liquidaciones',CreditCard],['/manager/payroll','Nómina',Banknote],['/manager/inventory','Inventario',Package]]},{label:'Abastecimiento',items:[['/manager/suppliers','Proveedores',Store],['/manager/purchase-orders','Órdenes de compra',ShoppingCart]]},{label:'Crecimiento',items:[['/manager/marketing','Marketing',Megaphone],['/manager/nexus-ai','Nexus AI',Sparkles]/* NEXUS_AI_V1 */,['/manager/business-profile','Perfil del negocio',Building2]]},{label:'Administración',items:[
            // NEXUS_OWNER_CONSOLE_SHELL_V1: canonical paths -- these items only
            // ever render for an owner operating a tenant (AdminShell swaps to
            // ownerConsoleSections for the platform console itself), as quick
            // shortcuts back to the console sections without losing tenant context.
            ['/owner/access','Control de accesos',ShieldCheck,'owner'],['/owner/billing','Suscripciones',CreditCard,'owner'],['/owner/platform-branding','Marca de Nexus',Sparkles,'owner']/* NEXUS_PLATFORM_BRANDING_V1 */,['/owner/organizations','Matriz de terceros',ContactRound,'owner'],
            ['/owner/announcements','Comunicados',Megaphone,'owner'],['/owner/support','Bandeja de PQRS',LifeBuoy,'owner'],['/manager/support','Soporte (PQRS)',LifeBuoy],['/manager/settings','Configuración',Settings]]},/* NEXUS_GUIDE_V9 */{label:'Ayuda',items:[['/manager/guia','Guía',BookOpen]]}/* NEXUS_GUIDE_V9 end */];

/** Quita las entradas de funciones no disponibles para el pais de la organizacion (y las secciones que quedan vacias). */
export const filterSectionsByCountry = (sections, organization) => sections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => { const feature = featureForPath(item[0]); return !feature || featureEnabled(organization, feature); }),
  }))
  .filter((section) => section.items.length > 0);

export const getAdminSections = (businessType) => {
  const ServiceIcon = getBusinessProfile(businessType).serviceIcon;
  return adminSections.map((section) => ({
    ...section,
    items: section.items.map((item) => item[0] === '/manager/services' ? [item[0], item[1], ServiceIcon, item[3]] : item),
  }));
};

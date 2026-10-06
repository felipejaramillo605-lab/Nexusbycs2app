import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';
import { usePlatformBranding } from '../../context/PlatformBrandingContext';
import { AdminShell } from './AdminShell';
import { resolvePremiumPortalTemplate } from '../../portal-templates';
import { StaffNav } from './StaffNav';
import { ConfirmDialogHost } from './ConfirmDialogHost';
import { ViewModeBanner } from './ViewModeBanner';
import OnboardingTour from '../onboarding/OnboardingTour';/* NEXUS_GUIDE_V9 */
const routeNames={'/owner':'Owner — Nexus'/* NEXUS_OWNER_CONSOLE_SHELL_V1 */,'/owner/organizations':'Organizaciones','/owner/billing':'Cartera y facturación','/owner/billing/invoices':'Facturas globales','/owner/capability-grants':'Permisos y capacidades','/owner/audit-log':'Auditoría','/owner/security-events':'Eventos de seguridad','/owner/integrity-report':'Informe de integridad','/owner/access':'Control de accesos','/owner/access-control':'Control de accesos','/owner/platform-branding':'Marca de Nexus'/* NEXUS_PLATFORM_BRANDING_V1 */,'/owner/third-party-matrix':'Matriz de terceros','/owner/organizations/new':'Nueva organización','/owner/announcements':'Comunicados','/owner/support':'Bandeja de PQRS','/manager/organizations/new':'Nueva organización','/manager/nexus-ai':'Nexus AI','/manager/appointments':'Agenda','/manager/clients':'Clientes','/manager/services':'Servicios','/manager/services/classes':'Clases','/manager/classes':'Clases','/manager/barbers':'Equipo','/manager/barbers/:barberId/metrics':'Métricas del profesional','/manager/capacity':'Capacidad y demanda','/manager/payroll':'Nómina','/manager/hr':'Equipo y ausencias','/manager/wellbeing':'Bienestar y cultura','/staff/bienestar':'Bienestar','/staff/autogestion':'Autogestión','/manager/purchase-orders':'Órdenes de compra','/manager/suppliers':'Proveedores','/manager/revenue':'Ingresos','/manager/settlements':'Liquidaciones','/manager/inventory':'Inventario','/manager/catalog':'Catálogo','/manager/marketing':'Marketing','/manager/support':'Soporte','/manager/billing':'Facturación','/manager/business-profile':'Perfil del negocio','/manager/fiscal-profile':'Información fiscal','/manager/settings':'Configuración','/manager/dashboard':'Nexus',/* NEXUS_GUIDE_V9 */'/manager/guia':'Guía','/owner/guia':'Guía del Owner'/* NEXUS_GUIDE_V9 end */};
const routeName=path=>routeNames[path]||(/^\/manager\/barbers\/[^/]+\/metrics$/.test(path)?'Métricas del profesional':'Nexus');
export function RouteExperienceFrame({children}){const location=useLocation();const [sp]=useSearchParams();const {user}=useAuth();const admin=location.pathname.startsWith('/manager/')||location.pathname.startsWith('/owner/');const staff=location.pathname.startsWith('/staff/');const booking=location.pathname.startsWith('/book/');const portal=location.pathname.startsWith('/portal/');
 // NEXUS_ORG_BRANDING_EVERYWHERE_V1: this header used to hardcode a "N" /
 // "Nexus" badge for every organization's booking/portal pages -- the
 // owner's uploaded logo (organization_media.py) never reached it, only
 // ClientPortalNav read it. RouteExperienceFrame sits above
 // ClientPortalThemeWrapper (which does the actual fetch for this orgId),
 // but both read the same OrganizationContext instance, so this re-renders
 // once that fetch resolves without needing its own fetch call here.
 const {organization,loadOrganization}=useOrganization();
 const managedOrganizationId=admin?(user?.role==='owner'?sp.get('org_id'):user?.organization_id):null;
 useEffect(()=>{if(managedOrganizationId)loadOrganization(managedOrganizationId)},[loadOrganization,managedOrganizationId]);
 const publicOrgId=(booking||portal)?location.pathname.split('/')[2]:null;const activePublicPortalTemplate=resolvePremiumPortalTemplate(organization,publicOrgId)?.key;
 const publicOrgMatches=organization?.organization_id===publicOrgId;
 const publicLogoUrl=publicOrgMatches?organization?.logo_url:null;
 const publicBrandName=publicOrgMatches?(organization?.name||'Nexus'):'Nexus';
 // NEXUS_PLATFORM_BRANDING_V1: the public header shows BOTH marks now --
 // Nexus (small, "powered by") because Nexus is the software provider,
 // and the tenant's own logo/name (large, prominent) because the tenant
 // is who's actually rendering the service. Deliberately two distinct
 // rows instead of one shared slot, per explicit product requirement:
 // they must never visually merge/overlap into one badge.
 const {platformLogoUrl}=usePlatformBranding();
 // NEXUS_ADMIN_GLASS_MOUSE_GLOW_V1: same technique as AdminShell.jsx, for
 // the staff experience (staff pages don't go through AdminShell).
 const reduced=useReducedMotion();
 const staffRef=useRef(null);
 const handleStaffMouseMove=useCallback(e=>{if(reduced)return;const el=staffRef.current;if(!el)return;const rect=el.getBoundingClientRect();el.style.setProperty('--mouse-x',`${e.clientX-rect.left}px`);el.style.setProperty('--mouse-y',`${e.clientY-rect.top}px`);el.style.setProperty('--mouse-active','1')},[reduced]);
 if(admin){const routeClass='nexus-route-'+location.pathname.replace(/^\//,'').replaceAll('/','-');const pageName=routeName(location.pathname);const organizationName=managedOrganizationId&&organization?.organization_id===managedOrganizationId?(organization.name||pageName):pageName;return <>{user?.role==='owner'&&<ViewModeBanner/>}<AdminShell organizationName={organizationName} organizationId={managedOrganizationId}><div className={`nexus-admin-route ${routeClass}`}>{children}</div></AdminShell><ConfirmDialogHost/></>}if(staff)return <><div ref={staffRef} onMouseMove={handleStaffMouseMove} className="nexus-staff-experience"><StaffNav/><main className="nexus-staff-content">{children}</main></div>{/* NEXUS_GUIDE_V9 */}<OnboardingTour role="staff"/><ConfirmDialogHost/></>;if(booking||portal){const kind=booking?'booking':'portal';return <><div className={`nexus-public-experience nexus-public-${kind}`} data-portal-template={activePublicPortalTemplate}><div className="nexus-public-orb nexus-public-orb-one"/><div className="nexus-public-orb nexus-public-orb-two"/><header className="nexus-public-brand"><div className="nexus-public-brand-provider">{platformLogoUrl?<img src={platformLogoUrl} alt="Nexus" className="nexus-public-brand-provider-logo" onError={e=>{e.currentTarget.style.display='none'}}/>:<span className="nexus-public-brand-provider-badge">N</span>}<small>Con tecnología de Nexus</small></div><div className="nexus-public-brand-tenant">{publicLogoUrl?<img src={publicLogoUrl} alt={publicBrandName} className="nexus-public-brand-tenant-logo" onError={e=>{e.currentTarget.style.display='none'}}/>:<span className="nexus-public-brand-tenant-badge">{publicBrandName.charAt(0).toUpperCase()}</span>}<div><strong>{publicBrandName}</strong><small>{booking?'Reserva en línea':'Portal del cliente'}</small></div></div></header><div className="nexus-public-content">{children}</div><footer className="nexus-public-footer">Reserva y administra tus citas de forma segura</footer></div><ConfirmDialogHost/></>}return <>{children}<ConfirmDialogHost/></>}

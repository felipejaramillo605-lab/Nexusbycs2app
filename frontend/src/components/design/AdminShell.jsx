import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, Building2, BadgeInfo, BookOpen /* NEXUS_GUIDE_V9 */, ContactRound, CalendarDays, ChartNoAxesCombined, ChevronRight, CreditCard, FileText, LayoutDashboard, LogOut, Megaphone, Menu, Package, Scissors, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store, Trash2, Users, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';
import { usePlatformBranding } from '../../context/PlatformBrandingContext';
import ThemeToggle from '../ThemeToggle';
import NotificationBellEnhanced from '../NotificationBellEnhanced';
import { useAccessibleDialog } from './useAccessibleDialog';
import OnboardingTour from '../onboarding/OnboardingTour';
const ShellContext=createContext(false);
const sections=[{label:'Operación',items:[['/manager/dashboard','Inicio',LayoutDashboard],['/manager/appointments','Agenda',CalendarDays],['/manager/clients','Clientes',Users],['/manager/services','Servicios',Scissors],['/manager/barbers','Equipo',BriefcaseBusiness],['/manager/catalog','Catálogo',ShoppingBag]]},{label:'Finanzas',items:[['/manager/revenue','Ingresos',ChartNoAxesCombined],['/manager/billing','Mis facturas',FileText],['/manager/settlements','Liquidaciones',CreditCard],['/manager/inventory','Inventario',Package]]},{label:'Abastecimiento',items:[['/manager/suppliers','Proveedores',Store],['/manager/purchase-orders','Órdenes de compra',ShoppingCart]]},{label:'Crecimiento',items:[['/manager/marketing','Marketing',Megaphone],['/manager/business-profile','Perfil del negocio',Building2]]},{label:'Administración',items:[['/owner/access-control','Control de accesos',ShieldCheck,'owner'],['/owner/subscriptions','Suscripciones',CreditCard,'owner'],['/owner/platform-branding','Marca de Nexus',Sparkles,'owner']/* NEXUS_PLATFORM_BRANDING_V1 */,['/owner/third-party-matrix','Matriz de terceros',ContactRound,'owner'],
            ['/owner/announcements','Comunicados',Megaphone,'owner'],['/manager/fiscal-profile','Información fiscal',BadgeInfo],['/manager/settings','Configuración',Settings],['/account/privacy','Cuenta y privacidad',ShieldCheck]]},/* NEXUS_GUIDE_V9 */{label:'Ayuda',items:[['/manager/guia','Guía',BookOpen]]}/* NEXUS_GUIDE_V9 end */];
const mobilePrimary=[['/manager/dashboard','Inicio',LayoutDashboard],['/manager/appointments','Agenda',CalendarDays],['/manager/clients','Clientes',Users],['/manager/revenue','Ingresos',ChartNoAxesCombined]];
export function AdminShell({children,organizationName='Nexus',organizationId,actions}){const nested=useContext(ShellContext);const {user,logout}=useAuth();const navigate=useNavigate();const location=useLocation();const [sp]=useSearchParams();const [open,setOpen]=useState(false);const reduced=useReducedMotion();const closeModules=React.useCallback(()=>setOpen(false),[]);const {dialogRef:modulesDialogRef,triggerRef:modulesTriggerRef,titleId:modulesTitleId}=useAccessibleDialog({open,onClose:closeModules,titlePrefix:'nexus-modules'});const allowed=useMemo(()=>sections.map(section=>({...section,items:section.items.filter(item=>!item[3]||item[3]===user?.role)})),[user?.role]);
 // NEXUS_ORG_BRANDING_EVERYWHERE_V1: the sidebar "N"/"Nexus" badge used to
 // be fully hardcoded regardless of the org's own uploaded logo -- the
 // owner's logo upload (Settings > General) never reached this shell.
 // Resolve the effective org id the same way the nav-link hrefs below
 // already do, and fetch it through the shared OrganizationContext (same
 // public endpoint Settings.js and ClientPortalThemeWrapper use).
 const org=user?.role==='owner'?(organizationId||sp.get('org_id')||user?.organization_id):user?.organization_id;
 // NEXUS_OWNER_BRAND_SCOPE_FIX_V1: an "owner" account supervises every
 // tenant organization -- it isn't itself one. `org` above falls back to
 // user.organization_id (a bookkeeping field on the owner's own user
 // record, not a real tenant) so nav-link hrefs still have *something* to
 // append as ?org_id= even with nothing selected. Using that same
 // fallback for BRANDING meant the sidebar showed that placeholder
 // record's own name/logo ("Owner") on every generic /owner/* screen,
 // as if the owner account were a tenant. Branding should only reflect a
 // real organization once the owner has actually navigated into managing
 // one (organizationId prop or ?org_id= present) -- otherwise it's the
 // platform's own "Nexus" identity, same as before this feature existed.
 const brandOrgId=user?.role==='owner'?(organizationId||sp.get('org_id')||null):org;
 const {organization,loadOrganization}=useOrganization();
 useEffect(()=>{if(brandOrgId)loadOrganization(brandOrgId)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[brandOrgId]);
 const orgMatches=!!brandOrgId&&organization?.organization_id===brandOrgId;
 // NEXUS_PLATFORM_BRANDING_V1: when the owner isn't inside a specific
 // tenant's management view, the sidebar should show the Nexus PLATFORM's
 // own logo (owner-controlled, see PlatformBrandingContext) instead of the
 // static "N" bubble -- the tenant's own store logo only applies while
 // actually managing that tenant.
 const {platformLogoUrl}=usePlatformBranding();
 const sidebarLogoUrl=orgMatches?organization?.logo_url:platformLogoUrl;
 const sidebarBrandName=orgMatches?(organization?.name||'Nexus'):'Nexus';
 // NEXUS_ADMIN_GLASS_MOUSE_GLOW_V1: same mouse-tracking-glow technique
 // ClientPortalThemeWrapper uses for the client portal (v13.1), applied here
 // so every owner/manager screen gets it too -- reads --app-primary-soft,
 // already themed correctly for both light and dark (see index.css).
 // Written directly on the DOM node (not React state) to avoid a re-render
 // on every mousemove frame.
 const shellRef=useRef(null);
 const handleMouseMove=useCallback(e=>{if(reduced)return;const el=shellRef.current;if(!el)return;const rect=el.getBoundingClientRect();el.style.setProperty('--mouse-x',`${e.clientX-rect.left}px`);el.style.setProperty('--mouse-y',`${e.clientY-rect.top}px`);el.style.setProperty('--mouse-active','1')},[reduced]);
 if(nested)return children;const href=path=>path.startsWith('/owner/')||path.startsWith('/account/')||!org?path:`${path}?org_id=${org}`;const linkClass=path=>location.pathname.startsWith(path)?'is-active':'';const signOut=async()=>{await logout();navigate('/login',{replace:true})};return <ShellContext.Provider value={true}><OnboardingTour role={user?.role}/><div ref={shellRef} onMouseMove={handleMouseMove} className="nexus-admin-shell nexus-admin-shell-complete"><aside className="nexus-sidebar"><div className="nexus-brand">{sidebarLogoUrl?<img src={sidebarLogoUrl} alt={sidebarBrandName} className="nexus-brand-logo" onError={e=>{e.currentTarget.style.display='none'}}/>:<span>N</span>}<div><strong>{sidebarBrandName}</strong><small>Business OS</small></div></div><nav>{allowed.map(section=><section key={section.label}><p>{section.label}</p>{section.items.map(([path,label,Icon])=><NavLink key={path} to={href(path)} className={linkClass(path)}><Icon size={18}/><span>{label}</span>{location.pathname.startsWith(path)&&<motion.i layoutId="sidebar-active"/>}</NavLink>)}</section>)}</nav><div className="nexus-sidebar-account"><NavLink to="/account/privacy"><ShieldCheck size={18}/><span>Cuenta</span></NavLink><button onClick={signOut}><LogOut size={18}/><span>Cerrar sesión</span></button></div></aside><div className="nexus-shell-main"><header className="nexus-topbar"><div><small>Organización</small><strong>{organizationName}</strong></div><div className="nexus-topbar-actions"><button ref={modulesTriggerRef} className="nexus-modules-button" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Menu size={18}/><span>Todos los módulos</span></button>{actions}<NotificationBellEnhanced/><button className="nexus-icon-button" onClick={signOut} title="Cerrar sesión"><LogOut size={18}/></button><ThemeToggle compact/></div></header><main>{children}</main></div><nav className="nexus-mobile-admin-nav">{mobilePrimary.map(([path,label,Icon])=><NavLink key={path} to={href(path)} className={linkClass(path)}><Icon size={19}/><span>{label}</span></NavLink>)}<button onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Menu size={19}/><span>Más</span></button></nav><AnimatePresence>{open&&<><motion.button aria-label="Cerrar módulos" className="nexus-modules-overlay" onClick={closeModules} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/><motion.aside ref={modulesDialogRef} className="nexus-modules-drawer" role="dialog" aria-modal="true" aria-labelledby={modulesTitleId} tabIndex={-1} initial={reduced?false:{x:'100%'}} animate={{x:0}} exit={reduced?undefined:{x:'100%'}} transition={{type:'spring',stiffness:390,damping:38}}><header><div><small>Navegación</small><h2 id={modulesTitleId}>Todos los módulos</h2></div><button type="button" className="nexus-icon-button" onClick={closeModules} aria-label="Cerrar módulos"><X size={18}/></button></header><div>{allowed.map(section=><section key={section.label}><p>{section.label}</p>{section.items.map(([path,label,Icon])=><NavLink key={path} to={href(path)} onClick={closeModules}><span><Icon size={19}/></span><strong>{label}</strong><ChevronRight size={17}/></NavLink>)}</section>)}<section><p>Sesión</p><button className="nexus-drawer-logout" onClick={signOut}><span><LogOut size={19}/></span><strong>Cerrar sesión</strong><ChevronRight size={17}/></button></section></div></motion.aside></>}</AnimatePresence></div></ShellContext.Provider>}

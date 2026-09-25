/* NEXUS_7I_V3_MANUAL_ORGANIZATION_BLOCK */
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CreditCard,FileText,History,RefreshCw,ShieldCheck,WalletCards} from 'lucide-react';
import {toast} from 'sonner';
import {billingAPI,deliveryOperationsAPI,organizationAPI,subscriptionAPI,supportAPI} from '../api';
import {ActionButton,AdminShell,FieldGuide,LoadingState,MetricCard,MotionPage,PageHeader,SurfaceCard} from '../components/design';
import OwnerPremiumPlanPanel from '../components/OwnerPremiumPlanPanel';
import AccessControlCard from '../components/owner/AccessControlCard';
import AnnouncementsCard from '../components/owner/AnnouncementsCard';
import AuditLogCard from '../components/owner/AuditLogCard';
import BackfillCard from '../components/owner/BackfillCard';
import BillingProfileCard from '../components/owner/BillingProfileCard';
import DeliveryMonitoringCard from '../components/owner/DeliveryMonitoringCard';
import InvoicesTableCard from '../components/owner/InvoicesTableCard';
import OperationalHealthCard from '../components/owner/OperationalHealthCard';
import PendingManagersCard from '../components/owner/PendingManagersCard';
import PqrsCard from '../components/owner/PqrsCard';
import SellerProfileCard from '../components/owner/SellerProfileCard';
import SubscriptionConfigCard from '../components/owner/SubscriptionConfigCard';
import {formatCOPMinor as money} from '../lib/currency';

const statuses={trial:'Prueba',active:'Activa',grace_period:'Periodo de gracia',past_due:'Vencida',suspended:'Suspendida',cancelled:'Cancelada',indefinite_block:'Bloqueo indefinido'};
const detail=(error,fallback)=>error.response?.data?.detail||fallback;

export default function OwnerSubscriptions(){
 const navigate=useNavigate();
 const [orgs,setOrgs]=useState([]),[orgId,setOrgId]=useState(''),[subscription,setSubscription]=useState(null),[invoices,setInvoices]=useState([]),[audit,setAudit]=useState([]),[loading,setLoading]=useState(true);
 const [announcements,setAnnouncements]=useState([]),[tickets,setTickets]=useState([]);
 const [deliveries,setDeliveries]=useState([]);
 const selected=useMemo(()=>orgs.find(x=>x.organization_id===orgId),[orgs,orgId]);
 const load=useCallback(async(id)=>{if(!id)return;setLoading(true);try{const [s,i,a]=await Promise.all([subscriptionAPI.get(id).catch(e=>e.response?.status===200?e:({data:null})),subscriptionAPI.getInvoices(id),subscriptionAPI.getAudit(id,{limit:100})]);setSubscription(s.data);setInvoices(i.data||[]);setAudit(a.data||[]);const d=await deliveryOperationsAPI.getDeliveries({organization_id:id,limit:100});setDeliveries(d.data||[]);}catch(e){toast.error(detail(e,'No fue posible cargar las suscripciones'))}finally{setLoading(false)}
  try{const [notif,supp]=await Promise.all([billingAPI.getNotifications({organization_id:id,limit:50}),supportAPI.ownerList({organization_id:id,page_size:50})]);const notifRows=notif.data?.notifications||notif.data||[];setAnnouncements(notifRows.filter(n=>n.event_type==='owner_announcement'));setTickets(supp.data?.items||supp.data?.conversations||supp.data||[]);}catch(e){/* secondary panels: fail quietly, primary subscription data above already loaded */}},[]);
 useEffect(()=>{organizationAPI.getAll().then(r=>{const rows=r.data||[];setOrgs(rows);if(rows[0])setOrgId(rows[0].organization_id)}).catch(e=>toast.error(detail(e,'No fue posible cargar organizaciones')))},[]);
 useEffect(()=>{if(orgId)load(orgId)},[orgId,load]);
 const pending=invoices.filter(x=>['draft','issued','pending','overdue'].includes(x.status));
 return <AdminShell organizationName={selected?.name||'Nexus'} organizationId={orgId}><MotionPage><PageHeader eyebrow="Owner" title="Suscripciones" description="Administra planes, facturación mensual y pagos manuales por organización." actions={<><ActionButton icon={RefreshCw} onClick={()=>load(orgId)}>Actualizar</ActionButton><ActionButton variant="secondary" icon={ShieldCheck} onClick={()=>navigate('/owner/access-control')}>Ir a Control de accesos</ActionButton></>}/>
 <SurfaceCard><label><FieldGuide label="Organización" hint="Selecciona el tenant que deseas administrar." required/><select value={orgId} onChange={e=>setOrgId(e.target.value)}>{orgs.map(o=><option key={o.organization_id} value={o.organization_id}>{o.name}</option>)}</select></label></SurfaceCard>
 {loading?<LoadingState label="Cargando suscripción"/>:<><div className="nexus-metric-grid"><MetricCard label="Estado" value={statuses[subscription?.status]||'Sin configurar'} icon={CreditCard}/><MetricCard label="Valor mensual" value={subscription?money(subscription.monthly_amount_minor,subscription.currency):'$ 0'} icon={WalletCards}/><MetricCard label="Facturas pendientes" value={pending.length} icon={FileText}/><MetricCard label="Eventos de auditoría" value={audit.length} icon={History}/></div>
 <SubscriptionConfigCard subscription={subscription} organizationId={orgId} onReload={()=>load(orgId)}/>
 <div className="nexus-subscription-grid"><OwnerPremiumPlanPanel organizationId={orgId} organizationName={selected?.name} invoices={invoices} reload={()=>load(orgId)} onSelectOrganization={setOrgId}/>
 <PendingManagersCard/></div>
 <div className="nexus-subscription-grid"><AnnouncementsCard announcements={announcements} organizationName={selected?.name}/>
 <PqrsCard tickets={tickets} organizationName={selected?.name}/></div>
 <AccessControlCard subscription={subscription} pending={pending} organizationId={orgId} organizationName={selected?.name} onReload={()=>load(orgId)}/>
 <InvoicesTableCard invoices={invoices} organizationId={orgId} organizationName={selected?.name} onReload={()=>load(orgId)}/>
 <div className="nexus-subscription-grid"><SellerProfileCard/><OperationalHealthCard/></div>
 <div className="nexus-subscription-grid"><BillingProfileCard organizationId={orgId}/><BackfillCard organizationId={orgId} onReload={()=>load(orgId)}/></div><DeliveryMonitoringCard deliveries={deliveries} onReload={()=>load(orgId)}/><AuditLogCard audit={audit}/></>}</MotionPage></AdminShell>;
}

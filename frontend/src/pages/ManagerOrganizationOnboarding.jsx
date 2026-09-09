/* NEXUS_SELF_SERVICE_MANAGER_ONBOARDING_V1 */
import React,{useMemo,useState} from 'react';
import {ArrowLeft,Building2,CheckCircle2,Save,ShieldCheck} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {organizationAPI} from '../api';
import {useAuth} from '../context/AuthContext';
import {ActionButton,FieldGuide,MotionPage,PageHeader,SurfaceCard} from '../components/design';

const initial={name:'',address:'',phone:'',whatsapp_link:'',business_hours:'',reason:'Autoregistro de organización tras aprobación del Owner',fiscal_profile:{billing_email:'',billing_contact_name:'',billing_contact_phone:'',person_type:'',commercial_name:'',legal_name:'',document_type:'',tax_id:'',verification_digit:'',tax_responsibility:'',tax_regime:'',country:'Colombia',department:'',city:'',address:'',postal_code:'',fiscal_notes:'',cc_emails:[],copy_primary_manager:true,email_enabled:true}};
const required=[['name','Nombre de la organización'],['fiscal_profile.legal_name','Razón social'],['fiscal_profile.document_type','Tipo de documento'],['fiscal_profile.tax_id','Número de identificación'],['fiscal_profile.billing_email','Correo de facturación'],['fiscal_profile.billing_contact_name','Contacto de facturación'],['fiscal_profile.city','Ciudad'],['fiscal_profile.address','Dirección fiscal'],['reason','Motivo del alta']];
const detail=(e,fallback)=>{const d=e?.response?.data?.detail;if(typeof d==='string')return d;if(d?.missing_required_fields?.length)return `${d.message||fallback}: ${d.missing_required_fields.join(', ')}`;if(d?.message)return d.message;return fallback};
const isValidEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);

export default function ManagerOrganizationOnboarding(){
 const navigate=useNavigate();const {user,checkAuth}=useAuth();
 const [form,setForm]=useState(initial),[saving,setSaving]=useState(false),[review,setReview]=useState(false);
 const set=(key,value)=>setForm(v=>({...v,[key]:value}));const setFiscal=(key,value)=>setForm(v=>({...v,fiscal_profile:{...v.fiscal_profile,[key]:value}}));
 const missing=useMemo(()=>required.filter(([path])=>!String(get(form,path)||'').trim()).map(([,label])=>label),[form]);
 const submit=async()=>{
  if(missing.length)return toast.error(`Completa: ${missing.join(', ')}`);
  if(!isValidEmail(form.fiscal_profile.billing_email))return toast.error('Ingresa un correo de facturación válido');
  setSaving(true);
  try{
   const fiscalProfilePayload={...form.fiscal_profile,billing_email:form.fiscal_profile.billing_email.trim(),billing_contact_name:form.fiscal_profile.billing_contact_name.trim(),billing_contact_phone:form.fiscal_profile.billing_contact_phone?.trim()||null,commercial_name:form.fiscal_profile.commercial_name?.trim()||null,legal_name:form.fiscal_profile.legal_name.trim(),tax_id:form.fiscal_profile.tax_id.trim(),city:form.fiscal_profile.city.trim(),address:form.fiscal_profile.address.trim(),cc_emails:[]};
   const payload={name:form.name.trim(),manager_user_id:user?.user_id,reason:form.reason.trim(),address:form.address.trim()||null,phone:form.phone.trim()||null,whatsapp_link:form.whatsapp_link.trim()||null,business_hours:form.business_hours.trim()||null,fiscal_profile:fiscalProfilePayload};
   await organizationAPI.create(payload);
   toast.success('Tu organización fue creada correctamente');
   await checkAuth();
   navigate('/manager/dashboard');
  }catch(e){toast.error(detail(e,'No fue posible crear la organización'))}
  finally{setSaving(false)}
 };
 return <MotionPage className="nexus-owner-page space-y-6">
  <PageHeader eyebrow="Configuración inicial" title="Crea tu organización" description="Tu cuenta ya fue aprobada. Completa estos datos para empezar a usar Nexus — no necesitas esperar a que el Owner la cree por ti." actions={<ActionButton variant="secondary" icon={ArrowLeft} onClick={()=>navigate('/manager/dashboard')}>Volver</ActionButton>}/>
  <SurfaceCard><div className="flex items-start gap-3"><Building2 className="text-[var(--app-primary)]"/><div><strong>{user?.name}</strong><p className="mt-1 text-sm text-[var(--app-text-secondary)]">{user?.email} · esta organización quedará vinculada a tu cuenta automáticamente.</p></div></div></SurfaceCard>
  <SurfaceCard><form className="nexus-guided-form" onSubmit={e=>{e.preventDefault();setReview(true)}}>
   <div className="nexus-field-wide"><h2 className="text-xl">1. Tu organización</h2></div>
   <label><FieldGuide label="Nombre de la organización" hint="Nombre visible en Nexus." example="Barbería Central" required/><input data-testid="onboarding-org-name" value={form.name} onChange={e=>set('name',e.target.value)} maxLength={180} required/></label>
   <label><FieldGuide label="Teléfono comercial" hint="Incluye indicativo de país." example="+57 300 123 4567" optional/><input data-testid="onboarding-org-phone" value={form.phone} onChange={e=>set('phone',e.target.value)} maxLength={40}/></label>
   <label><FieldGuide label="Enlace de WhatsApp" example="https://wa.me/573001234567" optional/><input data-testid="onboarding-org-whatsapp" value={form.whatsapp_link} onChange={e=>set('whatsapp_link',e.target.value)} maxLength={500}/></label>
   <div className="nexus-field-wide"><h2 className="text-xl mt-4">2. Información fiscal obligatoria</h2><p className="text-sm text-[var(--app-text-secondary)]">Estos datos habilitan la emisión futura de facturas. No se crea ninguna factura durante el alta.</p></div>
   <label><FieldGuide label="Razón social" example="Barbería Central SAS" required/><input data-testid="onboarding-legal-name" value={form.fiscal_profile.legal_name} onChange={e=>setFiscal('legal_name',e.target.value)} maxLength={180} required/></label>
   <label><FieldGuide label="Nombre comercial" example="Barbería Central" optional/><input data-testid="onboarding-commercial-name" value={form.fiscal_profile.commercial_name} onChange={e=>setFiscal('commercial_name',e.target.value)} maxLength={180}/></label>
   <label><FieldGuide label="Tipo de documento" example="NIT" required/><select data-testid="onboarding-document-type" value={form.fiscal_profile.document_type} onChange={e=>setFiscal('document_type',e.target.value)} required><option value="">Seleccionar</option><option value="NIT">NIT</option><option value="CC">Cédula de ciudadanía</option><option value="CE">Cédula de extranjería</option><option value="PASSPORT">Pasaporte</option><option value="OTHER">Otro</option></select></label>
   <label><FieldGuide label="Número de identificación" example="900123456" required/><input data-testid="onboarding-tax-id" value={form.fiscal_profile.tax_id} onChange={e=>setFiscal('tax_id',e.target.value)} maxLength={80} required/></label>
   <label><FieldGuide label="Correo de facturación" hint="Recibirá comunicaciones de cobro cuando se habiliten." example="facturacion@empresa.com" required/><input data-testid="onboarding-billing-email" type="email" value={form.fiscal_profile.billing_email} onChange={e=>setFiscal('billing_email',e.target.value)} required/></label>
   <label><FieldGuide label="Contacto de facturación" example="Laura Gómez" required/><input data-testid="onboarding-billing-contact" value={form.fiscal_profile.billing_contact_name} onChange={e=>setFiscal('billing_contact_name',e.target.value)} maxLength={120} required/></label>
   <label><FieldGuide label="País" example="Colombia" optional/><input data-testid="onboarding-country" value={form.fiscal_profile.country} onChange={e=>setFiscal('country',e.target.value)} maxLength={120}/></label>
   <label><FieldGuide label="Departamento" example="Antioquia" optional/><input data-testid="onboarding-department" value={form.fiscal_profile.department} onChange={e=>setFiscal('department',e.target.value)} maxLength={120}/></label>
   <label><FieldGuide label="Ciudad" example="Medellín" required/><input data-testid="onboarding-city" value={form.fiscal_profile.city} onChange={e=>setFiscal('city',e.target.value)} maxLength={120} required/></label>
   <label className="nexus-field-wide"><FieldGuide label="Dirección fiscal" example="Calle 10 # 20-30" required/><input data-testid="onboarding-address" value={form.fiscal_profile.address} onChange={e=>setFiscal('address',e.target.value)} maxLength={240} required/></label>
   <label className="nexus-field-wide"><FieldGuide label="Motivo del alta" hint="Quedará registrado en auditoría." example="Autoregistro tras aprobación" required/><textarea data-testid="onboarding-reason" value={form.reason} onChange={e=>set('reason',e.target.value)} minLength={10} maxLength={500} required/></label>
   <div className="nexus-field-wide flex gap-3"><ActionButton type="submit" data-testid="onboarding-review-btn" icon={ShieldCheck} disabled={missing.length>0}>Revisar y crear</ActionButton><ActionButton type="button" variant="secondary" onClick={()=>navigate('/manager/dashboard')}>Cancelar</ActionButton></div>
  </form></SurfaceCard>
  {review&&<SurfaceCard><div className="flex items-start gap-3"><CheckCircle2 className="text-[var(--app-success)]"/><div className="flex-1"><h2 className="text-xl">Confirmación final</h2><p className="mt-2">Se creará <strong>{form.name}</strong> y quedará vinculada a tu cuenta, con el perfil fiscal de <strong>{form.fiscal_profile.legal_name}</strong>.</p><div className="mt-4 flex gap-3"><ActionButton icon={Save} data-testid="onboarding-create-btn" loading={saving} disabled={missing.length>0} onClick={submit}>Crear organización</ActionButton><ActionButton variant="secondary" disabled={saving} onClick={()=>setReview(false)}>Volver a editar</ActionButton></div></div></div></SurfaceCard>}
 </MotionPage>;
}

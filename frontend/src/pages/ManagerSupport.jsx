// NEXUS_MANAGER_SUPPORT_PQRS_V1: the backend for this (support_center.py) has existed since
// NEXUS_8A7S1A_SUPPORT_FOUNDATION_V1 but never had a Manager-facing screen -- Owner could only
// read tickets (via Suscripciones/PQRS), nobody could actually open one. This is that screen.
import React,{useCallback,useEffect,useState} from 'react';
import {LifeBuoy,MessageSquarePlus,Send,X} from 'lucide-react';
import {toast} from 'sonner';
import {supportAPI} from '../api';
import {ActionButton,AccessibleModal,DetailDrawer,EmptyState,FieldGuide,LoadingState,MotionPage,PageHeader,ResponsiveDataView,StatusBadge,SurfaceCard} from '../components/design';

const CATEGORIES=[['peticion','Petición'],['queja','Queja'],['reclamo','Reclamo'],['sugerencia','Sugerencia'],['otro','Otro']];
const PRIORITIES=[['low','Baja'],['normal','Normal'],['high','Alta']];
const STATUS_LABELS={open:'Abierto',waiting_owner:'Esperando a Nexus',waiting_organization:'Esperando tu respuesta',in_progress:'En proceso',resolved:'Resuelto',closed:'Cerrado'};
const STATUS_TONES={open:'warning',waiting_owner:'info',waiting_organization:'warning',in_progress:'info',resolved:'success',closed:'neutral'};
const detail=(error,fallback)=>{const d=error?.response?.data?.detail;return typeof d==='string'?d:d?.message||fallback};
const blankForm={subject:'',category:'peticion',priority:'normal',initial_message:''};

export default function ManagerSupport(){
 const [conversations,setConversations]=useState([]),[loading,setLoading]=useState(true);
 const [showNew,setShowNew]=useState(false),[form,setForm]=useState(blankForm),[creating,setCreating]=useState(false);
 const [selectedId,setSelectedId]=useState(null),[selected,setSelected]=useState(null),[selectedLoading,setSelectedLoading]=useState(false);
 const [reply,setReply]=useState(''),[sending,setSending]=useState(false);

 const load=useCallback(async()=>{setLoading(true);try{const r=await supportAPI.list({page_size:50});setConversations(r.data?.items||[])}catch(e){toast.error(detail(e,'No fue posible cargar tus PQRS'))}finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);

 const openConversation=async(id)=>{setSelectedId(id);setSelectedLoading(true);setSelected(null);try{const r=await supportAPI.get(id);setSelected(r.data)}catch(e){toast.error(detail(e,'No fue posible cargar el PQRS'));setSelectedId(null)}finally{setSelectedLoading(false)}};
 const closeDrawer=()=>{setSelectedId(null);setSelected(null);setReply('')};

 const createTicket=async(e)=>{e.preventDefault();if(!form.subject.trim()||!form.initial_message.trim())return;setCreating(true);try{await supportAPI.create({subject:form.subject.trim(),category:form.category,priority:form.priority,initial_message:form.initial_message.trim(),idempotency_key:`pqrs-ui-${Date.now()}-${Math.random().toString(36).slice(2,10)}`});toast.success('PQRS enviado a Nexus');setShowNew(false);setForm(blankForm);await load()}catch(e){toast.error(detail(e,'No fue posible enviar el PQRS'))}finally{setCreating(false)}};

 const sendReply=async(e)=>{e.preventDefault();const body=reply.trim();if(!body||!selectedId)return;setSending(true);try{const r=await supportAPI.sendMessage(selectedId,{body,idempotency_key:`pqrs-msg-${Date.now()}-${Math.random().toString(36).slice(2,10)}`});setSelected(s=>({conversation:r.data.conversation,messages:[...(s?.messages||[]),r.data.message]}));setReply('');await load()}catch(e){toast.error(detail(e,'No fue posible enviar el mensaje'))}finally{setSending(false)}};

 const columns=[
  {key:'subject',label:'Asunto',render:x=><button className="nexus-owner-user text-left" onClick={()=>openConversation(x.conversation_id)}><div><strong>{x.subject}</strong><small>{CATEGORIES.find(c=>c[0]===x.category)?.[1]||x.category}</small></div></button>},
  {key:'priority',label:'Prioridad',render:x=>PRIORITIES.find(p=>p[0]===x.priority)?.[1]||x.priority},
  {key:'status',label:'Estado',render:x=><StatusBadge tone={STATUS_TONES[x.status]||'neutral'}>{STATUS_LABELS[x.status]||x.status}</StatusBadge>},
  {key:'updated',label:'Actualizado',render:x=>String(x.updated_at||'').replace('T',' ').slice(0,16)},
  {key:'actions',label:'',align:'right',render:x=><ActionButton variant="ghost" onClick={()=>openConversation(x.conversation_id)}>Ver</ActionButton>},
 ];

 return <MotionPage className="space-y-6">
  <PageHeader eyebrow="Soporte" title="PQRS" description="Peticiones, quejas, reclamos y sugerencias dirigidas al equipo de Nexus." actions={<ActionButton icon={MessageSquarePlus} onClick={()=>setShowNew(true)}>Nuevo PQRS</ActionButton>}/>
  {loading?<LoadingState label="Cargando tus PQRS"/>:!conversations.length?<EmptyState icon={LifeBuoy} title="Sin PQRS" description="Cuando tengas una petición, queja, reclamo o sugerencia para Nexus, créala aquí." action={<ActionButton icon={MessageSquarePlus} onClick={()=>setShowNew(true)}>Nuevo PQRS</ActionButton>}/>:<SurfaceCard><ResponsiveDataView items={conversations} columns={columns} rowKey={x=>x.conversation_id} empty={null} renderCard={x=><button className="w-full text-left" onClick={()=>openConversation(x.conversation_id)}><div className="flex justify-between gap-3"><strong>{x.subject}</strong><StatusBadge tone={STATUS_TONES[x.status]||'neutral'}>{STATUS_LABELS[x.status]||x.status}</StatusBadge></div><p>{CATEGORIES.find(c=>c[0]===x.category)?.[1]||x.category} · {PRIORITIES.find(p=>p[0]===x.priority)?.[1]||x.priority}</p></button>}/></SurfaceCard>}

  {showNew&&<AccessibleModal open={showNew} onClose={()=>!creating&&setShowNew(false)} labelledBy="pqrs-new-title" describedBy="pqrs-new-description" panelClassName="nexus-accessible-modal-panel">
   <h2 id="pqrs-new-title">Nuevo PQRS</h2>
   <p id="pqrs-new-description">Cuéntanos qué necesitas. El equipo de Nexus responde desde aquí mismo.</p>
   <form className="nexus-guided-form mt-4" onSubmit={createTicket}>
    <label><FieldGuide label="Tipo" required/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label><FieldGuide label="Prioridad" required/><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{PRIORITIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="nexus-field-wide"><FieldGuide label="Asunto" hint="Un resumen corto." example="Demora en respuesta de soporte" required/><input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} maxLength={160} required/></label>
    <label className="nexus-field-wide"><FieldGuide label="Mensaje" required/><textarea rows={4} value={form.initial_message} onChange={e=>setForm({...form,initial_message:e.target.value})} maxLength={4000} required/></label>
    <div className="nexus-account-actions mt-2"><ActionButton type="button" variant="secondary" onClick={()=>setShowNew(false)} disabled={creating}>Cancelar</ActionButton><ActionButton type="submit" icon={Send} loading={creating}>Enviar PQRS</ActionButton></div>
   </form>
  </AccessibleModal>}

  <DetailDrawer open={!!selectedId} onClose={closeDrawer} title={selected?.conversation?.subject||'PQRS'} description={selected?.conversation?.status?STATUS_LABELS[selected.conversation.status]||selected.conversation.status:''}>
   {selectedLoading?<LoadingState label="Cargando conversación"/>:selected&&<div className="space-y-4">
    <div className="nexus-audit-list">{(selected.messages||[]).map(m=><div key={m.message_id} className="p-3 rounded-xl border border-[var(--app-border)]"><div className="flex justify-between text-xs text-[var(--app-text-secondary)]"><span>{m.sender_role==='owner'?'Nexus':'Tú'}</span><time>{String(m.created_at||'').replace('T',' ').slice(0,16)}</time></div><p className="mt-1">{m.body}</p></div>)}</div>
    {selected.conversation?.status==='closed'?<p className="text-sm text-[var(--app-text-secondary)]">Este PQRS está cerrado. Crea uno nuevo si necesitas algo más.</p>:<form onSubmit={sendReply} className="flex gap-2"><input className="flex-1" value={reply} onChange={e=>setReply(e.target.value)} placeholder="Escribe una respuesta..." maxLength={4000}/><ActionButton type="submit" icon={Send} loading={sending} disabled={!reply.trim()}>Enviar</ActionButton></form>}
   </div>}
  </DetailDrawer>
 </MotionPage>;
}

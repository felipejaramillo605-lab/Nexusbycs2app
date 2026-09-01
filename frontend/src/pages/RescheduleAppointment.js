import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,CalendarDays,Check,Clock,Copy,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {clientPortalAPI,publicAPI} from '../api';
import {ActionButton,LoadingState,MotionPage,PageHeader,SurfaceCard} from '../components/design';

const today=()=>new Date().toISOString().slice(0,10);
const formatDate=value=>new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00'));

export default function RescheduleAppointment(){
 const {orgId,appointmentId}=useParams();const navigate=useNavigate();
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[appointment,setAppointment]=useState(null),[date,setDate]=useState(''),[time,setTime]=useState(''),[slots,setSlots]=useState([]),[preferredTime,setPreferredTime]=useState(''),[searching,setSearching]=useState(false),[suggestions,setSuggestions]=useState([]);
 // NEXUS_RESCHEDULE_EXHAUSTIVE_DEPS_V1: load/loadSlots were re-created on
 // every render and left out of their own useEffect deps (flagged by
 // react-hooks/exhaustive-deps). Wrapping them in useCallback with their
 // real dependencies lets the effects list them honestly instead of
 // suppressing the lint rule.
 const load=useCallback(async()=>{setLoading(true);try{const me=await clientPortalAPI.getMe();const item=(me.data?.appointments||[]).find(value=>value.appointment_id===appointmentId);if(!item)throw new Error('Cita no encontrada');setAppointment(item);setDate(item.date);setTime(item.time);setPreferredTime(item.time)}catch(error){const detail=error.response?.data?.detail;toast.error(typeof detail==='string'?detail:(detail?.message||error.message||'No fue posible cargar la cita'))}finally{setLoading(false)}},[appointmentId]);
 useEffect(()=>{load()},[load]);
 const loadSlots=useCallback(async value=>{if(!appointment||!value)return;try{const response=await publicAPI.getAvailability(orgId,appointment.barber_id,value,appointment.service_id);setSlots(response.data.available_slots||[]);setTime(current=>(response.data.available_slots||[]).includes(current)?current:'')}catch(error){setSlots([]);setTime('');toast.error(error.response?.data?.detail?.message||'No hay disponibilidad para ese día')}},[orgId,appointment]);
 useEffect(()=>{if(appointment&&date)loadSlots(date)},[appointment,date,loadSlots]);
 const search=async()=>{if(!appointment||!preferredTime)return toast.error('Indica una hora preferida');setSearching(true);try{const response=await publicAPI.searchAvailability(orgId,appointment.barber_id,appointment.service_id,preferredTime,today(),30);setSuggestions(response.data?.available_dates||[]);if(!response.data?.available_dates?.length)toast.info('No encontramos esa hora en los próximos 30 días')}catch(error){toast.error(error.response?.data?.detail?.message||'No fue posible buscar disponibilidad')}finally{setSearching(false)}};
 const copy=value=>{navigator.clipboard?.writeText(value);toast.success('Hora '+value+' copiada')};
 const reschedule=async()=>{if(!date||!time)return toast.error('Selecciona una fecha y una hora');setSaving(true);try{const response=await clientPortalAPI.rescheduleAppointment(appointmentId,{date,time});toast.success('Cita reprogramada correctamente');navigate('/portal/'+orgId+'/dashboard',{state:{rescheduled:response.data}})}catch(error){const detail=error.response?.data?.detail;setSuggestions(detail?.alternatives||[]);toast.error(detail?.message||'El horario ya no está disponible')}finally{setSaving(false)}};
 const selectedLabel=useMemo(()=>date?formatDate(date):'', [date]);
 if(loading)return <LoadingState label="Cargando cita"/>;
 if(!appointment)return <SurfaceCard>No fue posible encontrar esta cita.</SurfaceCard>;
 return <MotionPage className="min-h-screen bg-black p-4"><PageHeader eyebrow="Portal del cliente" title="Reprogramar cita" description="Elige una nueva fecha y conserva tu profesional y servicio actuales" actions={<ActionButton variant="secondary" icon={ArrowLeft} onClick={()=>navigate('/portal/'+orgId+'/dashboard')}>Volver</ActionButton>}/>
 <div className="mx-auto max-w-3xl space-y-4"><SurfaceCard><div className="flex items-center gap-3"><CalendarDays/><div><strong>{appointment.service_name}</strong><p>{appointment.barber_name} · {appointment.date} · {appointment.time}</p></div></div></SurfaceCard>
 <SurfaceCard><label className="block mb-4">Nueva fecha<input className="w-full mt-2" type="date" min={today()} value={date} onChange={event=>setDate(event.target.value)}/></label><p className="text-sm mb-2">{selectedLabel}</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{slots.map(slot=><button type="button" key={slot} onClick={()=>setTime(slot)} className={'rounded-lg border p-3 '+(time===slot?'border-blue-400 bg-blue-500/20':'border-white/10 bg-white/5')}><Clock size={15} className="inline mr-1"/>{slot}<span className="block text-xs opacity-70" onClick={event=>{event.stopPropagation();copy(slot)}}><Copy size={11} className="inline mr-1"/>Copiar</span></button>)}</div>{!slots.length&&<p className="text-sm opacity-70 mt-3">No hay horas disponibles para este día.</p>}<div className="mt-5 flex gap-2"><ActionButton icon={Check} loading={saving} onClick={reschedule}>Confirmar reprogramación</ActionButton><ActionButton variant="secondary" onClick={()=>loadSlots(date)} icon={RefreshCw}>Actualizar horas</ActionButton></div></SurfaceCard>
 <SurfaceCard><h2 className="text-lg">Buscar por hora preferida</h2><p className="text-sm opacity-70 mb-3">Encuentra días disponibles para la hora que necesitas.</p><div className="flex gap-2"><input type="time" value={preferredTime} onChange={event=>setPreferredTime(event.target.value)}/><ActionButton loading={searching} onClick={search}>Buscar días</ActionButton></div><div className="mt-4 space-y-2">{suggestions.map(item=><button type="button" key={item.date+'-'+item.time} onClick={()=>{setDate(item.date);setTime(item.time)}} className="w-full text-left rounded-lg border border-white/10 p-3 hover:bg-white/10">{formatDate(item.date)} · {item.time}<span className="float-right" onClick={event=>{event.stopPropagation();copy(item.time)}}><Copy size={15}/></span></button>)}</div></SurfaceCard></div></MotionPage>;
}

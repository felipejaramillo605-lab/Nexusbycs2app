import React,{useEffect,useState} from 'react';
import {AlertTriangle,Trash2,X} from 'lucide-react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ActionButton} from './ActionButton';

// NEXUS_ADMIN_OPERATIONS_COMPLETION_V2
let listener=null;
export function confirmAction(message,options={}){
 return new Promise(resolve=>{
  if(!listener){resolve(false);return}
  listener({message,...options,resolve});
 });
}
export function ConfirmDialogHost(){
 const [request,setRequest]=useState(null);const reduced=useReducedMotion();
 useEffect(()=>{listener=value=>setRequest(value);return()=>{listener=null}},[]);
 const close=value=>{if(!request)return;const resolve=request.resolve;setRequest(null);resolve(value)};
 return <AnimatePresence>{request&&<div className="nexus-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="nexus-confirm-title"><motion.button className="nexus-confirm-backdrop" aria-label="Cerrar" onClick={()=>close(false)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/><motion.section initial={reduced?false:{opacity:0,scale:.96,y:16}} animate={{opacity:1,scale:1,y:0}} exit={reduced?undefined:{opacity:0,scale:.98,y:10}} transition={{type:'spring',stiffness:420,damping:34}}><header><span className={request.tone==='warning'?'is-warning':'is-danger'}>{request.tone==='warning'?<AlertTriangle size={21}/>:<Trash2 size={21}/>}</span><button onClick={()=>close(false)} aria-label="Cerrar"><X size={18}/></button></header><h2 id="nexus-confirm-title">{request.title||'Confirmar acción'}</h2><p>{request.message}</p><footer><ActionButton variant="secondary" onClick={()=>close(false)}>Cancelar</ActionButton><ActionButton variant={request.tone==='warning'?'primary':'destructive'} onClick={()=>close(true)}>{request.confirmLabel||'Confirmar'}</ActionButton></footer></motion.section></div>}</AnimatePresence>;
}

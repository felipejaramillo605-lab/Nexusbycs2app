import { useEffect, useId, useRef } from 'react';

// NEXUS_ACCESSIBILITY_4A_V1
const FOCUSABLE = ['a[href]','button:not([disabled])','input:not([disabled])','select:not([disabled])','textarea:not([disabled])','[tabindex]:not([tabindex="-1"])'].join(',');

export function useAccessibleDialog({ open, onClose, titlePrefix = 'nexus-dialog' }) {
  const dialogRef = useRef(null); const triggerRef = useRef(null); const previousFocusRef = useRef(null);
  const reactId = useId().replace(/:/g, ''); const titleId = `${titlePrefix}-${reactId}-title`; const descriptionId = `${titlePrefix}-${reactId}-description`;
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const restoreTarget = triggerRef.current || previousFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => { const dialog=dialogRef.current; if (!dialog) return; const first=dialog.querySelector(FOCUSABLE); (first||dialog).focus({preventScroll:true}); });
    const keydown = event => { const dialog=dialogRef.current; if (!dialog) return; if(event.key==='Escape'){event.preventDefault();onClose?.();return;} if(event.key!=='Tab')return; const items=Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(x=>!x.hasAttribute('hidden')&&x.getAttribute('aria-hidden')!=='true'); if(!items.length){event.preventDefault();dialog.focus();return;} const first=items[0],last=items[items.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();} };
    document.addEventListener('keydown',keydown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (restoreTarget && typeof restoreTarget.focus === 'function') {
        window.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [open,onClose]);
  return {dialogRef,triggerRef,titleId,descriptionId};
}

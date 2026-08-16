import React from 'react';
import { createPortal } from 'react-dom';
import { useAccessibleDialog } from './useAccessibleDialog';

// NEXUS_ACCESSIBILITY_4B_V1
// NEXUS_MODAL_PORTAL_FIX_V1
// Root cause of "modal doesn't appear" (e.g. checkout / "Completar y cobrar"):
// this component used position:fixed but rendered inline in the React tree.
// Several pages render it inside a container that has backdrop-filter
// (Tailwind's backdrop-blur-*) and/or overflow-hidden — both establish a new
// CSS containing block for descendants, which traps position:fixed elements
// inside that small container instead of covering the viewport, and
// overflow-hidden then clips it away entirely. Rendering through a portal to
// document.body sidesteps any ancestor's containing block/overflow, which is
// the standard fix for this class of bug regardless of which page uses it.
export function AccessibleModal({ open, onClose, labelledBy, describedBy, role='dialog', className='nexus-accessible-modal', panelClassName='nexus-accessible-modal-panel', children }) {
  const { dialogRef } = useAccessibleDialog({ open, onClose, titlePrefix: 'nexus-page-modal' });
  if (!open) return null;
  return createPortal(
    <div className={className}><button type="button" className="nexus-accessible-modal-backdrop" onClick={onClose} aria-label="Cerrar"/><div ref={dialogRef} className={panelClassName} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}>{children}</div></div>,
    document.body
  );
}

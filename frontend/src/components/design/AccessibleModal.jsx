import React from 'react';
import { useAccessibleDialog } from './useAccessibleDialog';

// NEXUS_ACCESSIBILITY_4B_V1
export function AccessibleModal({ open, onClose, labelledBy, describedBy, role='dialog', className='nexus-accessible-modal', panelClassName='nexus-accessible-modal-panel', children }) {
  const { dialogRef } = useAccessibleDialog({ open, onClose, titlePrefix: 'nexus-page-modal' });
  if (!open) return null;
  return <div className={className}><button type="button" className="nexus-accessible-modal-backdrop" onClick={onClose} aria-label="Cerrar"/><div ref={dialogRef} className={panelClassName} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}>{children}</div></div>;
}

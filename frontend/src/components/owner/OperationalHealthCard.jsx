import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { platformBillingAPI } from '../../api';
import { SurfaceCard } from '../design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- read-only, self-fetching since `operations` was never read
// outside this one card.
export default function OperationalHealthCard() {
  const [operations, setOperations] = useState(null);

  useEffect(() => {
    platformBillingAPI.getOperationalHealth().then((r) => setOperations(r.data)).catch((e) => toast.error(detail(e, 'No fue posible cargar la configuración operativa')));
  }, []);

  return (
    <SurfaceCard>
      <h2>Estado operativo de facturación</h2>
      {!operations ? (
        <p>Cargando configuración...</p>
      ) : (
        <ul className="nexus-audit-list">
          <li><strong>SMTP</strong><span>{operations.smtp_configured ? 'Configurado' : 'Incompleto'}</span></li>
          <li><strong>Scheduler</strong><span>{operations.scheduler_enabled ? 'Activo' : 'Desactivado'}</span></li>
          <li><strong>Lifecycle</strong><span>{operations.lifecycle_mode}</span></li>
          <li><strong>Entrega</strong><span>{operations.delivery_mode}</span></li>
          <li><strong>Intentos máximos</strong><span>{operations.max_attempts}</span></li>
          <li><strong>Enforcement automático</strong><span>{operations.automatic_enforcement_enabled ? 'Activo' : 'Desactivado'}</span></li>
          <li><strong>Recordatorios</strong><span>{(operations.reminder_days || []).join(', ')} días</span></li>
          <li><strong>Cola</strong><span>{operations.delivery_status_counts?.queued || 0} queued, {operations.delivery_status_counts?.simulated || 0} simuladas, {operations.delivery_status_counts?.sent || 0} enviadas, {operations.delivery_status_counts?.failed || 0} fallidas</span></li>
        </ul>
      )}
    </SurfaceCard>
  );
}

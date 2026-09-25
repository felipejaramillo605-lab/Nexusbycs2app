import React, { useState } from 'react';
import { History } from 'lucide-react';
import { deliveryOperationsAPI } from '../../api';
import { ActionButton, EmptyState, FieldGuide, StatusBadge, SurfaceCard } from '../design';

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6, second increment). `deliveries` stays fetched by the parent's
// org-scoped load() -- it refreshes together with the rest of that call, same
// as before. `testRecipient` was already local-only UI state, so it moves in
// unchanged. `onReload` is the parent's `load(orgId)`, called after a retry
// exactly like the original inline handler did.
export default function DeliveryMonitoringCard({ deliveries, onReload }) {
  const [testRecipient, setTestRecipient] = useState('');

  const retry = async (deliveryId) => {
    await deliveryOperationsAPI.retry(deliveryId, testRecipient ? { test_recipient: testRecipient } : {});
    await onReload();
  };

  return (
    <SurfaceCard>
      <h2>Monitoreo de entregas</h2>
      <label>
        <FieldGuide label="Destinatario controlado" hint="Obligatorio para la primera prueba SMTP" />
        <input type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} />
      </label>
      {!deliveries.length ? (
        <EmptyState icon={History} title="Sin entregas" description="Las simulaciones y envíos aparecerán aquí." />
      ) : (
        <div className="nexus-table-wrap">
          <table className="nexus-table">
            <thead>
              <tr><th>Factura</th><th>Evento</th><th>Destinatario</th><th>Estado</th><th>Intentos</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.email_delivery_id}>
                  <td>{d.invoice_number || d.invoice_id}</td>
                  <td>{d.event_type || 'Emisión'}</td>
                  <td>{d.recipient || 'Sin destinatario'}</td>
                  <td><StatusBadge>{d.status}</StatusBadge></td>
                  <td>{d.attempt_count || 0}</td>
                  <td>{d.status === 'failed' ? <ActionButton onClick={() => retry(d.email_delivery_id)}>Reintentar</ActionButton> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}

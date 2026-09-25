import React from 'react';
import { History } from 'lucide-react';
import { EmptyState, SurfaceCard } from '../design';

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- presentational; audit events stay fetched by the parent's
// org-scoped load().
export default function AuditLogCard({ audit }) {
  return (
    <SurfaceCard>
      <h2>Auditoría reciente</h2>
      {!audit.length ? (
        <EmptyState icon={History} title="Sin eventos" description="Los cambios y pagos aparecerán aquí." />
      ) : (
        <ul className="nexus-audit-list">
          {audit.map((x) => (
            <li key={x.audit_event_id}>
              <strong>{x.event_type}</strong>
              <span>{x.reason}</span>
              <time>{String(x.created_at).replace('T', ' ').slice(0, 19)}</time>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

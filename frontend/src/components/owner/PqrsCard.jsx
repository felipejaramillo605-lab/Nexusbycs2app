import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { EmptyState, StatusBadge, SurfaceCard } from '../design';

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- presentational; tickets stay fetched by the parent's org-scoped
// load(). This per-organization summary is distinct from the global PQRS inbox
// (/owner/support, PR #65) -- that one lists every organization's conversations,
// this one only the selected organization's, inline with its billing context.
export default function PqrsCard({ tickets, organizationName }) {
  return (
    <SurfaceCard>
      <h2>PQRS de este manager</h2>
      <p>Peticiones, quejas, reclamos y sugerencias abiertas por {organizationName || 'esta organización'} en Soporte.</p>
      {!tickets.length ? (
        <EmptyState icon={LifeBuoy} title="Sin PQRS" description="Esta organización no ha abierto peticiones, quejas ni reclamos." />
      ) : (
        <ul className="nexus-audit-list">
          {tickets.slice(0, 10).map((t) => (
            <li key={t.conversation_id}>
              <strong>{t.subject}</strong>
              <span>{t.category ? `${t.category} · ` : ''}Prioridad {t.priority}</span>
              <StatusBadge tone={t.status === 'resolved' || t.status === 'closed' ? 'success' : t.status === 'open' ? 'warning' : 'neutral'}>{t.status}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

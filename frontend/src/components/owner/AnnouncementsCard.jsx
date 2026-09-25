import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { ActionButton, EmptyState, SurfaceCard } from '../design';

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- presentational; announcements stay fetched by the parent's
// org-scoped load() since they're refreshed together with the rest of that call.
export default function AnnouncementsCard({ announcements, organizationName }) {
  const navigate = useNavigate();
  return (
    <SurfaceCard>
      <h2>Comunicados a este manager</h2>
      <p>Últimos avisos enviados desde Comunicados a {organizationName || 'esta organización'}.</p>
      {!announcements.length ? (
        <EmptyState icon={Megaphone} title="Sin comunicados" description="Todavía no se ha enviado ningún aviso a esta organización." />
      ) : (
        <ul className="nexus-audit-list">
          {announcements.slice(0, 10).map((n) => (
            <li key={n.notification_id}>
              <strong>{n.title}</strong>
              <span>{n.message}</span>
              <time>{String(n.created_at).replace('T', ' ').slice(0, 19)}</time>
            </li>
          ))}
        </ul>
      )}
      <ActionButton variant="secondary" icon={Megaphone} onClick={() => navigate('/owner/announcements')}>Enviar comunicado</ActionButton>
    </SurfaceCard>
  );
}

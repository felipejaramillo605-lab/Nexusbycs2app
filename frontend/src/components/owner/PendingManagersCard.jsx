import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRoundCheck } from 'lucide-react';
import { ownerAPI } from '../../api';
import { ActionButton, EmptyState, SurfaceCard } from '../design';

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- independent of the selected organization, self-fetching.
export default function PendingManagersCard() {
  const navigate = useNavigate();
  const [pendingManagers, setPendingManagers] = useState([]);

  useEffect(() => {
    ownerAPI
      .getUsers()
      .then((r) => {
        setPendingManagers(
          (r.data || []).filter(
            (u) => ['manager', 'admin'].includes(u.role) && u.access_status === 'approved' && u.active !== false && !u.deleted_at && !u.organization_id
          )
        );
      })
      .catch(() => {});
  }, []);

  return (
    <SurfaceCard>
      <h2>Registro pendiente de completar</h2>
      <p>Managers y administradores con acceso aprobado que todavía no tienen una organización creada.</p>
      {!pendingManagers.length ? (
        <EmptyState icon={UserRoundCheck} title="Sin registros pendientes" description="Todos los Managers aprobados ya tienen organización." />
      ) : (
        <ul className="nexus-audit-list">
          {pendingManagers.map((u) => (
            <li key={u.user_id}>
              <strong>{u.name || 'Sin nombre'}</strong>
              <span>{u.email}</span>
              <ActionButton variant="secondary" onClick={() => navigate(`/owner/organizations/new?manager_user_id=${encodeURIComponent(u.user_id)}`)}>
                Completar registro
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

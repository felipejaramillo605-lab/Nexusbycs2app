import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { legalAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { getHomeForRole } from '../lib/roleNavigation';
import SubscriptionSuspended from './billing/SubscriptionSuspended';

const LEGAL_PATH = '/legal/contrato';

// Aceptar el contrato vigente es obligatorio para usar la plataforma (todos los roles). Si la consulta falla
// (red), se deja pasar para no bloquear a nadie por un error ajeno al contrato.
function useLegalAccepted(user) {
  const [state, setState] = useState('checking');
  const userId = user?.user_id;
  const exempt = !user || user.access_status !== 'approved';
  useEffect(() => {
    if (exempt) return undefined;
    let alive = true;
    const check = () => legalAPI.getStatus().then(
      (response) => alive && setState(response.data.accepted ? 'accepted' : 'pending'),
      () => alive && setState('accepted'),
    );
    check();
    window.addEventListener('nexus:legal-accepted', check);
    return () => {
      alive = false;
      window.removeEventListener('nexus:legal-accepted', check);
    };
  }, [exempt, userId]);
  return exempt ? 'accepted' : state;
}

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
  const { user, loading, subscriptionSuspended } = useAuth();
  const location = useLocation();
  const legal = useLegalAccepted(user);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  if (subscriptionSuspended && user?.role !== 'owner') {
    return <SubscriptionSuspended />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.access_status !== 'approved') {
    return <Navigate to="/pending-approval" replace />;
  }

  const roleAllowed = requiredRole
    ? user.role === requiredRole
    : !allowedRoles || allowedRoles.includes(user.role);

  if (!roleAllowed) {
    return <Navigate to={getHomeForRole(user.role)} replace />;
  }

  if (location.pathname !== LEGAL_PATH) {
    if (legal === 'checking') {
      return (
        <div className="min-h-screen bg-[#000000] flex items-center justify-center">
          <div className="text-white text-lg">Cargando...</div>
        </div>
      );
    }
    if (legal === 'pending') {
      return <Navigate to={LEGAL_PATH} replace state={{ from: location.pathname }} />;
    }
  }

  return children;
};

export default ProtectedRoute;

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeForRole } from '../lib/roleNavigation';
import SubscriptionSuspended from './billing/SubscriptionSuspended';

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
  const { user, loading, subscriptionSuspended } = useAuth();
  const location = useLocation();

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

  return children;
};

export default ProtectedRoute;

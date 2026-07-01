import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(
    location.state?.user ? true : null
  );

  useEffect(() => {
    // If user data passed from AuthCallback, skip auth check
    if (location.state?.user) {
      setIsAuthenticated(true);
      return;
    }

    if (!loading) {
      setIsAuthenticated(user !== null);
    }
  }, [user, loading, location.state]);

  if (isAuthenticated === null || loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/manager/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
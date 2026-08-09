import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { getHomeForRole } from '../lib/roleNavigation';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) {
      return;
    }

    hasProcessed.current = true;

    const processAuth = async () => {
      let processingKey = null;
      try {
        const params = new URLSearchParams(
          location.hash.replace(/^#/, '')
        );

        const sessionId = params.get('session_id');

        if (!sessionId) {
          navigate('/login?auth_error=missing_session', {
            replace: true
          });
          return;
        }

        processingKey = `nexus-oauth-callback:${sessionId}`;
        if (sessionStorage.getItem(processingKey) === 'processing') return;
        sessionStorage.setItem(processingKey, 'processing');
        window.history.replaceState(null, document.title, '/auth/callback');
        await authAPI.createSession(sessionId);
        const verification = await authAPI.getMe();
        const authenticatedUser = verification.data;
        sessionStorage.removeItem(processingKey);
        completeLogin(authenticatedUser);
        const destination = getHomeForRole(authenticatedUser.role);
        navigate(destination, { replace: true });
      } catch (error) {
        if (processingKey) sessionStorage.removeItem(processingKey);
        console.error(
          'No fue posible completar la autenticación:',
          error?.response?.status,
          error?.response?.data?.detail || error.message
        );

        navigate('/login?auth_error=session_failed', {
          replace: true
        });
      }
    };

    processAuth();
  }, [location.hash, navigate, completeLogin]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <div className="text-white text-lg">
        Procesando autenticación...
      </div>
    </div>
  );
};

export default AuthCallback;
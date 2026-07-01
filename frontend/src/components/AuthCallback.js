import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          navigate('/login');
          return;
        }

        const response = await authAPI.createSession(sessionId);
        setUser(response.data);

        // Navigate based on role
        if (response.data.role === 'owner') {
          navigate('/owner/access-control', { replace: true, state: { user: response.data } });
        } else {
          navigate('/manager/dashboard', { replace: true, state: { user: response.data } });
        }
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/login');
      }
    };

    processAuth();
  }, [location, navigate, setUser]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <div className="text-white text-lg">Procesando autenticación...</div>
    </div>
  );
};

export default AuthCallback;
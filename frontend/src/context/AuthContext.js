import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo
} from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const completeLogin = useCallback((authenticatedUser) => {
    setUser(authenticatedUser);
    setLoading(false);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);

    try {
      const response = await authAPI.getMe();
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const isOAuthCallback =
      window.location.pathname === '/auth/callback' &&
      window.location.hash.includes('session_id=');

    if (isOAuthCallback) {
      // AuthCallback procesará el session_id.
      return;
    }

    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } finally {
      setUser(null);
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      completeLogin,
      checkAuth,
      logout
    }),
    [user, loading, completeLogin, checkAuth, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
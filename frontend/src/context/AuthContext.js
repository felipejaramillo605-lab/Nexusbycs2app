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
  const [subscriptionSuspended, setSubscriptionSuspended] = useState(false);
  const [suspensionCode, setSuspensionCode] = useState(null);

  const completeLogin = useCallback((authenticatedUser) => {
    setUser(authenticatedUser);
    setSubscriptionSuspended(false);
    setSuspensionCode(null);
    setLoading(false);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);

    try {
      const response = await authAPI.getMe();
      setUser(response.data);
      setSubscriptionSuspended(false);
      setSuspensionCode(null);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      if (error?.response?.status === 402 && code === 'SUBSCRIPTION_ACCESS_SUSPENDED') {
        setSubscriptionSuspended(true);
        setSuspensionCode(code);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // NEXUS_7J_SUBSCRIPTION_SUSPENDED_EXPERIENCE
  useEffect(() => {
    const handleSuspension = event => {
      setSubscriptionSuspended(true);
      setSuspensionCode(event?.detail?.code || 'SUBSCRIPTION_ACCESS_SUSPENDED');
    };
    window.addEventListener('nexus:subscription-suspended',handleSuspension);
    return () => window.removeEventListener('nexus:subscription-suspended',handleSuspension);
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
      setSubscriptionSuspended(false);
      setSuspensionCode(null);
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      subscriptionSuspended,
      suspensionCode,
      completeLogin,
      checkAuth,
      logout
    }),
    [user, loading, subscriptionSuspended, suspensionCode, completeLogin, checkAuth, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { publicAPI } from '../api';

const OrganizationContext = createContext(null);

export const OrganizationProvider = ({ children }) => {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load organization by ID
  const loadOrganization = useCallback(async (orgId) => {
    if (!orgId) {
      setOrganization(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await publicAPI.getOrganization(orgId);
      console.log('✅ OrganizationContext: Organization loaded', response.data);
      setOrganization(response.data);
      return response.data;
    } catch (err) {
      console.error('❌ OrganizationContext: Error loading organization', err);
      setError(err);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update organization data (after successful save)
  const updateOrganization = useCallback((updatedData) => {
    setOrganization(prev => {
      if (!prev) return updatedData;
      return { ...prev, ...updatedData };
    });
    console.log('✅ OrganizationContext: Organization updated', updatedData);
  }, []);

  // Refresh organization (force re-fetch)
  const refreshOrganization = useCallback(async (orgId) => {
    const currentOrgId = orgId || organization?.organization_id;
    if (currentOrgId) {
      return await loadOrganization(currentOrgId);
    }
  }, [organization, loadOrganization]);

  // Clear organization (on logout or org change)
  const clearOrganization = useCallback(() => {
    setOrganization(null);
    setError(null);
    console.log('✅ OrganizationContext: Organization cleared');
  }, []);

  const value = {
    organization,
    loading,
    error,
    loadOrganization,
    updateOrganization,
    refreshOrganization,
    clearOrganization,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};

export default OrganizationContext;

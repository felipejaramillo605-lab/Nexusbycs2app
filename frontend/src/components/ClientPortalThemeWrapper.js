import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useClientPortalTheme } from '../hooks/useClientPortalTheme';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001/api';

/**
 * Wrapper component that applies client portal theme based on organization
 * Usage: Wrap any public client page with this component
 */
export const ClientPortalThemeWrapper = ({ children }) => {
  const { orgId } = useParams();
  const [organization, setOrganization] = useState(null);
  
  useClientPortalTheme(organization);

  useEffect(() => {
    const loadOrg = async () => {
      if (!orgId) return;
      try {
        const response = await axios.get(`${API}/public/${orgId}/organization`);
        setOrganization(response.data);
      } catch (error) {
        console.error('Error loading organization for theme:', error);
      }
    };
    loadOrg();
  }, [orgId]);

  return <>{children}</>;
};

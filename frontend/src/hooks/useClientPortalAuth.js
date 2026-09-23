import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';

/** Authentication state and requests for a client's public portal account. */
export function useClientPortalAuth() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organization, setOrganization] = useState(null);

  useEffect(() => {
    const loadOrg = async () => {
      try {
        const response = await api.get(`/public/${orgId}/organization`);
        setOrganization(response.data);
        setOrganizationName(response.data.name || 'Nexus');
      } catch (error) {
        console.error('Error loading organization:', error);
      }
    };
    if (orgId) loadOrg();
  }, [orgId]);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      await api.post('/public/clients/login', { phone, organization_id: orgId, pin });
      toast.success('¡Bienvenido de nuevo!');
      navigate(`/portal/${orgId}/dashboard`);
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error(error.response.data.detail || 'Demasiados intentos. Espera un momento.');
      } else {
        toast.error(error.response?.data?.detail || 'PIN o teléfono incorrecto');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      await api.post('/public/clients/register', {
        phone,
        organization_id: orgId,
        name: name.trim(),
        pin,
        marketing_consent: marketingConsent,
        birthday: birthday || undefined,
      });
      toast.success('¡Cuenta creada exitosamente!');
      navigate(`/portal/${orgId}/dashboard`);
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error('Demasiados intentos. Intenta más tarde.');
      } else {
        toast.error(error.response?.data?.detail || 'Error al crear cuenta');
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    orgId,
    mode,
    setMode,
    phone,
    setPhone,
    name,
    setName,
    pin,
    setPin,
    birthday,
    setBirthday,
    showPin,
    setShowPin,
    marketingConsent,
    setMarketingConsent,
    loading,
    organizationName,
    organization,
    handleLogin,
    handleRegister,
  };
}

// NEXUS_8A7D1B_REMAINING_NEUTRAL_COPY_V1
/* NEXUS_8A7C2B_INVITATION_UI_V1 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { ArrowLeft, Save, Building, Users, Mail, UserCog, Trash2, Loader2, Check, Percent, RotateCcw, Pencil, Copy, ExternalLink, X, Settings as SettingsIcon, FileText, CreditCard, Shield, Palette, Star, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { AccessibleModal, confirmAction } from '../components/design';
import { teamAPI, commissionAPI } from '../api';
import ManagerFiscalProfile from './ManagerFiscalProfile';
import AccountPrivacy from './AccountPrivacy';
import ManagerBilling from './ManagerBilling';
import PortalThemeSelector from '../components/PortalThemeSelector';
import PortalCustomizationPanel from '../components/PortalCustomizationPanel';

const TABS = {
  general: { key: 'general', label: 'General', icon: SettingsIcon },
  fiscal: { key: 'fiscal', label: 'Datos Fiscales', icon: FileText },
  billing: { key: 'billing', label: 'Facturación', icon: CreditCard },
  privacy: { key: 'privacy', label: 'Cuenta y Privacidad', icon: Shield },
  'portal-theme': { key: 'portal-theme', label: 'Portal del Cliente', icon: Palette },
};

const Settings = () => {
  const { user, logout, checkAuth } = useAuth();
  const { updateOrganization, refreshOrganization } = useOrganization();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? searchParams.get('org_id') : user?.organization_id) || user?.organization_id;
  
  // Tab state
  const activeTab = searchParams.get('tab') || 'general';
  const setActiveTab = (tab) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    if (organizationId && user?.role === 'owner') {
      newParams.set('org_id', organizationId);
    }
    setSearchParams(newParams);
  };

  // Business Profile State
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    address: '',
    phone: '',
    client_portal_theme: 'classic',
    logo_url: '',
    portal_welcome_message: '',
    portal_show_team: true,
    portal_show_prices: true,
    portal_show_hours: true,
    portal_show_map: false,
  });
  // NEXUS_LOYALTY_PROGRAM_V1
  const [loyaltyData, setLoyaltyData] = useState({
    enabled: false,
    points_per_visit: 10,
    reward_threshold: 100,
    reward_description: '',
  });
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  // NEXUS_REVIEW_REQUEST_SETTINGS_UI_V1
  const [reviewData, setReviewData] = useState({
    review_link: '',
    enabled: false,
    email_channel: false,
  });
  const [savingReview, setSavingReview] = useState(false);

  // Team Management State
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [invitations, setInvitations] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [invitationAction, setInvitationAction] = useState(null);
  const [simulatedInvitation, setSimulatedInvitation] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [updatingRole, setUpdatingRole] = useState(null);
  // NEXUS_COMMISSION_FOUNDATION_V1
  const [commissionSettings, setCommissionSettings] = useState({ default_staff_percent: 60, default_business_percent: 40, commission_base: 'net_service_amount', tip_policy: 'full_tip_to_staff' });
  const [staffCommissions, setStaffCommissions] = useState([]);
  const [commissionLoading, setCommissionLoading] = useState(true);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [editingCommission, setEditingCommission] = useState(null);
  const [commissionAction, setCommissionAction] = useState(null);

  const loadOrganization = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/public/${organizationId}/organization`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Organization data loaded:', data);
        setProfileData({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          client_portal_theme: data.client_portal_theme || 'classic',
          logo_url: data.logo_url || '',
          portal_welcome_message: data.portal_welcome_message || '',
          portal_show_team: data.portal_show_team ?? true,
          portal_show_prices: data.portal_show_prices ?? true,
          portal_show_hours: data.portal_show_hours ?? true,
          portal_show_map: data.portal_show_map ?? false,
        });
        // NEXUS_LOYALTY_PROGRAM_V1
        const ls = data.loyalty_settings || {};
        setLoyaltyData({
          enabled: !!ls.enabled,
          points_per_visit: Number(ls.points_per_visit ?? 10),
          reward_threshold: Number(ls.reward_threshold ?? 100),
          reward_description: ls.reward_description || '',
        });
        // NEXUS_REVIEW_REQUEST_SETTINGS_UI_V1
        const rrs = data.review_request_settings || {};
        setReviewData({
          review_link: data.review_link || '',
          enabled: !!rrs.enabled,
          email_channel: !!((rrs.channels || {}).email),
        });
      } else {
        const errorData = await response.json();
        console.error('❌ ERROR AL CARGAR ORGANIZACIÓN:', {
          status: response.status,
          errorData: errorData,
          organizationId: organizationId
        });
      }
    } catch (error) {
      console.error('❌ CATCH ERROR AL CARGAR ORGANIZACIÓN:', error);
      toast.error('Error al cargar configuración');
    }
  }, [organizationId]);

  const loadTeamMembers = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await teamAPI.getMembers(organizationId);
      setTeamMembers(response.data);
    } catch (error) {
      console.error('Error al cargar el equipo:', error);
      toast.error(error.response?.data?.detail || 'Error al cargar el equipo');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadInvitations = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await teamAPI.getInvitations(organizationId);
      setInvitations(response.data);
    } catch (error) {
      console.error('Error al cargar invitaciones:', error);
      toast.error(error.response?.data?.detail || 'Error al cargar invitaciones');
    }
  }, [organizationId]);

  const loadCommissions = useCallback(async () => {
    if (!organizationId) return;
    try {
      setCommissionLoading(true);
      const [settingsResponse, staffResponse] = await Promise.all([commissionAPI.getSettings(organizationId), commissionAPI.getStaff(organizationId)]);
      setCommissionSettings({ default_staff_percent: settingsResponse.data.default_staff_percent, default_business_percent: settingsResponse.data.default_business_percent, commission_base: settingsResponse.data.commission_base, tip_policy: settingsResponse.data.tip_policy });
      setStaffCommissions(staffResponse.data.staff || []);
    } catch (error) { toast.error(error.response?.data?.detail || 'No fue posible cargar las comisiones'); }
    finally { setCommissionLoading(false); }
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!organizationId) {
        setLoadError(null);
        setLoading(false);
        setCommissionLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      const results = await Promise.allSettled([
        loadOrganization(), loadTeamMembers(), loadInvitations(), loadCommissions()
      ]);
      if (!active) return;
      if (results.some(result => result.status === 'rejected')) {
        setLoadError('No fue posible cargar toda la configuración.');
      }
      setLoading(false);
    };
    run();
    return () => { active = false; };
  }, [organizationId, loadOrganization, loadTeamMembers, loadInvitations, loadCommissions]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // ✅ CORRECCIÓN: Sanitizar teléfono en el FRONTEND antes de enviar
      const sanitizedPhone = profileData.phone 
        ? profileData.phone.replace(/[\s\-\(\)]/g, '') 
        : '';
      
      // ✅ CORRECCIÓN: Asegurar que tenga + si es número
      const finalPhone = sanitizedPhone && !sanitizedPhone.startsWith('+') && /^\d/.test(sanitizedPhone)
        ? '+' + sanitizedPhone
        : sanitizedPhone;

      const payload = {
        name: profileData.name.trim(),
        phone: finalPhone,
        address: profileData.address.trim()
      };

      // ✅ DEBUGGING: Log del payload antes de enviar
      console.log('🔍 ENVIANDO PAYLOAD:', payload);
      console.log('📞 Teléfono original:', profileData.phone);
      console.log('📞 Teléfono sanitizado:', finalPhone);

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/organizations/${organizationId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const updatedOrg = await response.json();
        console.log('✅ Organization updated successfully:', updatedOrg);
        
        // Actualizar el estado global de la organización
        updateOrganization(updatedOrg);
        
        // Forzar re-fetch para sincronizar toda la app
        await refreshOrganization(organizationId);
        
        toast.success('✅ Perfil actualizado correctamente');
      } else {
        const errorData = await response.json();
        console.error('❌ ERROR AL ACTUALIZAR PERFIL:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData,
          sentPayload: payload,
          organizationId: organizationId
        });
        throw new Error(errorData.detail || 'Failed to update');
      }
    } catch (error) {
      console.error('❌ CATCH ERROR AL ACTUALIZAR PERFIL:', error);
      toast.error(`Error al actualizar el perfil: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // NEXUS_LOYALTY_PROGRAM_V1
  const handleSaveLoyalty = async (e) => {
    e.preventDefault();
    setSavingLoyalty(true);
    try {
      const payload = {
        loyalty_settings: {
          enabled: !!loyaltyData.enabled,
          points_per_visit: Math.max(0, Number(loyaltyData.points_per_visit) || 0),
          reward_threshold: Math.max(0, Number(loyaltyData.reward_threshold) || 0),
          reward_description: (loyaltyData.reward_description || '').trim().slice(0, 240),
        }
      };
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/organizations/${organizationId}`,
        { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (response.ok) {
        toast.success('Programa de lealtad actualizado');
        await refreshOrganization(organizationId);
      } else {
        const err = await response.json();
        throw new Error(err.detail || 'No se pudo guardar');
      }
    } catch (error) {
      toast.error(`Error al guardar lealtad: ${error.message}`);
    } finally {
      setSavingLoyalty(false);
    }
  };

  // NEXUS_REVIEW_REQUEST_SETTINGS_UI_V1
  const handleSaveReview = async (e) => {
    e.preventDefault();
    const link = (reviewData.review_link || '').trim();
    if (reviewData.enabled && link && !link.toLowerCase().startsWith('https://')) {
      toast.error('El enlace debe empezar con https://');
      return;
    }
    setSavingReview(true);
    try {
      const payload = {
        review_link: link || null,
        review_request_settings: {
          enabled: !!reviewData.enabled,
          channels: { email: !!reviewData.email_channel },
        },
      };
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/organizations/${organizationId}`,
        { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (response.ok) {
        toast.success('Solicitudes de reseña actualizadas');
        await refreshOrganization(organizationId);
      } else {
        const err = await response.json();
        throw new Error(err.detail || 'No se pudo guardar');
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setSavingReview(false);
    }
  };

  const invitationError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.code === 'invitation_resend_cooldown') return `Espera ${detail.retry_after_seconds || 1} segundos antes de reenviar.`;
    if (detail?.code === 'invitation_send_limit_reached') return `La invitación alcanzó el límite de ${detail.max_send_attempts || 8} envíos.`;
    if (detail?.code === 'invitation_recipient_not_allowed') return 'Este correo no está autorizado en el modo de prueba.';
    return detail?.message || fallback;
  };
  const showDeliveryResult = (data, email) => {
    if (data?.delivery_status === 'sent') return toast.success(`Invitación enviada a ${email}`);
    if (data?.delivery_status === 'simulated' && data?.invitation_url) {
      setSimulatedInvitation({ email, url: data.invitation_url });
      return toast.info('Invitación simulada. No se envió ningún correo.');
    }
    return toast.warning('La invitación fue creada, pero el proveedor no confirmó el envío.');
  };
  const copyInvitationLink = async () => {
    try { await navigator.clipboard.writeText(simulatedInvitation.url); toast.success('Enlace copiado'); }
    catch { toast.error('No fue posible copiar el enlace'); }
  };
  const handleInviteMember = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return toast.error('Ingresa un correo electrónico');
    if (inviting) return;
    setInviting(true);
    try {
      const response = await teamAPI.createInvitation({ email, role: inviteRole, organization_id: organizationId });
      setInviteEmail(''); await loadInvitations(); showDeliveryResult(response.data, email);
    } catch (error) { toast.error(invitationError(error, 'No fue posible crear la invitación')); }
    finally { setInviting(false); }
  };
  const handleResendInvitation = async (invitation) => {
    setInvitationAction(invitation.invitation_id);
    try {
      const response = await teamAPI.resendInvitation(invitation.invitation_id);
      await loadInvitations(); showDeliveryResult(response.data, invitation.email);
    } catch (error) { toast.error(invitationError(error, 'No fue posible reenviar la invitación')); }
    finally { setInvitationAction(null); }
  };
  const openRevokeInvitation = (invitation) => { setRevokeTarget(invitation); setRevokeReason(''); };
  const handleRevokeInvitation = async () => {
    const reason = revokeReason.trim();
    if (reason.length < 10) return toast.error('Escribe un motivo de al menos 10 caracteres');
    setInvitationAction(revokeTarget.invitation_id);
    try {
      await teamAPI.revokeInvitation(revokeTarget.invitation_id, { reason });
      await loadInvitations(); setRevokeTarget(null); setRevokeReason(''); toast.success('Invitación revocada y auditada');
    } catch (error) { toast.error(invitationError(error, 'No fue posible revocar la invitación')); }
    finally { setInvitationAction(null); }
  };

  const handleChangeRole = async (userId, newRole) => {
    setUpdatingRole(userId);
    try {
      await teamAPI.updateRole(userId, newRole, organizationId);
      setTeamMembers((members) => members.map((member) =>
        member.user_id === userId ? { ...member, role: newRole } : member
      ));
      toast.success('Rol actualizado correctamente');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al actualizar el rol');
      await loadTeamMembers();
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleDeleteMember = async (userId) => {
    if (!await confirmAction('¿Deseas desactivar este miembro? El historial se conservará.')) return;
    try {
      await teamAPI.deactivateMember(userId, organizationId);
      setTeamMembers((members) => members.filter((member) => member.user_id !== userId));
      toast.success('Miembro desactivado');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al desactivar el miembro');
    }
  };

  const changeDefaultStaff = (value) => {
    const staff = Math.max(0, Math.min(100, Number(value) || 0));
    setCommissionSettings((current) => ({ ...current, default_staff_percent: staff, default_business_percent: Number((100 - staff).toFixed(2)) }));
  };
  const saveCommissionSettings = async () => {
    setCommissionSaving(true);
    try { await commissionAPI.updateSettings(commissionSettings, organizationId); await loadCommissions(); toast.success('Configuración de comisiones actualizada'); }
    catch (error) { toast.error(error.response?.data?.detail || 'No fue posible guardar las comisiones'); }
    finally { setCommissionSaving(false); }
  };
  const editStaffCommission = (item) => setEditingCommission({ ...item, reason: item.reason || '' });
  const changeOverrideStaff = (value) => {
    const staff = Math.max(0, Math.min(100, Number(value) || 0));
    setEditingCommission((current) => ({ ...current, staff_percent: staff, business_percent: Number((100 - staff).toFixed(2)) }));
  };
  const saveStaffCommission = async () => {
    if (!editingCommission?.reason.trim() || editingCommission.reason.trim().length < 3) return toast.error('Indica un motivo para la excepción');
    setCommissionAction(editingCommission.barber_id);
    try { await commissionAPI.updateStaff(editingCommission.barber_id, { staff_percent: Number(editingCommission.staff_percent), business_percent: Number(editingCommission.business_percent), reason: editingCommission.reason.trim() }, organizationId); setEditingCommission(null); await loadCommissions(); toast.success('Comisión personalizada guardada'); }
    catch (error) { toast.error(error.response?.data?.detail || 'No fue posible guardar la excepción'); }
    finally { setCommissionAction(null); }
  };
  const resetStaffCommission = async (item) => {
    if (!await confirmAction(`¿Restablecer la comisión de ${item.name}?`)) return;
    setCommissionAction(item.barber_id);
    try { await commissionAPI.resetStaff(item.barber_id, organizationId); await loadCommissions(); toast.success('Comisión restablecida'); }
    catch (error) { toast.error(error.response?.data?.detail || 'No fue posible restablecer la comisión'); }
    finally { setCommissionAction(null); }
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      owner: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      manager: 'bg-green-500/20 text-green-400 border-green-500/30',
      staff: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    };
    return colors[role] || colors.staff;
  };

  if (!organizationId) {
    const refreshState = async () => {
      await checkAuth();
      navigate('/manager/dashboard', { replace: true });
    };
    const signOut = async () => {
      await logout();
      navigate('/login', { replace: true });
    };
    return (
      <div className="min-h-screen nexus-screen grid place-items-center p-6">
        <div className="w-full max-w-lg nexus-panel border border-[var(--app-border)] rounded-3xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--app-text-primary)]">Configuración no disponible todavía</h1>
          <p className="mt-3 text-[var(--app-text-secondary)]">Primero el Owner debe completar la vinculación de la cuenta con una organización.</p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button type="button" className="nexus-button nexus-button-primary" onClick={refreshState}>Actualizar estado</button>
            <button type="button" className="nexus-button nexus-button-secondary" onClick={() => navigate('/manager/dashboard')}>Volver al inicio</button>
            <button type="button" className="nexus-button nexus-button-ghost" onClick={signOut}>Cerrar sesión</button>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !loading) {
    return (
      <div className="min-h-screen nexus-screen grid place-items-center p-6">
        <div className="w-full max-w-lg nexus-panel border border-[var(--app-border)] rounded-3xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--app-text-primary)]">No se pudo cargar Configuración</h1>
          <p className="mt-3 text-[var(--app-text-secondary)]">{loadError}</p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button type="button" className="nexus-button nexus-button-primary" onClick={() => window.location.reload()}>Reintentar</button>
            <button type="button" className="nexus-button nexus-button-secondary" onClick={() => navigate('/manager/dashboard')}>Volver al inicio</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen nexus-screen flex items-center justify-center">
        <Loader2 size={48} className="text-[#0A84FF] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen nexus-screen">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-[var(--app-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-[var(--app-text-primary)] transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-[var(--app-text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Configuración
              </h1>
            </div>
          </div>
        </div>
      </nav>

      {/* Tabs Navigation */}
      <div className="border-b border-[var(--app-border)] bg-[var(--app-bg-primary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto">
            {Object.values(TABS).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap
                    border-b-2 -mb-px
                    ${isActive 
                      ? 'border-[var(--app-accent)] text-[var(--app-accent)]' 
                      : 'border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border)]'
                    }
                  `}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Render content based on active tab */}
        {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* CARD 1 - Perfil del Local */}
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/20 flex items-center justify-center">
                <Building size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Perfil del Local</h2>
                <p className="text-sm text-zinc-400">Información visible para los clientes</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Nombre de la Organización
                </label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  placeholder="Centro de Servicios Integral"
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
                  minLength={1}
                  maxLength={200}
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Acepta letras, números, espacios y caracteres especiales
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="+57 300 123 4567"
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Acepta cualquier formato: +57 300 123 4567, (300) 123-4567, etc.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Dirección
                </label>
                <textarea
                  value={profileData.address}
                  onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                  placeholder="Calle 123 #45-67, Bogotá"
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={18} strokeWidth={1.5} />
                    Guardar Cambios
                  </>
                )}
              </button>
            </form>
          </div>

          {/* NEXUS_LOYALTY_PROGRAM_V1 — CARD Programa de Lealtad */}
          <div data-testid="loyalty-settings-card" className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Star size={20} strokeWidth={1.5} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Programa de Lealtad</h2>
                <p className="text-sm text-zinc-400">Fideliza clientes con puntos por cada visita</p>
              </div>
            </div>
            <form onSubmit={handleSaveLoyalty} className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--app-border)] bg-white/5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text-primary)]">Activar programa de lealtad</div>
                  <div className="text-xs text-zinc-400">Los clientes ganan puntos al completar cada cita</div>
                </div>
                <input
                  type="checkbox"
                  data-testid="loyalty-enabled-toggle"
                  checked={loyaltyData.enabled}
                  onChange={(e) => setLoyaltyData({ ...loyaltyData, enabled: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Puntos por visita</label>
                  <input
                    type="number" min="0" max="10000"
                    data-testid="loyalty-points-per-visit"
                    disabled={!loyaltyData.enabled}
                    value={loyaltyData.points_per_visit}
                    onChange={(e) => setLoyaltyData({ ...loyaltyData, points_per_visit: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Umbral para recompensa</label>
                  <input
                    type="number" min="1" max="1000000"
                    data-testid="loyalty-reward-threshold"
                    disabled={!loyaltyData.enabled}
                    value={loyaltyData.reward_threshold}
                    onChange={(e) => setLoyaltyData({ ...loyaltyData, reward_threshold: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] outline-none disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Descripción de la recompensa</label>
                <input
                  type="text" maxLength={240}
                  data-testid="loyalty-reward-description"
                  disabled={!loyaltyData.enabled}
                  value={loyaltyData.reward_description}
                  onChange={(e) => setLoyaltyData({ ...loyaltyData, reward_description: e.target.value })}
                  placeholder="Ej: Corte gratis al llegar a 100 puntos"
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 outline-none disabled:opacity-50"
                />
                <p className="text-xs text-zinc-500 mt-1">Texto libre — el canje se realiza manualmente en el mostrador (Fase 1)</p>
              </div>
              <button
                type="submit"
                data-testid="loyalty-save-btn"
                disabled={savingLoyalty}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingLoyalty ? <><Loader2 size={18} className="animate-spin" />Guardando...</> : <><Save size={18} />Guardar programa</>}
              </button>
            </form>
          </div>

          {/* NEXUS_REVIEW_REQUEST_SETTINGS_UI_V1 — CARD Solicitud automática de reseñas */}
          <div data-testid="review-request-settings-card" className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <MessageSquare size={20} strokeWidth={1.5} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Solicitud automática de reseña</h2>
                <p className="text-sm text-zinc-400">Envía un email 1 hora después de cada cita completada con enlace a Google</p>
              </div>
            </div>
            <form onSubmit={handleSaveReview} className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--app-border)] bg-white/5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text-primary)]">Activar solicitudes automáticas</div>
                  <div className="text-xs text-zinc-400">Solo se envía si el cliente aceptó marketing y tiene email</div>
                </div>
                <input
                  type="checkbox"
                  data-testid="review-request-enabled-toggle"
                  checked={reviewData.enabled}
                  onChange={(e) => setReviewData({ ...reviewData, enabled: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--app-border)] bg-white/5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text-primary)]">Canal: Email</div>
                  <div className="text-xs text-zinc-400">Enviar por correo electrónico</div>
                </div>
                <input
                  type="checkbox"
                  data-testid="review-request-email-toggle"
                  disabled={!reviewData.enabled}
                  checked={reviewData.email_channel}
                  onChange={(e) => setReviewData({ ...reviewData, email_channel: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Enlace de reseñas de Google</label>
                <input
                  type="url"
                  data-testid="review-link-input"
                  value={reviewData.review_link}
                  onChange={(e) => setReviewData({ ...reviewData, review_link: e.target.value })}
                  placeholder="https://g.page/tu-barberia/review"
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Debe empezar con <code>https://</code>. Obtén tu enlace en Google Business Profile → Compartir enlace de reseñas.</p>
              </div>
              <button
                type="submit"
                data-testid="review-request-save-btn"
                disabled={savingReview}
                className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingReview ? <><Loader2 size={18} className="animate-spin" />Guardando...</> : <><Save size={18} />Guardar configuración</>}
              </button>
            </form>
          </div>

          {/* CARD 2 - Gestión de Equipo */}
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Users size={20} strokeWidth={1.5} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Gestión de Equipo</h2>
                <p className="text-sm text-zinc-400">Administra roles y permisos</p>
              </div>
            </div>

            {/* Invite Section */}
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-[var(--app-border)]">
              <h3 className="text-sm font-medium text-[var(--app-text-primary)] mb-3">Invitar profesional</h3>
              
              <div className="space-y-3">
                <div>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-4 py-2 bg-white/5 border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white/5 border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all text-sm"
                  >
                    {user?.role === 'owner' && <option value="manager">Manager</option>}
                    {user?.role === 'owner' && <option value="admin">Admin (Acceso completo)</option>}
                    <option value="staff">Profesional del equipo</option>
                  </select>

                  <button
                    onClick={handleInviteMember}
                    disabled={inviting}
                    className="px-4 py-2 rounded-lg bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] font-medium transition-all text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} strokeWidth={1.5} />}
                    {inviting ? 'Procesando...' : 'Invitar profesional'}
                  </button>
                </div>
              </div>
            </div>



            {/* Pending Invitations */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">Invitaciones ({invitations.length})</h3>
              {invitations.length === 0 ? (
                <div className="text-center py-5 text-zinc-500 text-sm border border-dashed border-[var(--app-border)] rounded-xl">
                  No hay invitaciones registradas
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {invitations.map((invitation) => {
                    const actionLoading = invitationAction === invitation.invitation_id;
                    const canManage = !['accepted', 'revoked'].includes(invitation.status);
                    const statusStyles = {
                      sent: 'bg-green-500/15 text-green-400 border-green-500/30',
                      delivery_failed: 'bg-red-500/15 text-red-400 border-red-500/30',
                      accepted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                      revoked: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
                      simulated: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                      expired: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    };
                    const statusLabels = {
                      sent: 'Enviada',
                      delivery_failed: 'Falló el envío',
                      accepted: 'Aceptada',
                      revoked: 'Revocada',
                      simulated: 'Simulada',
                      expired: 'Vencida'
                    };
                    return (
                      <div key={invitation.invitation_id} className="p-3 bg-white/5 border border-[var(--app-border)] rounded-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[var(--app-text-primary)] text-sm font-medium truncate">{invitation.email}</p>
                            <p className="text-zinc-500 text-xs mt-1">
                              {invitation.role === 'staff' ? 'Profesional del equipo' : invitation.role} · {new Date(invitation.expires_at).toLocaleDateString()} · {Number(invitation.send_attempts || 0)} intento(s)
                            </p>
                          </div>
                          <span className={`self-start px-2.5 py-1 rounded-full text-xs border ${statusStyles[invitation.status] || statusStyles.revoked}`}>
                            {statusLabels[invitation.status] || invitation.status}
                          </span>
                        </div>
                        {canManage && (
                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleResendInvitation(invitation)}
                              className="px-3 py-1.5 text-xs rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] hover:bg-[#0A84FF]/25 disabled:opacity-50"
                            >
                              {actionLoading ? 'Procesando...' : 'Reenviar'}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => openRevokeInvitation(invitation)}
                              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              Revocar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Team Members List */}
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3">Profesionales y miembros actuales ({teamMembers.length})</h3>
              
              {teamMembers.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No hay miembros del equipo aún
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {teamMembers.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-3 bg-white/5 border border-[var(--app-border)] rounded-lg hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#0A84FF] flex items-center justify-center text-[var(--app-text-primary)] text-sm font-medium flex-shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--app-text-primary)] text-sm font-medium truncate">{member.name}</div>
                          <div className="text-zinc-400 text-xs truncate">{member.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {member.role === 'owner' ? (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor('owner')}`}>
                            Owner
                          </span>
                        ) : (
                          <>
                            {updatingRole === member.user_id ? (
                              <Loader2 size={16} className="text-zinc-400 animate-spin" />
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) => handleChangeRole(member.user_id, e.target.value)}
                                className="px-3 py-1 bg-white/5 border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] text-xs focus:border-[#0A84FF] outline-none"
                              >
                                {user?.role === 'owner' && <option value="admin">Admin</option>}
                                {user?.role === 'owner' && <option value="manager">Manager</option>}
                                <option value="staff">Staff</option>
                              </select>
                            )}

                            {user?.user_id !== member.user_id && (
                              <button
                                onClick={() => handleDeleteMember(member.user_id)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
                                title="Eliminar miembro"
                              >
                                <Trash2 size={16} strokeWidth={1.5} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* NEXUS_COMMISSION_FOUNDATION_V1 */}
          <div className="lg:col-span-2 backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6"><Percent className="text-emerald-400" /><div><h2 className="text-lg font-medium text-[var(--app-text-primary)]">Comisiones del equipo</h2><p className="text-sm text-zinc-400">Regla general y excepciones por profesional</p></div></div>
            {commissionLoading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#0A84FF]" /></div> : <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4 rounded-xl border border-[var(--app-border)] bg-white/5 p-4">
                <label className="text-sm text-zinc-400">Porcentaje Staff<input type="number" min="0" max="100" step="0.01" value={commissionSettings.default_staff_percent} onChange={(e) => changeDefaultStaff(e.target.value)} className="mt-2 w-full px-4 py-3 bg-black/30 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label>
                <label className="text-sm text-zinc-400">Porcentaje negocio<input readOnly value={commissionSettings.default_business_percent} className="mt-2 w-full px-4 py-3 bg-black/20 border border-[var(--app-border)] rounded-xl text-zinc-300" /></label>
                <div className="md:col-span-2 flex flex-wrap justify-between gap-3"><p className="text-xs text-zinc-500">Base neta después de descuentos. Propina completa para el profesional.</p><button type="button" onClick={saveCommissionSettings} disabled={commissionSaving} className="px-5 py-2.5 rounded-xl bg-[#0A84FF] text-[var(--app-text-primary)] disabled:opacity-50">Guardar regla general</button></div>
              </div>
              <div className="space-y-3">{staffCommissions.map((item) => <div key={item.barber_id} className="rounded-xl border border-[var(--app-border)] bg-white/5 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><p className="text-[var(--app-text-primary)] font-medium">{item.name} <span className="text-xs text-zinc-400">{item.source === 'override' ? 'Personalizada' : 'Predeterminada'}</span></p><p className="text-sm text-zinc-400">Staff {item.staff_percent}% · Negocio {item.business_percent}%</p>{item.reason && <p className="text-xs text-zinc-500">Motivo: {item.reason}</p>}</div><div className="flex gap-2"><button type="button" onClick={() => editStaffCommission(item)} className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--app-border)] text-zinc-300"><Pencil size={15} className="inline mr-1" />Personalizar</button>{item.source === 'override' && <button type="button" onClick={() => resetStaffCommission(item)} disabled={commissionAction === item.barber_id} className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-300"><RotateCcw size={15} className="inline mr-1" />Restablecer</button>}</div></div>)}</div>
            </div>}
          </div>
          {editingCommission && <AccessibleModal open={!!editingCommission} onClose={()=>!commissionAction&&setEditingCommission(null)} labelledBy="commission-editor-title" panelClassName="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-6"><h3 id="commission-editor-title" className="text-xl text-[var(--app-text-primary)]">Comisión de {editingCommission.name}</h3><div className="grid sm:grid-cols-2 gap-4 mt-5"><label className="text-sm text-zinc-400">Staff<input type="number" min="0" max="100" step="0.01" value={editingCommission.staff_percent} onChange={(e) => changeOverrideStaff(e.target.value)} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label><label className="text-sm text-zinc-400">Negocio<input readOnly value={editingCommission.business_percent} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-zinc-300" /></label></div><label className="block text-sm text-zinc-400 mt-4">Motivo<textarea rows={3} value={editingCommission.reason} onChange={(e) => setEditingCommission({ ...editingCommission, reason: e.target.value })} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label><div className="flex justify-end gap-3 mt-5"><button type="button" onClick={() => setEditingCommission(null)} className="px-4 py-2 text-zinc-300">Cancelar</button><button type="button" onClick={saveStaffCommission} className="px-4 py-2 rounded-xl bg-[#0A84FF] text-[var(--app-text-primary)]">Guardar</button></div></AccessibleModal>}
        </div>
        )}

        {/* Tab: Datos Fiscales */}
        {activeTab === 'fiscal' && (
          <div>
            <ManagerFiscalProfile />
          </div>
        )}

        {/* Tab: Facturación */}
        {activeTab === 'billing' && (
          <div>
            <ManagerBilling />
          </div>
        )}

        {/* Tab: Cuenta y Privacidad */}
        {activeTab === 'privacy' && (
          <div>
            <AccountPrivacy />
          </div>
        )}

        {/* Tab: Portal del Cliente */}
        {activeTab === 'portal-theme' && organizationId && (
          <div>
            <PortalThemeSelector 
              organizationId={organizationId}
              currentTheme={profileData.client_portal_theme || 'classic'}
              onThemeChange={(theme) => {
                setProfileData(current => ({ ...current, client_portal_theme: theme }));
              }}
            />
            <PortalCustomizationPanel
              organizationId={organizationId}
              initial={profileData}
              onSaved={(updated) => {
                setProfileData(current => ({ ...current, ...updated }));
              }}
            />
          </div>
        )}
      </div>
      <AccessibleModal open={!!simulatedInvitation} onClose={() => setSimulatedInvitation(null)} labelledBy="simulated-invitation-title" describedBy="simulated-invitation-description">
        <button type="button" className="float-right text-zinc-400" onClick={() => setSimulatedInvitation(null)} aria-label="Cerrar"><X size={18}/></button>
        <h2 id="simulated-invitation-title" className="text-xl text-[var(--app-text-primary)]">Invitación simulada</h2>
        <p id="simulated-invitation-description" className="text-sm text-zinc-400 mt-2">No se envió correo a {simulatedInvitation?.email}. Usa este enlace sólo en una prueba controlada.</p>
        <input readOnly value={simulatedInvitation?.url || ''} className="w-full mt-4 px-3 py-2 bg-white/5 border border-[var(--app-border)] rounded-lg text-sm"/>
        <div className="flex flex-wrap gap-2 mt-4"><button type="button" onClick={copyInvitationLink} className="px-4 py-2 rounded-lg bg-[#0A84FF] text-white inline-flex gap-2"><Copy size={16}/>Copiar enlace</button><a href={simulatedInvitation?.url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-white/10 inline-flex gap-2"><ExternalLink size={16}/>Abrir enlace</a></div>
      </AccessibleModal>
      <AccessibleModal open={!!revokeTarget} onClose={() => !invitationAction && setRevokeTarget(null)} labelledBy="revoke-invitation-title" describedBy="revoke-invitation-description" role="alertdialog">
        <h2 id="revoke-invitation-title" className="text-xl text-[var(--app-text-primary)]">Revocar invitación</h2>
        <p id="revoke-invitation-description" className="text-sm text-zinc-400 mt-2">Indica por qué se cancela la vinculación de {revokeTarget?.email}. El motivo quedará auditado.</p>
        <textarea value={revokeReason} onChange={e => setRevokeReason(e.target.value)} minLength={10} maxLength={500} className="w-full mt-4 px-3 py-2 bg-white/5 border border-[var(--app-border)] rounded-lg" placeholder="Ejemplo: La vinculación fue cancelada por el Manager"/>
        <div className="flex gap-2 mt-4"><button type="button" disabled={!!invitationAction} onClick={() => setRevokeTarget(null)} className="px-4 py-2 rounded-lg bg-white/10">Cancelar</button><button type="button" disabled={!!invitationAction || revokeReason.trim().length < 10} onClick={handleRevokeInvitation} className="px-4 py-2 rounded-lg bg-red-500 text-white disabled:opacity-50">{invitationAction ? 'Revocando...' : 'Revocar invitación'}</button></div>
      </AccessibleModal>
    </div>
  );
};

export default Settings;

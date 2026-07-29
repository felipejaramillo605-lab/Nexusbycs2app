import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { ArrowLeft, Save, Building, Users, Mail, UserCog, Trash2, Loader2, Check, Percent, RotateCcw, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { teamAPI, commissionAPI } from '../api';

const Settings = () => {
  const { user, logout } = useAuth();
  const { updateOrganization, refreshOrganization } = useOrganization();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('org_id') || user?.organization_id;

  // Business Profile State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    address: '',
    phone: '',
  });

  // Team Management State
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [invitations, setInvitations] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [invitationAction, setInvitationAction] = useState(null);
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
    if (organizationId) {
      loadOrganization(); loadTeamMembers(); loadInvitations(); loadCommissions();
    }
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

  const handleInviteMember = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error('Ingresa un correo electrónico');
      return;
    }
    if (inviting) return;

    setInviting(true);
    try {
      const response = await teamAPI.createInvitation({
        email,
        role: inviteRole,
        organization_id: organizationId
      });
      setInviteEmail('');
      await loadInvitations();
      if (response.data.delivery_status === 'sent') {
        toast.success(`Invitación enviada a ${email}`);
      } else {
        toast.warning('La invitación fue creada, pero el correo no pudo enviarse. Puedes reenviarla.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible crear la invitación');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvitation = async (invitationId) => {
    setInvitationAction(invitationId);
    try {
      const response = await teamAPI.resendInvitation(invitationId);
      await loadInvitations();
      if (response.data.delivery_status === 'sent') {
        toast.success('Invitación reenviada correctamente');
      } else {
        toast.warning('El proveedor de correo no confirmó el envío');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible reenviar la invitación');
    } finally {
      setInvitationAction(null);
    }
  };

  const handleRevokeInvitation = async (invitationId) => {
    if (!window.confirm('¿Deseas revocar esta invitación?')) return;
    setInvitationAction(invitationId);
    try {
      await teamAPI.revokeInvitation(invitationId);
      await loadInvitations();
      toast.success('Invitación revocada');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible revocar la invitación');
    } finally {
      setInvitationAction(null);
    }
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
    if (!window.confirm('¿Deseas desactivar este miembro? El historial se conservará.')) return;
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
    if (!window.confirm(`¿Restablecer la comisión de ${item.name}?`)) return;
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
                  placeholder="Barbería Premium"
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
              <h3 className="text-sm font-medium text-[var(--app-text-primary)] mb-3">Invitar Miembro</h3>
              
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
                    <option value="staff">Staff (Barbero)</option>
                  </select>

                  <button
                    onClick={handleInviteMember}
                    disabled={inviting}
                    className="px-4 py-2 rounded-lg bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] font-medium transition-all text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} strokeWidth={1.5} />}
                    {inviting ? 'Enviando...' : 'Invitar'}
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
                      expired: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    };
                    const statusLabels = {
                      sent: 'Enviada',
                      delivery_failed: 'Falló el envío',
                      accepted: 'Aceptada',
                      revoked: 'Revocada',
                      expired: 'Vencida'
                    };
                    return (
                      <div key={invitation.invitation_id} className="p-3 bg-white/5 border border-[var(--app-border)] rounded-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[var(--app-text-primary)] text-sm font-medium truncate">{invitation.email}</p>
                            <p className="text-zinc-500 text-xs mt-1">
                              {invitation.role} · {new Date(invitation.expires_at).toLocaleDateString()}
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
                              onClick={() => handleResendInvitation(invitation.invitation_id)}
                              className="px-3 py-1.5 text-xs rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] hover:bg-[#0A84FF]/25 disabled:opacity-50"
                            >
                              {actionLoading ? 'Procesando...' : 'Reenviar'}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleRevokeInvitation(invitation.invitation_id)}
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
              <h3 className="text-sm font-medium text-zinc-400 mb-3">Miembros Actuales ({teamMembers.length})</h3>
              
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
          {editingCommission && <div className="fixed inset-0 z-[100] bg-[var(--app-overlay)] flex items-center justify-center p-4"><div className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[#101010] p-6"><h3 className="text-xl text-[var(--app-text-primary)]">Comisión de {editingCommission.name}</h3><div className="grid sm:grid-cols-2 gap-4 mt-5"><label className="text-sm text-zinc-400">Staff<input type="number" min="0" max="100" step="0.01" value={editingCommission.staff_percent} onChange={(e) => changeOverrideStaff(e.target.value)} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label><label className="text-sm text-zinc-400">Negocio<input readOnly value={editingCommission.business_percent} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-zinc-300" /></label></div><label className="block text-sm text-zinc-400 mt-4">Motivo<textarea rows={3} value={editingCommission.reason} onChange={(e) => setEditingCommission({ ...editingCommission, reason: e.target.value })} className="mt-2 w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label><div className="flex justify-end gap-3 mt-5"><button type="button" onClick={() => setEditingCommission(null)} className="px-4 py-2 text-zinc-300">Cancelar</button><button type="button" onClick={saveStaffCommission} className="px-4 py-2 rounded-xl bg-[#0A84FF] text-[var(--app-text-primary)]">Guardar</button></div></div></div>}
        </div>
      </div>
    </div>
  );
};

export default Settings;

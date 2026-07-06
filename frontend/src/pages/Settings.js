import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { ArrowLeft, Save, Building, Users, Mail, UserCog, Trash2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

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
  const [updatingRole, setUpdatingRole] = useState(null);

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
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/owner/users`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Team members loaded:', data);
        // Filter users by organization
        const orgMembers = data.filter(u => u.organization_id === organizationId);
        console.log('✅ Filtered org members:', orgMembers);
        setTeamMembers(orgMembers);
      } else {
        const errorData = await response.json();
        console.error('❌ ERROR AL CARGAR EQUIPO:', {
          status: response.status,
          errorData: errorData
        });
      }
    } catch (error) {
      console.error('❌ CATCH ERROR AL CARGAR EQUIPO:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadOrganization();
      loadTeamMembers();
    }
  }, [organizationId, loadOrganization, loadTeamMembers]);

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

  const handleInviteMember = () => {
    if (!inviteEmail) {
      toast.error('Ingresa un correo electrónico');
      return;
    }

    // For now, this is a placeholder for invite functionality
    // You would typically send an invite email or create a pending user
    toast.info(`Invitación enviada a ${inviteEmail} como ${inviteRole === 'admin' ? 'Admin' : 'Staff'}`);
    setInviteEmail('');
  };

  const handleChangeRole = async (userId, newRole) => {
    setUpdatingRole(userId);
    
    try {
      // CORRECCIÓN: El backend espera 'role' como query parameter, no como JSON body
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/owner/users/${userId}/role?role=${encodeURIComponent(newRole)}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        setTeamMembers(teamMembers.map(m => 
          m.user_id === userId ? { ...m, role: newRole } : m
        ));
        toast.success('Rol actualizado correctamente');
      } else {
        const errorData = await response.json();
        console.error('❌ ERROR AL ACTUALIZAR ROL:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData,
          userId: userId,
          newRole: newRole,
          endpoint: `${process.env.REACT_APP_BACKEND_URL}/api/owner/users/${userId}/role?role=${newRole}`
        });
        throw new Error(errorData.detail || 'Failed to update role');
      }
    } catch (error) {
      console.error('❌ CATCH ERROR AL ACTUALIZAR ROL:', error);
      toast.error(`Error al actualizar el rol: ${error.message}`);
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleDeleteMember = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este miembro?')) return;

    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/owner/users/${userId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (response.ok) {
        setTeamMembers(teamMembers.filter(m => m.user_id !== userId));
        toast.success('Miembro eliminado');
      }
    } catch (error) {
      console.error('Error deleting member:', error);
      toast.error('Error al eliminar miembro');
    }
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
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <Loader2 size={48} className="text-[#0A84FF] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Configuración
              </h1>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* CARD 1 - Perfil del Local */}
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/20 flex items-center justify-center">
                <Building size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">Perfil del Local</h2>
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
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
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
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
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
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Users size={20} strokeWidth={1.5} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">Gestión de Equipo</h2>
                <p className="text-sm text-zinc-400">Administra roles y permisos</p>
              </div>
            </div>

            {/* Invite Section */}
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <h3 className="text-sm font-medium text-white mb-3">Invitar Miembro</h3>
              
              <div className="space-y-3">
                <div>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all text-sm"
                  >
                    <option value="admin">Admin (Acceso completo)</option>
                    <option value="staff">Staff (Barbero)</option>
                  </select>

                  <button
                    onClick={handleInviteMember}
                    className="px-4 py-2 rounded-lg bg-[#0A84FF] hover:bg-[#0071E3] text-white font-medium transition-all text-sm flex items-center gap-2"
                  >
                    <Mail size={16} strokeWidth={1.5} />
                    Invitar
                  </button>
                </div>
              </div>
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
                      className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium truncate">{member.name}</div>
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
                                className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:border-[#0A84FF] outline-none"
                              >
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
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
        </div>
      </div>
    </div>
  );
};

export default Settings;

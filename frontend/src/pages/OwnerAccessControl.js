import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ownerAPI, organizationAPI } from '../api';
import { Users, Check, X, Trash2, LogOut, LayoutDashboard, Building2 } from 'lucide-react';
import { OWNER, AUTH } from '../constants/testIds';
import { useNavigate } from 'react-router-dom';

const OwnerAccessControl = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, orgsRes] = await Promise.all([
        ownerAPI.getUsers(),
        organizationAPI.getAll()
      ]);
      setUsers(usersRes.data);
      setOrganizations(orgsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccess = async (userId, status) => {
    try {
      await ownerAPI.updateAccess(userId, status);
      loadData();
    } catch (error) {
      console.error('Error updating access:', error);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      await ownerAPI.deleteUser(userId);
      loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Group users by organization
  const getUsersByOrg = () => {
    const grouped = {};
    
    // Add "Sin Organización" group
    grouped['no_org'] = {
      name: 'Sin Organización Asignada',
      users: users.filter(u => !u.organization_id && u.role !== 'owner')
    };

    // Group by organization
    organizations.forEach(org => {
      grouped[org.organization_id] = {
        name: org.name,
        users: users.filter(u => u.organization_id === org.organization_id)
      };
    });

    // Add owner separately
    const ownerUser = users.find(u => u.role === 'owner');
    if (ownerUser) {
      grouped['owner'] = {
        name: 'Administrador del Sistema',
        users: [ownerUser]
      };
    }

    return grouped;
  };

  const filteredGroups = () => {
    const allGroups = getUsersByOrg();
    if (selectedOrg === 'all') {
      return allGroups;
    }
    return {
      [selectedOrg]: allGroups[selectedOrg]
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  const groupedUsers = filteredGroups();

  return (
    <div className="min-h-screen bg-[#000000] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0A84FF] flex items-center justify-center">
              <Users size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-4xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Control de Accesos
              </h1>
              <p className="text-zinc-400 text-sm">Administra usuarios del sistema</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/manager/dashboard')}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 transition-all text-purple-300"
            >
              <LayoutDashboard size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Ver Dashboard</span>
            </button>
            <button
              data-testid={AUTH.logoutBtn}
              onClick={handleLogout}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSelectedOrg('all')}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-medium transition-all ${
              selectedOrg === 'all'
                ? 'bg-[#0A84FF] text-white'
                : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
            }`}
          >
            Todas ({users.filter(u => u.role !== 'owner').length})
          </button>
          
          <span className="text-zinc-500 text-sm">Por Organización:</span>
          
          {organizations.map((org) => {
            const count = users.filter(u => u.organization_id === org.organization_id).length;
            return (
              <button
                key={org.organization_id}
                onClick={() => setSelectedOrg(org.organization_id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  selectedOrg === org.organization_id
                    ? 'bg-[#0A84FF] text-white'
                    : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
                }`}
              >
                <Building2 size={16} strokeWidth={1.5} />
                {org.name} ({count})
              </button>
            );
          })}
          
          <button
            onClick={() => setSelectedOrg('no_org')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedOrg === 'no_org'
                ? 'bg-[#0A84FF] text-white'
                : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
            }`}
          >
            Sin Organización ({users.filter(u => !u.organization_id && u.role !== 'owner').length})
          </button>
        </div>

        {/* Grouped Users */}
        <div className="space-y-6">
          {Object.entries(groupedUsers).map(([groupId, group]) => {
            if (!group.users || group.users.length === 0) return null;
            
            return (
              <div key={groupId} className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
                <div className="bg-white/5 px-6 py-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <Building2 size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
                    <h2 className="text-xl font-medium text-white">{group.name}</h2>
                    <span className="px-3 py-1 rounded-lg text-xs font-medium bg-white/10 text-zinc-400">
                      {group.users.length} {group.users.length === 1 ? 'usuario' : 'usuarios'}
                    </span>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left p-4 text-sm font-medium text-zinc-400">Usuario</th>
                        <th className="text-left p-4 text-sm font-medium text-zinc-400">Email</th>
                        <th className="text-left p-4 text-sm font-medium text-zinc-400">Rol</th>
                        <th className="text-left p-4 text-sm font-medium text-zinc-400">Estado</th>
                        <th className="text-right p-4 text-sm font-medium text-zinc-400">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.users.map((u) => (
                        <tr key={u.user_id} data-testid={OWNER.userRow} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {u.picture ? (
                                <img src={u.picture} alt={u.name} className="w-10 h-10 rounded-full" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-[#0A84FF] flex items-center justify-center text-white font-medium">
                                  {u.name.charAt(0)}
                                </div>
                              )}
                              <span className="text-white font-medium">{u.name}</span>
                            </div>
                          </td>
                          <td className="p-4 text-zinc-400">{u.email}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                              u.role === 'owner' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                            }`}>
                              {u.role === 'owner' ? 'Owner' : 'Manager'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                              u.access_status === 'approved' ? 'bg-green-500/20 text-green-300' :
                              u.access_status === 'denied' ? 'bg-red-500/20 text-red-300' :
                              'bg-yellow-500/20 text-yellow-300'
                            }`}>
                              {u.access_status === 'approved' ? 'Aprobado' : u.access_status === 'denied' ? 'Denegado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-2">
                              {u.access_status !== 'approved' && (
                                <button
                                  data-testid={OWNER.approveBtn}
                                  onClick={() => handleUpdateAccess(u.user_id, 'approved')}
                                  className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors"
                                  title="Aprobar"
                                >
                                  <Check size={18} strokeWidth={1.5} />
                                </button>
                              )}
                              {u.access_status !== 'denied' && u.role !== 'owner' && (
                                <button
                                  data-testid={OWNER.denyBtn}
                                  onClick={() => handleUpdateAccess(u.user_id, 'denied')}
                                  className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
                                  title="Denegar"
                                >
                                  <X size={18} strokeWidth={1.5} />
                                </button>
                              )}
                              {u.role !== 'owner' && (
                                <button
                                  data-testid={OWNER.deleteBtn}
                                  onClick={() => handleDelete(u.user_id)}
                                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-red-300 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 size={18} strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        {users.length === 0 && (
          <div className="text-center py-12 text-zinc-400">
            No hay usuarios registrados
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerAccessControl;

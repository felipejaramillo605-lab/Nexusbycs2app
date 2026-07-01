import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ownerAPI } from '../api';
import { Users, Check, X, Trash2, LogOut } from 'lucide-react';
import { OWNER, AUTH } from '../constants/testIds';
import { useNavigate } from 'react-router-dom';

const OwnerAccessControl = () => {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await ownerAPI.getUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccess = async (userId, status) => {
    try {
      await ownerAPI.updateAccess(userId, status);
      loadUsers();
    } catch (error) {
      console.error('Error updating access:', error);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      await ownerAPI.deleteUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-6">
      <div className="max-w-6xl mx-auto">
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
          <button
            data-testid={AUTH.logoutBtn}
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
          >
            <LogOut size={18} strokeWidth={1.5} />
            Cerrar sesión
          </button>
        </div>

        <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
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
                {users.map((u) => (
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
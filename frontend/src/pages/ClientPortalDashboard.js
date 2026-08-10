import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  User, 
  LogOut, 
  Lock, 
  Trash2, 
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';

export default function ClientPortalDashboard() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  
  const [clientData, setClientData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Change PIN states
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  
  // Delete account states
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Get client info
      const meResponse = await api.get('/public/clients/me');
      setClientData(meResponse.data);

      // Get appointments history
      const historyResponse = await api.get('/public/clients/history', {
        params: {
          phone: meResponse.data.phone,
          organization_id: orgId
        }
      });
      setAppointments(historyResponse.data.appointments || []);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Sesión expirada. Inicia sesión nuevamente.');
        navigate(`/portal/${orgId}/auth`);
      } else {
        toast.error('Error al cargar tus datos');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/public/clients/logout', {});
      toast.success('Sesión cerrada');
      navigate(`/portal/${orgId}/auth`);
    } catch (error) {
      toast.error('Error al cerrar sesión');
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('¿Estás seguro de cancelar esta cita?')) return;

    try {
      await api.post(`/public/clients/appointments/${appointmentId}/cancel`, {});
      toast.success('Cita cancelada exitosamente');
      loadDashboardData();
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('Esta cita ya no existe o fue cancelada');
      } else if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'No se puede cancelar esta cita');
      } else {
        toast.error('Error al cancelar la cita');
      }
      loadDashboardData();
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    
    if (!/^\d{4}$/.test(oldPin)) {
      toast.error('El PIN actual debe ser de 4 dígitos');
      return;
    }
    
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('El nuevo PIN debe ser de 4 dígitos');
      return;
    }
    
    if (newPin !== confirmNewPin) {
      toast.error('Los PINs nuevos no coinciden');
      return;
    }
    
    if (oldPin === newPin) {
      toast.error('El nuevo PIN debe ser diferente al actual');
      return;
    }

    setChangingPin(true);
    try {
      await api.post('/public/clients/change-pin', {
        current_pin: oldPin,
        new_pin: newPin
      });
      toast.success('PIN actualizado exitosamente');
      setShowChangePinModal(false);
      setOldPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('PIN actual incorrecto');
      } else {
        toast.error(error.response?.data?.detail || 'Error al cambiar el PIN');
      }
    } finally {
      setChangingPin(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    
    if (deleteConfirmText !== 'ELIMINAR') {
      toast.error('Debes escribir ELIMINAR en mayúsculas para confirmar');
      return;
    }

    setDeleting(true);
    try {
      await api.delete('/public/clients/me', {
        params: { organization_id: orgId }
      });
      toast.success('Cuenta eliminada exitosamente');
      navigate(`/book/${orgId}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al eliminar la cuenta');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">
            <CheckCircle2 size={12} />
            Confirmada
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">
            <CheckCircle2 size={12} />
            Completada
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs">
            <XCircle size={12} />
            Cancelada
          </span>
        );
      case 'no-show':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs">
            <AlertCircle size={12} />
            No asistió
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-500/20 text-zinc-400 text-xs">
            {status}
          </span>
        );
    }
  };

  const isPastAppointment = (date, time) => {
    const appointmentDateTime = new Date(`${date}T${time}`);
    return appointmentDateTime < new Date();
  };

  const canCancelAppointment = (status, date, time) => {
    return status === 'confirmed' && !isPastAppointment(date, time);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 size={48} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  const upcomingAppointments = appointments.filter(
    apt => apt.status === 'confirmed' && !isPastAppointment(apt.date, apt.time)
  );
  
  const pastAppointments = appointments.filter(
    apt => apt.status !== 'confirmed' || isPastAppointment(apt.date, apt.time)
  );

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link 
            to={`/book/${orgId}`}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4 text-sm"
          >
            <ArrowLeft size={16} />
            Volver a reservar
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                Hola, {clientData?.name}
              </h1>
              <p className="text-sm text-zinc-400">{clientData?.phone}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-zinc-300 transition-colors"
            >
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/book/${orgId}`)}
            className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all group"
          >
            <Plus size={20} className="text-white" />
            <div className="text-left">
              <div className="font-medium text-white">Nueva Cita</div>
              <div className="text-xs text-blue-100">Reservar ahora</div>
            </div>
          </button>

          <button
            onClick={() => setShowChangePinModal(true)}
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            <Lock size={20} className="text-zinc-400" />
            <div className="text-left">
              <div className="font-medium text-white">Cambiar PIN</div>
              <div className="text-xs text-zinc-400">Actualizar seguridad</div>
            </div>
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-xl transition-all group"
          >
            <Trash2 size={20} className="text-zinc-400 group-hover:text-red-400" />
            <div className="text-left">
              <div className="font-medium text-white group-hover:text-red-400">Eliminar Cuenta</div>
              <div className="text-xs text-zinc-400 group-hover:text-red-400/70">Permanente</div>
            </div>
          </button>
        </div>

        {/* Upcoming Appointments */}
        {upcomingAppointments.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-blue-400" />
              Próximas Citas
            </h2>
            <div className="space-y-3">
              {upcomingAppointments.map((apt) => (
                <div
                  key={apt.appointment_id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white mb-1">{apt.service_name}</h3>
                      <p className="text-sm text-zinc-400">Con {apt.barber_name}</p>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {apt.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {apt.time}
                    </span>
                  </div>
                  {canCancelAppointment(apt.status, apt.date, apt.time) && (
                    <button
                      onClick={() => handleCancelAppointment(apt.appointment_id)}
                      className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                    >
                      Cancelar cita
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Appointments */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={20} className="text-zinc-400" />
            Historial ({pastAppointments.length})
          </h2>
          {pastAppointments.length > 0 ? (
            <div className="space-y-3">
              {pastAppointments.map((apt) => (
                <div
                  key={apt.appointment_id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl opacity-75"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-white">{apt.service_name}</h3>
                      <p className="text-sm text-zinc-500">Con {apt.barber_name}</p>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {apt.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {apt.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 bg-white/5 border border-white/10 rounded-xl text-center">
              <Clock size={32} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No tienes citas anteriores</p>
            </div>
          )}
        </div>
      </div>

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Cambiar PIN</h3>
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  PIN Actual
                </label>
                <input
                  type="password"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Nuevo PIN
                </label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Confirmar Nuevo PIN
                </label>
                <input
                  type="password"
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePinModal(false);
                    setOldPin('');
                    setNewPin('');
                    setConfirmNewPin('');
                  }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={changingPin}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {changingPin ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    'Cambiar PIN'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={24} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Eliminar Cuenta</h3>
                <p className="text-sm text-zinc-400">Esta acción es permanente</p>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-200">
                ⚠️ Tu perfil será eliminado, pero tus citas anteriores se mantendrán en el historial del negocio.
              </p>
            </div>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Escribe <span className="text-red-400 font-bold">ELIMINAR</span> para confirmar
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="ELIMINAR"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleting || deleteConfirmText !== 'ELIMINAR'}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    'Eliminar mi cuenta'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

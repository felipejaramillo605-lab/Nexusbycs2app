import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { appointmentAPI, organizationAPI } from '../api';
import { Calendar, DollarSign, Users, LogOut, Menu, Scissors, Package } from 'lucide-react';
import { MANAGER, AUTH } from '../constants/testIds';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';

const ManagerDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [aptsRes, orgsRes] = await Promise.all([
        appointmentAPI.getToday(),
        organizationAPI.getAll()
      ]);
      setAppointments(aptsRes.data);
      setOrganizations(orgsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.service_price || 0), 0);

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return true;
    return false;
  });

  if (user?.access_status !== 'approved') {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-6">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-medium text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Cuenta Pendiente de Aprobación
          </h2>
          <p className="text-zinc-400 mb-6">
            Tu cuenta está en revisión. El administrador debe aprobar tu acceso antes de que puedas usar el sistema.
          </p>
          <button
            onClick={handleLogout}
            className="px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!organizations.length) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-6">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-medium text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Crear Organización
          </h2>
          <p className="text-zinc-400 mb-6">
            Antes de comenzar, necesitas crear tu barbería
          </p>
          <input
            type="text"
            placeholder="Nombre de tu barbería"
            id="org-name-input"
            className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none mb-4"
          />
          <button
            onClick={async () => {
              const name = document.getElementById('org-name-input').value;
              if (name) {
                await organizationAPI.create(name);
                window.location.reload();
              }
            }}
            className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
          >
            Crear Barbería
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000]" data-testid={MANAGER.dashboard}>
      <nav className="backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Clipper
            </h1>
            {organizations[0] && (
              <span className="text-zinc-400 text-sm">/ {organizations[0].name}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/manager/services')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <Scissors size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Servicios</span>
            </button>
            <button
              onClick={() => navigate('/manager/barbers')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <Users size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Barberos</span>
            </button>
            <button
              onClick={() => navigate('/manager/inventory')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <Package size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Inventario</span>
            </button>
            <button
              data-testid={AUTH.logoutBtn}
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span className="hidden md:inline">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Calendar size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
            </div>
            <div className="text-3xl font-light text-white mb-1">{appointments.length}</div>
            <div className="text-sm text-zinc-400">Citas Hoy</div>
          </div>
          
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <DollarSign size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
            </div>
            <div className="text-3xl font-light text-white mb-1">${totalRevenue.toFixed(2)}</div>
            <div className="text-sm text-zinc-400">Ingresos Hoy</div>
          </div>

          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Users size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
            </div>
            <div className="text-3xl font-light text-white mb-1">{new Set(appointments.map(a => a.barber_id)).size}</div>
            <div className="text-sm text-zinc-400">Barberos Activos</div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-light text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Citas del Día
          </h2>
        </div>

        <div className="space-y-4">
          {filteredAppointments.length === 0 ? (
            <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-12 text-center">
              <Calendar size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No hay citas programadas para hoy</p>
            </div>
          ) : (
            filteredAppointments.map((apt) => (
              <Sheet key={apt.appointment_id}>
                <SheetTrigger asChild>
                  <div
                    data-testid={MANAGER.appointmentCard}
                    className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 hover:bg-white/6 cursor-pointer transition-all"
                    onClick={() => setSelectedAppointment(apt)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-[#0A84FF] flex items-center justify-center text-white font-medium">
                            {apt.client_name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{apt.client_name}</h3>
                            <p className="text-sm text-zinc-400">{apt.service_name}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-medium">{apt.time}</div>
                        <div className="text-sm text-zinc-400">{apt.barber_name}</div>
                        <div className="text-sm text-[#0A84FF] font-medium mt-1">${apt.service_price}</div>
                      </div>
                    </div>
                  </div>
                </SheetTrigger>
                <SheetContent className="bg-[#0A0A0A] border-white/10">
                  <SheetHeader>
                    <SheetTitle className="text-white">Detalles de la Cita</SheetTitle>
                  </SheetHeader>
                  {selectedAppointment && (
                    <div className="mt-6 space-y-4">
                      <div>
                        <label className="text-sm text-zinc-400">Cliente</label>
                        <div className="text-white font-medium">{selectedAppointment.client_name}</div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400">Teléfono</label>
                        <div className="text-white">{selectedAppointment.client_phone}</div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400">Email</label>
                        <div className="text-white">{selectedAppointment.client_email}</div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400">Servicio</label>
                        <div className="text-white font-medium">{selectedAppointment.service_name}</div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400">Barbero</label>
                        <div className="text-white">{selectedAppointment.barber_name}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-zinc-400">Fecha</label>
                          <div className="text-white">{selectedAppointment.date}</div>
                        </div>
                        <div>
                          <label className="text-sm text-zinc-400">Hora</label>
                          <div className="text-white">{selectedAppointment.time}</div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400">Precio</label>
                        <div className="text-[#0A84FF] text-2xl font-medium">${selectedAppointment.service_price}</div>
                      </div>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;

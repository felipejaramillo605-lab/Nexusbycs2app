import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { appointmentAPI, organizationAPI, serviceAPI, barberAPI } from '../api';
import { Calendar, DollarSign, Users, LogOut, Menu, Scissors, Package, Monitor, Smartphone, Building, MessageSquare } from 'lucide-react';
import { MANAGER, AUTH } from '../constants/testIds';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import ThemeToggle from '../components/ThemeToggle';
import DashboardStats from '../components/DashboardStats';
import BookingTools from '../components/BookingTools';
import WeeklyCalendar from '../components/WeeklyCalendar';

const ManagerDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [forceDesktopView, setForceDesktopView] = useState(() => {
    return localStorage.getItem('nexus_force_desktop') === 'true';
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const orgsRes = await organizationAPI.getAll();
      setOrganizations(orgsRes.data);
      
      // For owner, select first org automatically if available
      const targetOrg = user.role === 'owner' && orgsRes.data.length > 0 
        ? orgsRes.data[0] 
        : orgsRes.data.find(o => o.organization_id === user.organization_id);
      
      if (targetOrg) {
        setSelectedOrg(targetOrg);
        await loadOrgData(targetOrg.organization_id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadOrgData = async (orgId) => {
    try {
      const params = user.role === 'owner' ? { organization_id: orgId } : {};
      const [aptsRes, servicesRes, barbersRes] = await Promise.all([
        appointmentAPI.getToday(params),
        serviceAPI.getAll(params),
        barberAPI.getAll(params)
      ]);
      setAppointments(aptsRes.data);
      setServices(servicesRes.data);
      setBarbers(barbersRes.data);
    } catch (error) {
      console.error('Error loading org data:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleViewMode = () => {
    const newValue = !forceDesktopView;
    setForceDesktopView(newValue);
    localStorage.setItem('nexus_force_desktop', newValue.toString());
  };

  const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.service_price || 0), 0);

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return true;
    if (filter.startsWith('service_')) {
      const serviceId = filter.replace('service_', '');
      return apt.service_id === serviceId;
    }
    if (filter.startsWith('barber_')) {
      const barberId = filter.replace('barber_', '');
      return apt.barber_id === barberId;
    }
    return true;
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
      <nav className={`backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50 ${forceDesktopView ? 'force-desktop-view' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Logo y Título */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <h1 className="text-lg sm:text-2xl font-light tracking-tight text-white truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Nexus by CS2
              </h1>
              {selectedOrg && (
                <span className="text-zinc-400 text-xs sm:text-sm truncate hidden sm:inline">/ {selectedOrg.name}</span>
              )}
              {user.role === 'owner' && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-300 hidden sm:inline">
                  Owner
                </span>
              )}
            </div>

            {/* Botones de Navegación */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Toggle Vista Mobile/Desktop */}
              <button
                onClick={toggleViewMode}
                className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
                title={forceDesktopView ? "Cambiar a vista móvil" : "Cambiar a vista escritorio"}
              >
                {forceDesktopView ? (
                  <Smartphone size={18} strokeWidth={1.5} />
                ) : (
                  <Monitor size={18} strokeWidth={1.5} />
                )}
                <span className="hidden lg:inline text-sm">
                  {forceDesktopView ? "Vista Móvil" : "Vista Escritorio"}
                </span>
              </button>

              <ThemeToggle />

              {/* Desktop: Botones completos */}
              <div className={`${forceDesktopView ? 'flex' : 'hidden lg:flex'} items-center gap-1 sm:gap-2`}>
                {user.role === 'owner' && (
                  <button
                    onClick={() => navigate('/owner/access-control')}
                    className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 transition-all text-purple-300"
                  >
                    <Users size={18} strokeWidth={1.5} />
                    <span className="hidden sm:inline text-sm">Control de Accesos</span>
                  </button>
                )}
                {selectedOrg && (
                  <>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/business-profile?org_id=${selectedOrg.organization_id}` : '/manager/business-profile')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all text-indigo-300"
                    >
                      <Building size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Perfil Negocio</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/appointments?org_id=${selectedOrg.organization_id}` : '/manager/appointments')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/30 transition-all text-orange-300"
                    >
                      <Calendar size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Historial Citas</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/clients?org_id=${selectedOrg.organization_id}` : '/manager/clients')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
                    >
                      <Users size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Clientes</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/marketing?org_id=${selectedOrg.organization_id}` : '/manager/marketing')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 transition-all text-green-400"
                    >
                      <MessageSquare size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Marketing</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/services?org_id=${selectedOrg.organization_id}` : '/manager/services')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
                    >
                      <Scissors size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Servicios</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/barbers?org_id=${selectedOrg.organization_id}` : '/manager/barbers')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
                    >
                      <Users size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Barberos</span>
                    </button>
                    <button
                      onClick={() => navigate(user.role === 'owner' ? `/manager/inventory?org_id=${selectedOrg.organization_id}` : '/manager/inventory')}
                      className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
                    >
                      <Package size={18} strokeWidth={1.5} />
                      <span className="hidden sm:inline text-sm">Inventario</span>
                    </button>
                  </>
                )}
                <button
                  data-testid={AUTH.logoutBtn}
                  onClick={handleLogout}
                  className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-red-400"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                  <span className="hidden sm:inline text-sm">Salir</span>
                </button>
              </div>

              {/* Mobile: Menu Drawer */}
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    className={`${forceDesktopView ? 'hidden' : 'flex lg:hidden'} items-center justify-center min-h-[44px] w-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white`}
                  >
                    <Menu size={20} strokeWidth={1.5} />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-[#0A0A0A] border-l border-white/10 w-[280px]">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="text-white text-left">Menú de Navegación</SheetTitle>
                    {selectedOrg && (
                      <p className="text-zinc-400 text-sm text-left">{selectedOrg.name}</p>
                    )}
                  </SheetHeader>
                  <div className="space-y-2">
                    {user.role === 'owner' && (
                      <button
                        onClick={() => navigate('/owner/access-control')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all text-left group"
                      >
                        <Users size={20} strokeWidth={1.5} className="text-purple-300" />
                        <span className="text-purple-300 font-medium">Control de Accesos</span>
                      </button>
                    )}
                    {selectedOrg && (
                      <>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/appointments?org_id=${selectedOrg.organization_id}` : '/manager/appointments')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/30 transition-all text-left group"
                        >
                          <Calendar size={20} strokeWidth={1.5} className="text-orange-400" />
                          <span className="text-white font-medium">Historial de Citas</span>
                        </button>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/clients?org_id=${selectedOrg.organization_id}` : '/manager/clients')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                        >
                          <Users size={20} strokeWidth={1.5} className="text-zinc-400 group-hover:text-[#0A84FF] transition-colors" />
                          <span className="text-white font-medium">Clientes</span>
                        </button>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/marketing?org_id=${selectedOrg.organization_id}` : '/manager/marketing')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 transition-all text-left"
                        >
                          <MessageSquare size={20} strokeWidth={1.5} className="text-green-400" />
                          <span className="text-white font-medium">Campañas de Marketing</span>
                        </button>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/services?org_id=${selectedOrg.organization_id}` : '/manager/services')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                        >
                          <Scissors size={20} strokeWidth={1.5} className="text-zinc-400 group-hover:text-[#0A84FF] transition-colors" />
                          <span className="text-white font-medium">Servicios</span>
                        </button>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/barbers?org_id=${selectedOrg.organization_id}` : '/manager/barbers')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                        >
                          <Users size={20} strokeWidth={1.5} className="text-zinc-400 group-hover:text-[#0A84FF] transition-colors" />
                          <span className="text-white font-medium">Barberos</span>
                        </button>
                        <button
                          onClick={() => navigate(user.role === 'owner' ? `/manager/inventory?org_id=${selectedOrg.organization_id}` : '/manager/inventory')}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                        >
                          <Package size={20} strokeWidth={1.5} className="text-zinc-400 group-hover:text-[#0A84FF] transition-colors" />
                          <span className="text-white font-medium">Inventario</span>
                        </button>
                      </>
                    )}
                    <div className="border-t border-white/10 my-4"></div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all text-left group"
                    >
                      <LogOut size={20} strokeWidth={1.5} className="text-red-400" />
                      <span className="text-red-400 font-medium">Cerrar Sesión</span>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {user.role === 'owner' && organizations.length > 1 && (
          <div className="mb-6">
            <label className="text-sm text-zinc-400 mb-2 block">Seleccionar Barbería</label>
            <select
              value={selectedOrg?.organization_id || ''}
              onChange={(e) => {
                const org = organizations.find(o => o.organization_id === e.target.value);
                setSelectedOrg(org);
                if (org) loadOrgData(org.organization_id);
              }}
              className="w-full md:w-64 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
            >
              {organizations.map((org) => (
                <option key={org.organization_id} value={org.organization_id} className="bg-[#1A1A1A]">
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        )}
        
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


        {/* Booking Tools */}
        {selectedOrg && (
          <div className="mb-8">
            <BookingTools organizationId={selectedOrg.organization_id} />
          </div>
        )}

        {/* Statistics Dashboard */}
        {selectedOrg && (
          <div className="mb-8">
            <DashboardStats organizationId={selectedOrg.organization_id} />
          </div>
        )}

        {/* Weekly Calendar */}
        {selectedOrg && (
          <div className="mb-8">
            <WeeklyCalendar organizationId={selectedOrg.organization_id} />
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl font-light text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Citas del Día
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                data-testid={MANAGER.filterBtn}
                onClick={() => setFilter('all')}
                className={`min-h-[44px] px-4 py-2 rounded-xl font-medium transition-all ${
                  filter === 'all' 
                    ? 'bg-[#0A84FF] text-white' 
                    : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
                }`}
              >
                Todas ({appointments.length})
              </button>
            </div>
            
            {services.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-400 text-sm font-medium min-w-[80px]">Servicios:</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {services.map((service) => (
                    <button
                      key={service.service_id}
                      onClick={() => setFilter(`service_${service.service_id}`)}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        filter === `service_${service.service_id}`
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      {service.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {barbers.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-400 text-sm font-medium min-w-[80px]">Barberos:</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {barbers.map((barber) => (
                    <button
                      key={barber.barber_id}
                      onClick={() => setFilter(`barber_${barber.barber_id}`)}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        filter === `barber_${barber.barber_id}`
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      {barber.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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

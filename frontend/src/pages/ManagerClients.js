// NEXUS_8A7D1B_REMAINING_NEUTRAL_COPY_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clientAPI, organizationAPI } from '../api';
import { Users, LogOut, ArrowLeft, Phone, Mail, Calendar, MessageSquare, Send, Eye, CheckCircle, Bell, BellOff, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { toast } from 'sonner';
import whatsappService, { MESSAGE_TEMPLATES } from '../services/whatsappService';
import { AccessibleModal } from '../components/design';

const ManagerClients = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // NEXUS_FRONTEND_PAGINATION_4D2_V2
  const CLIENTS_PAGE_SIZE = 20;
  const [clients, setClients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: CLIENTS_PAGE_SIZE, total: 0, total_pages: 0, has_next: false, has_previous: false });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHistory, setClientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(MESSAGE_TEMPLATES.APPOINTMENT_REMINDER);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [togglingMarketing, setTogglingMarketing] = useState(null); // client_id being toggled

  // Get org_id from query param (for owner) or user.organization_id (for manager)
  const organizationId = (user?.role === 'owner' ? searchParams.get('org_id') : user?.organization_id) || user?.organization_id;

  const loadOrganizationName = useCallback(async () => {
    if (!organizationId) return;
    try {
      const orgsRes = await organizationAPI.getAll();
      const org = orgsRes.data.find(o => o.organization_id === organizationId);
      if (org) setOrganizationName(org.name);
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }, [organizationId]);

  const loadClients = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const params = { organization_id: organizationId, page: currentPage, page_size: CLIENTS_PAGE_SIZE, ...(searchTerm ? { search: searchTerm } : {}) };
      const response = await clientAPI.getAll(params);
      const data = response.data || {};
      setClients(data.items || []);
      setPagination({ page: data.page || currentPage, page_size: data.page_size || CLIENTS_PAGE_SIZE, total: data.total || 0, total_pages: data.total_pages || 0, has_next: Boolean(data.has_next), has_previous: Boolean(data.has_previous) });
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [organizationId, currentPage, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadClients();
      loadOrganizationName();
    }
  }, [organizationId, loadClients, loadOrganizationName]);

  const submitSearch = (event) => {
    event.preventDefault();
    setCurrentPage(1);
    setSearchTerm(searchInput.trim());
  };

  const loadClientHistory = async (clientId) => {
    try {
      setHistoryLoading(true);
      const response = await clientAPI.getHistory(clientId);
      setClientHistory(response.data);
    } catch (error) {
      console.error('Error loading client history:', error);
      toast.error('Error al cargar historial');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistory = (client) => {
    setSelectedClient(client);
    loadClientHistory(client.client_id);
  };

  const handleSendMessage = async () => {
    if (!selectedClient) return;

    setSendingMessage(true);
    try {
      let message = customMessage;
      
      // Generate message based on template
      if (selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER) {
        message = whatsappService.generateReminderMessage({
          client_name: selectedClient.name,
          date: 'Próximamente',
          time: '--:--',
          service_name: 'Tu servicio',
          barber_name: 'Tu profesional'
        });
      } else if (selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION) {
        message = whatsappService.generateReactivationMessage(selectedClient.name);
      } else if (selectedTemplate === MESSAGE_TEMPLATES.PROMOTION) {
        message = whatsappService.generatePromotionMessage(
          selectedClient.name,
          '¡20% de descuento en tu próxima visita!'
        );
      }

      const result = await whatsappService.sendWhatsAppMessage(
        selectedClient.phone,
        message,
        selectedTemplate
      );

      if (result.success) {
        toast.success(
          result.mock 
            ? '✅ Mensaje mock enviado (revisa consola)' 
            : '✅ Mensaje enviado por WhatsApp'
        );
        setShowMessageModal(false);
        setCustomMessage('');
      }
    } catch (error) {
      toast.error('Error al enviar mensaje');
      console.error(error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleToggleMarketing = async (client) => {
    setTogglingMarketing(client.client_id);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/clients/${client.client_id}?accepts_marketing=${!client.accepts_marketing}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        // Update local state
        setClients(clients.map(c => 
          c.client_id === client.client_id 
            ? { ...c, accepts_marketing: !c.accepts_marketing }
            : c
        ));
        toast.success(
          client.accepts_marketing 
            ? 'Notificaciones desactivadas' 
            : 'Notificaciones activadas'
        );
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Error toggling marketing:', error);
      toast.error('Error al actualizar preferencias');
    } finally {
      setTogglingMarketing(null);
    }
  };

  const getMessagePreview = () => {
    if (customMessage) return customMessage;
    
    if (!selectedClient) return '';

    if (selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER) {
      return `🔔 *Recordatorio de Cita*\n\n¡Hola ${selectedClient.name}!\n\nTu cita es próximamente.\nNo faltes! 💈`;
    } else if (selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION) {
      return `👋 *¡Te extrañamos!*\n\nHola ${selectedClient.name},\n\nHace mucho que no te vemos. ¿Qué tal un nuevo look? 💇‍♂️\n\n¡Te esperamos! ✨`;
    } else if (selectedTemplate === MESSAGE_TEMPLATES.PROMOTION) {
      return `🎉 *¡Oferta Especial!*\n\nHola ${selectedClient.name},\n\n¡20% de descuento en tu próxima visita!\n\n¡No te lo pierdas! ⏰`;
    }
    return '';
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen nexus-screen flex items-center justify-center">
        <div className="text-[var(--app-text-primary)] text-lg">Cargando clientes...</div>
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
                Clientes
                {organizationName && <span className="text-zinc-400 text-base ml-2">· {organizationName}</span>}
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-red-400"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span className="hidden sm:inline text-sm">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Stats */}
        <div className="mb-8 backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--app-primary)]/20 flex items-center justify-center">
              <Users size={24} strokeWidth={1.5} className="text-[var(--app-primary)]" />
            </div>
            <div>
              <div className="text-3xl font-light text-[var(--app-text-primary)]">{pagination.total}</div>
              <div className="text-sm text-zinc-400">Clientes Registrados</div>
            </div>
          </div>
        </div>

        <form onSubmit={submitSearch} className="mb-6 flex flex-col sm:flex-row gap-3" role="search">
          <label className="sr-only" htmlFor="client-search">Buscar clientes</label>
          <div className="relative flex-1"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" /><input id="client-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por nombre, teléfono o correo" className="w-full pl-10 pr-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] outline-none focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary)]/20" /></div>
          <button type="submit" className="px-5 py-3 rounded-xl bg-[var(--app-primary)] text-white font-medium">Buscar</button>
          {searchTerm && <button type="button" onClick={() => { setSearchInput(''); setSearchTerm(''); setCurrentPage(1); }} className="px-5 py-3 rounded-xl border border-[var(--app-border)] text-[var(--app-text-primary)]">Limpiar</button>}
        </form>

        {/* Clients Table */}
        {clients.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center">
            <Users size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No hay clientes registrados aún</p>
          </div>
        ) : (
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Cliente</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Teléfono</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Email</th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-zinc-400">Visitas</th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-zinc-400">Puntos</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Última Visita</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-zinc-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {clients.map((client) => (
                    <tr key={client.client_id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--app-primary)] flex items-center justify-center text-[var(--app-text-primary)] font-medium">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--app-text-primary)] font-medium">{client.name}</span>
                            {client.is_registered ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Registrado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                                Invitado
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Phone size={16} strokeWidth={1.5} className="text-zinc-500" />
                          {client.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Mail size={16} strokeWidth={1.5} className="text-zinc-500" />
                          {client.email || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1 rounded-full bg-[var(--app-primary)]/20 text-[var(--app-primary)] text-sm font-medium">
                          {client.total_visits}
                        </span>
                      </td>
                      <td data-testid={`client-loyalty-points-${client.client_id}`} className="px-6 py-4 text-center">
                        <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">
                          {Number(client.loyalty_points || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Calendar size={16} strokeWidth={1.5} className="text-zinc-500" />
                          {client.last_visit || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => handleToggleMarketing(client)}
                            disabled={togglingMarketing === client.client_id}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)] focus:ring-offset-2 focus:ring-offset-[#0A0A0A] disabled:opacity-50 ${
                              client.accepts_marketing ? 'bg-green-500' : 'bg-zinc-700'
                            }`}
                            title={client.accepts_marketing ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
                          >
                            {togglingMarketing === client.client_id ? (
                              <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--app-text-primary)] animate-spin" />
                            ) : (
                              <>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  client.accepts_marketing ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                                {client.accepts_marketing ? (
                                  <Bell size={12} className="absolute left-1 text-[var(--app-text-primary)]" />
                                ) : (
                                  <BellOff size={12} className="absolute right-1 text-zinc-400" />
                                )}
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Sheet>
                            <SheetTrigger asChild>
                              <button
                                onClick={() => handleViewHistory(client)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all text-sm"
                              >
                                <Eye size={16} strokeWidth={1.5} />
                                Ver Historial
                              </button>
                            </SheetTrigger>
                            <SheetContent className="bg-[var(--app-surface-elevated)] border-l border-[var(--app-border)] w-full sm:max-w-lg overflow-y-auto">
                              <SheetHeader className="mb-6">
                                <SheetTitle className="text-[var(--app-text-primary)] text-left">
                                  Historial de {selectedClient?.name}
                                </SheetTitle>
                                <div className="flex items-center gap-4 mt-2">
                                  <div className="text-sm text-zinc-400">
                                    <Phone size={14} className="inline mr-1" />
                                    {selectedClient?.phone}
                                  </div>
                                  {selectedClient?.email && (
                                    <div className="text-sm text-zinc-400">
                                      <Mail size={14} className="inline mr-1" />
                                      {selectedClient.email}
                                    </div>
                                  )}
                                </div>
                              </SheetHeader>

                              {historyLoading ? (
                                <div className="text-center py-8 text-zinc-400">Cargando...</div>
                              ) : clientHistory.length === 0 ? (
                                <div className="text-center py-8 text-zinc-400">
                                  Sin historial de citas
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {clientHistory.map((apt) => (
                                    <div key={apt.appointment_id} className="bg-white/5 border border-[var(--app-border)] rounded-xl p-4">
                                      <div className="flex items-start justify-between mb-3">
                                        <div>
                                          <div className="text-[var(--app-text-primary)] font-medium mb-1">{apt.service_name}</div>
                                          <div className="text-sm text-zinc-400">{apt.barber_name}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-[var(--app-primary)] font-medium">${apt.service_price}</div>
                                          <div className={`text-xs mt-1 px-2 py-1 rounded ${
                                            apt.status === 'confirmed' 
                                              ? 'bg-green-500/20 text-green-400'
                                              : 'bg-red-500/20 text-red-400'
                                          }`}>
                                            {apt.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 text-sm text-zinc-400">
                                        <div className="flex items-center gap-1">
                                          <Calendar size={14} />
                                          {apt.date}
                                        </div>
                                        <div>{apt.time}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </SheetContent>
                          </Sheet>

                          <button
                            onClick={() => {
                              setSelectedClient(client);
                              setShowMessageModal(true);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 transition-all text-sm"
                          >
                            <MessageSquare size={16} strokeWidth={1.5} />
                            Enviar Mensaje
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-white/5">
              {clients.map((client) => (
                <div key={client.client_id} className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-[var(--app-primary)] flex items-center justify-center text-[var(--app-text-primary)] font-medium flex-shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[var(--app-text-primary)] font-medium">{client.name}</div>
                        {client.is_registered ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Registrado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                            Invitado
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-zinc-400 flex items-center gap-1">
                        <Phone size={14} />
                        {client.phone}
                      </div>
                      {client.email && (
                        <div className="text-sm text-zinc-400 flex items-center gap-1 mt-1">
                          <Mail size={14} />
                          {client.email}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="px-2 py-1 rounded-full bg-[var(--app-primary)]/20 text-[var(--app-primary)] text-xs font-medium">
                        {client.total_visits} visitas
                      </div>
                      <button
                        onClick={() => handleToggleMarketing(client)}
                        disabled={togglingMarketing === client.client_id}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                          client.accepts_marketing ? 'bg-green-500' : 'bg-zinc-700'
                        }`}
                        title={client.accepts_marketing ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
                      >
                        {togglingMarketing === client.client_id ? (
                          <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--app-text-primary)] animate-spin" />
                        ) : (
                          <>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              client.accepts_marketing ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                            {client.accepts_marketing ? (
                              <Bell size={12} className="absolute left-1 text-[var(--app-text-primary)]" />
                            ) : (
                              <BellOff size={12} className="absolute right-1 text-zinc-400" />
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <Sheet>
                      <SheetTrigger asChild>
                        <button
                          onClick={() => handleViewHistory(client)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all text-sm"
                        >
                          <Eye size={16} strokeWidth={1.5} />
                          Historial
                        </button>
                      </SheetTrigger>
                      <SheetContent className="bg-[var(--app-surface-elevated)] border-l border-[var(--app-border)] w-full sm:max-w-lg overflow-y-auto">
                        <SheetHeader className="mb-6">
                          <SheetTitle className="text-[var(--app-text-primary)] text-left">
                            Historial de {selectedClient?.name}
                          </SheetTitle>
                        </SheetHeader>
                        {historyLoading ? (
                          <div className="text-center py-8 text-zinc-400">Cargando...</div>
                        ) : clientHistory.length === 0 ? (
                          <div className="text-center py-8 text-zinc-400">Sin historial de citas</div>
                        ) : (
                          <div className="space-y-4">
                            {clientHistory.map((apt) => (
                              <div key={apt.appointment_id} className="bg-white/5 border border-[var(--app-border)] rounded-xl p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <div className="text-[var(--app-text-primary)] font-medium mb-1">{apt.service_name}</div>
                                    <div className="text-sm text-zinc-400">{apt.barber_name}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[var(--app-primary)] font-medium">${apt.service_price}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-zinc-400">
                                  <div>{apt.date}</div>
                                  <div>{apt.time}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </SheetContent>
                    </Sheet>
                    
                    <button
                      onClick={() => {
                        setSelectedClient(client);
                        setShowMessageModal(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 transition-all text-sm"
                    >
                      <MessageSquare size={16} strokeWidth={1.5} />
                      Mensaje
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {pagination.total_pages > 1 && <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-[var(--app-border)] bg-white/3 px-4 py-3"><p className="text-sm text-zinc-400">Mostrando {(pagination.page - 1) * pagination.page_size + 1} - {Math.min(pagination.page * pagination.page_size, pagination.total)} de {pagination.total}</p><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={!pagination.has_previous || loading} className="p-2 rounded-lg border border-[var(--app-border)] disabled:opacity-40"><ChevronLeft size={20} /></button><span className="text-sm text-zinc-400">Página {pagination.page} de {pagination.total_pages}</span><button type="button" aria-label="Página siguiente" onClick={() => setCurrentPage(page => Math.min(pagination.total_pages, page + 1))} disabled={!pagination.has_next || loading} className="p-2 rounded-lg border border-[var(--app-border)] disabled:opacity-40"><ChevronRight size={20} /></button></div></div>}
      </div>

      {/* Message Modal */}
      {showMessageModal && selectedClient && (
        <AccessibleModal open={showMessageModal} onClose={()=>!sendingMessage&&setShowMessageModal(false)} labelledBy="client-message-title" describedBy="client-message-description" panelClassName="bg-[var(--app-surface-elevated)] border border-[var(--app-border)] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--app-border)]">
              <h2 id="client-message-title" className="text-2xl font-light text-[var(--app-text-primary)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Enviar Mensaje WhatsApp
              </h2>
              <p id="client-message-description" className="text-zinc-400 text-sm">
                A: {selectedClient.name} ({selectedClient.phone})
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Template Selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Selecciona una plantilla
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.APPOINTMENT_REMINDER)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER
                        ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]'
                        : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium mb-1">🔔 Recordatorio</div>
                    <div className="text-xs opacity-75">Recordatorio de cita</div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.REACTIVATION)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION
                        ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]'
                        : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium mb-1">👋 Reactivación</div>
                    <div className="text-xs opacity-75">Cliente inactivo</div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.PROMOTION)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === MESSAGE_TEMPLATES.PROMOTION
                        ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]'
                        : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium mb-1">🎉 Promoción</div>
                    <div className="text-xs opacity-75">Oferta especial</div>
                  </button>
                </div>
              </div>

              {/* Message Preview */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Vista previa del mensaje
                </label>
                <div className="bg-white/5 border border-[var(--app-border)] rounded-xl p-4">
                  <pre className="text-zinc-300 text-sm whitespace-pre-wrap font-sans">
                    {getMessagePreview()}
                  </pre>
                </div>
                {whatsappService.IS_MOCK_MODE && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-yellow-400">
                    <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>Modo MOCK activado: El mensaje se mostrará en consola (no se enviará realmente por WhatsApp)</span>
                  </div>
                )}
              </div>

              {/* Custom Message (Optional) */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Mensaje personalizado (opcional)
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Escribe un mensaje personalizado o usa la plantilla..."
                  className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary)]/20 outline-none transition-all resize-none"
                  rows={4}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-[var(--app-border)] flex gap-3">
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setSelectedClient(null);
                  setCustomMessage('');
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-[var(--app-border)] text-[var(--app-text-primary)] hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage}
                className="flex-1 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-[var(--app-text-primary)] font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingMessage ? (
                  'Enviando...'
                ) : (
                  <>
                    <Send size={18} strokeWidth={1.5} />
                    Enviar Mensaje
                  </>
                )}
              </button>
            </div>
          </AccessibleModal>
      )}
    </div>
  );
};

export default ManagerClients;

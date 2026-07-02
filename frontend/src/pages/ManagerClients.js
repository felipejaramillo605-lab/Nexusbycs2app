import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { clientAPI } from '../api';
import { Users, LogOut, ArrowLeft, Phone, Mail, Calendar, MessageSquare, Send, Eye, CheckCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { toast } from 'sonner';
import whatsappService, { MESSAGE_TEMPLATES } from '../services/whatsappService';

const ManagerClients = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHistory, setClientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(MESSAGE_TEMPLATES.APPOINTMENT_REMINDER);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const params = user.organization_id ? { organization_id: user.organization_id } : {};
      const response = await clientAPI.getAll(params);
      setClients(response.data);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
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
          barber_name: 'Tu barbero'
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
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white text-lg">Cargando clientes...</div>
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
                onClick={() => navigate('/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Clientes
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
        <div className="mb-8 backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0A84FF]/20 flex items-center justify-center">
              <Users size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
            </div>
            <div>
              <div className="text-3xl font-light text-white">{clients.length}</div>
              <div className="text-sm text-zinc-400">Clientes Registrados</div>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        {clients.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-12 text-center">
            <Users size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No hay clientes registrados aún</p>
          </div>
        ) : (
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Cliente</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Teléfono</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Email</th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-zinc-400">Visitas</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Última Visita</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-zinc-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {clients.map((client) => (
                    <tr key={client.client_id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0A84FF] flex items-center justify-center text-white font-medium">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white font-medium">{client.name}</span>
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
                        <span className="px-3 py-1 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] text-sm font-medium">
                          {client.total_visits}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Calendar size={16} strokeWidth={1.5} className="text-zinc-500" />
                          {client.last_visit || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Sheet>
                            <SheetTrigger asChild>
                              <button
                                onClick={() => handleViewHistory(client)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all text-sm"
                              >
                                <Eye size={16} strokeWidth={1.5} />
                                Ver Historial
                              </button>
                            </SheetTrigger>
                            <SheetContent className="bg-[#0A0A0A] border-l border-white/10 w-full sm:max-w-lg overflow-y-auto">
                              <SheetHeader className="mb-6">
                                <SheetTitle className="text-white text-left">
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
                                    <div key={apt.appointment_id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                      <div className="flex items-start justify-between mb-3">
                                        <div>
                                          <div className="text-white font-medium mb-1">{apt.service_name}</div>
                                          <div className="text-sm text-zinc-400">{apt.barber_name}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-[#0A84FF] font-medium">${apt.service_price}</div>
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
                    <div className="w-12 h-12 rounded-full bg-[#0A84FF] flex items-center justify-center text-white font-medium flex-shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium mb-1">{client.name}</div>
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
                    <div className="text-right">
                      <div className="px-2 py-1 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] text-xs font-medium">
                        {client.total_visits} visitas
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <Sheet>
                      <SheetTrigger asChild>
                        <button
                          onClick={() => handleViewHistory(client)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all text-sm"
                        >
                          <Eye size={16} strokeWidth={1.5} />
                          Historial
                        </button>
                      </SheetTrigger>
                      <SheetContent className="bg-[#0A0A0A] border-l border-white/10 w-full sm:max-w-lg overflow-y-auto">
                        <SheetHeader className="mb-6">
                          <SheetTitle className="text-white text-left">
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
                              <div key={apt.appointment_id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <div className="text-white font-medium mb-1">{apt.service_name}</div>
                                    <div className="text-sm text-zinc-400">{apt.barber_name}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[#0A84FF] font-medium">${apt.service_price}</div>
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
      </div>

      {/* Message Modal */}
      {showMessageModal && selectedClient && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-2xl font-light text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Enviar Mensaje WhatsApp
              </h2>
              <p className="text-zinc-400 text-sm">
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
                        ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium mb-1">🔔 Recordatorio</div>
                    <div className="text-xs opacity-75">Recordatorio de cita</div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.REACTIVATION)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION
                        ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium mb-1">👋 Reactivación</div>
                    <div className="text-xs opacity-75">Cliente inactivo</div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.PROMOTION)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === MESSAGE_TEMPLATES.PROMOTION
                        ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
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
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
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
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all resize-none"
                  rows={4}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setSelectedClient(null);
                  setCustomMessage('');
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage}
                className="flex-1 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerClients;

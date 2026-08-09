import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clientAPI, organizationAPI, marketingAPI } from '../api';
import { Send, ArrowLeft, LogOut, Users, MessageSquare, CheckSquare, Loader2, Bell, BellOff, AlertCircle, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import whatsappService, { MESSAGE_TEMPLATES } from '../services/whatsappService';

const MarketingCampaigns = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(MESSAGE_TEMPLATES.PROMOTION);
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [channel, setChannel] = useState('whatsapp'); // 'whatsapp', 'email', 'both'
  const [emailSubject, setEmailSubject] = useState('');

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
      const params = { organization_id: organizationId };
      const response = await clientAPI.getAll(params);
      
      // Filter clients who accept marketing
      const marketingClients = response.data.filter(c => c.accepts_marketing);
      setClients(marketingClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadClients();
      loadOrganizationName();
    }
  }, [organizationId, loadClients, loadOrganizationName]);

  const handleToggleClient = (clientId) => {
    setSelectedClients(prev => 
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const handleSelectAll = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map(c => c.client_id));
    }
  };

  const getMessagePreview = () => {
    if (customMessage) return customMessage;

    const clientName = clients[0]?.name || 'Cliente';

    if (selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER) {
      return `🔔 *Recordatorio de Cita*\n\n¡Hola ${clientName}!\n\nTu cita es próximamente.\nNo faltes! 💈`;
    } else if (selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION) {
      return `👋 *¡Te extrañamos!*\n\nHola ${clientName},\n\nHace mucho que no te vemos. ¿Qué tal un nuevo look? 💇‍♂️\n\n¡Te esperamos! ✨`;
    } else if (selectedTemplate === MESSAGE_TEMPLATES.PROMOTION) {
      return `🎉 *¡Oferta Especial!*\n\nHola ${clientName},\n\n¡20% de descuento en tu próxima visita!\n\n¡No te lo pierdas! ⏰`;
    }
    return '';
  };

  const handleSendCampaign = async () => {
    if (selectedClients.length === 0) {
      toast.error('Selecciona al menos un cliente');
      return;
    }

    const message = customMessage || getMessagePreview();
    if (!message.trim()) {
      toast.error('El mensaje no puede estar vacío');
      return;
    }

    // Validate email subject if channel is email or both
    if ((channel === 'email' || channel === 'both') && !emailSubject.trim()) {
      toast.error('El asunto del email es requerido');
      return;
    }

    // Check if any selected client has email when email channel is selected
    if (channel === 'email' || channel === 'both') {
      const clientsWithEmail = clients.filter(c => 
        selectedClients.includes(c.client_id) && c.email
      );
      if (clientsWithEmail.length === 0) {
        toast.error('Ninguno de los clientes seleccionados tiene email');
        return;
      }
    }

    setSending(true);
    try {
      const response = await marketingAPI.sendCampaign({
        client_ids: selectedClients,
        message: message,
        template_type: selectedTemplate,
        channel: channel,
        subject: emailSubject || undefined
      });

      const result = response.data;

      // Build success message
      let successMsg = '✅ Campaña enviada: ';
      const parts = [];
      
      if (result.whatsapp_sent > 0) {
        parts.push(`${result.whatsapp_sent} WhatsApp${whatsappService.IS_MOCK_MODE ? ' (MOCK)' : ''}`);
      }
      if (result.email_sent > 0) {
        parts.push(`${result.email_sent} Emails`);
      }
      
      successMsg += parts.join(', ');
      toast.success(successMsg);

      // Reset form
      setSelectedClients([]);
      setCustomMessage('');
      setEmailSubject('');
    } catch (error) {
      console.error('Error sending campaign:', error);
      toast.error(error.response?.data?.detail || 'Error al enviar campaña');
    } finally {
      setSending(false);
    }
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
                Campañas de Marketing
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Client Selection */}
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/20 flex items-center justify-center">
                  <Users size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Seleccionar Clientes</h2>
                  <p className="text-sm text-zinc-400">
                    {selectedClients.length} de {clients.length} seleccionados
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all text-sm"
              >
                <CheckSquare size={16} strokeWidth={1.5} />
                {selectedClients.length === clients.length ? 'Desmarcar' : 'Seleccionar'} Todo
              </button>
            </div>

            {clients.length === 0 ? (
              <div className="text-center py-12">
                <BellOff size={48} className="text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">No hay clientes con notificaciones activadas</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {clients.map((client) => (
                  <label
                    key={client.client_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-[var(--app-border)] hover:bg-white/10 cursor-pointer transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClients.includes(client.client_id)}
                      onChange={() => handleToggleClient(client.client_id)}
                      className="w-5 h-5 rounded border-[var(--app-border)] bg-white/5 text-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20"
                    />
                    <div className="flex-1">
                      <div className="text-[var(--app-text-primary)] font-medium">{client.name}</div>
                      <div className="text-sm text-zinc-400">{client.phone}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-green-400" />
                      <span className="text-xs text-zinc-500">{client.total_visits} visitas</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel - Message Composer */}
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <MessageSquare size={20} strokeWidth={1.5} className="text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Componer Mensaje</h2>
                <p className="text-sm text-zinc-400">Selecciona una plantilla o escribe tu mensaje</p>
              </div>
            </div>

            {/* Template Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Plantilla de mensaje
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.APPOINTMENT_REMINDER)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER
                      ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-[var(--app-text-primary)]'
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
                      ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-[var(--app-text-primary)]'
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
                      ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-[var(--app-text-primary)]'
                      : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  <div className="font-medium mb-1">🎉 Promoción</div>
                  <div className="text-xs opacity-75">Oferta especial</div>
                </button>
              </div>
            </div>

            {/* Message Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Vista previa del mensaje
              </label>
              <div className="bg-white/5 border border-[var(--app-border)] rounded-xl p-4 min-h-[120px]">
                <pre className="text-zinc-300 text-sm whitespace-pre-wrap font-sans">
                  {getMessagePreview()}
                </pre>
              </div>
              {whatsappService.IS_MOCK_MODE && (
                <div className="mt-3 flex items-start gap-2 text-xs text-yellow-400">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>Modo MOCK: Los mensajes se mostrarán en consola (no se enviarán por WhatsApp real)</span>
                </div>
              )}
            </div>

            {/* Custom Message */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Mensaje personalizado (opcional)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Escribe un mensaje personalizado o usa la plantilla..."
                className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all resize-none"
                rows={6}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendCampaign}
              disabled={sending || selectedClients.length === 0}
              className="w-full py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Enviando campaña...
                </>
              ) : (
                <>
                  <Send size={18} strokeWidth={1.5} />
                  Enviar a {selectedClients.length} cliente{selectedClients.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketingCampaigns;

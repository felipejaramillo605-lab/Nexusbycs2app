import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clientAPI, organizationAPI, marketingAPI, serviceAPI, templateAPI } from '../api';
import { Send, ArrowLeft, LogOut, Users, MessageSquare, CheckSquare, Loader2, Bell, BellOff, AlertCircle, Mail, MessageCircle, Cake, Gift, Settings2, FileText, Plus, Pencil, Copy, Trash2, X } from 'lucide-react';
import { AccessibleModal } from '../components/design';
import { toast } from 'sonner';
import whatsappService, { MESSAGE_TEMPLATES, VERTICAL_LABELS, generateReactivationMessageFor, generateBirthdayMessage } from '../services/whatsappService';

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
  const [businessType, setBusinessType] = useState('barbershop');
  const [channel, setChannel] = useState('whatsapp'); // 'whatsapp', 'email', 'both'
  const [emailSubject, setEmailSubject] = useState('');
  // NEXUS_CLIENT_BIRTHDAY_V1
  const [audience, setAudience] = useState('all'); // 'all' | 'birthdays'
  const [birthdayClients, setBirthdayClients] = useState([]);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);
  // NEXUS_BIRTHDAY_CAMPAIGN_V1
  const [campaign, setCampaign] = useState(null); // organization.birthday_campaign, cargado del backend
  const [campaignDraft, setCampaignDraft] = useState(null); // copia editable
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [orgServices, setOrgServices] = useState([]);
  // NEXUS_MESSAGE_TEMPLATES_V1
  const [templates, setTemplates] = useState([]);
  const [templateVars, setTemplateVars] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null = nueva
  const [templateForm, setTemplateForm] = useState({ name: '', purpose: 'custom', subject: '', body: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Get org_id from query param (for owner) or user.organization_id (for manager)
  const organizationId = (user?.role === 'owner' ? searchParams.get('org_id') : user?.organization_id) || user?.organization_id;

  const loadOrganizationName = useCallback(async () => {
    if (!organizationId) return;
    try {
      const orgsRes = await organizationAPI.getAll();
      const org = orgsRes.data.find(o => o.organization_id === organizationId);
      if (org) {
        setOrganizationName(org.name);
        setBusinessType(org.business_type || 'barbershop');
        // NEXUS_BIRTHDAY_CAMPAIGN_V1
        const c = org.birthday_campaign || { enabled: false, days_before: 7, reward_type: 'percentage', percentage: 10, free_service_ids: [], reward_expires_days: 30 };
        setCampaign(c);
        setCampaignDraft(c);
      }
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }, [organizationId]);

  // NEXUS_MESSAGE_TEMPLATES_V1
  const loadTemplates = useCallback(async () => {
    if (!organizationId) return;
    setLoadingTemplates(true);
    try {
      const response = await templateAPI.list(organizationId);
      setTemplates(response.data?.items || []);
      setTemplateVars(response.data?.variables || []);
    } catch (error) {
      toast.error('No fue posible cargar las plantillas');
    } finally {
      setLoadingTemplates(false);
    }
  }, [organizationId]);

  // NEXUS_BIRTHDAY_CAMPAIGN_V1
  const loadOrgServices = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await serviceAPI.getAll({ organization_id: organizationId });
      setOrgServices(response.data || []);
    } catch (error) {
      console.error('Error loading services:', error);
    }
  }, [organizationId]);

  // NEXUS_CLIENT_BIRTHDAY_V1
  const loadBirthdays = useCallback(async () => {
    if (!organizationId) return;
    setLoadingBirthdays(true);
    try {
      const response = await clientAPI.getUpcomingBirthdays({ organization_id: organizationId, days: 30 });
      setBirthdayClients(response.data || []);
    } catch (error) {
      toast.error('No fue posible cargar los próximos cumpleaños');
    } finally {
      setLoadingBirthdays(false);
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
      loadBirthdays();
      loadOrgServices();
      loadTemplates();
    }
  }, [organizationId, loadClients, loadOrganizationName, loadBirthdays, loadOrgServices, loadTemplates]);

  // NEXUS_MESSAGE_TEMPLATES_V1
  const PURPOSE_LABELS = { birthday: 'Cumpleaños', reactivation: 'Reactivación', promotion: 'Promoción', welcome: 'Bienvenida', custom: 'Personalizada' };
  const renderTemplateText = (text) => {
    const clientName = displayedClients[0]?.name || 'Cliente';
    const context = { nombre_cliente: clientName, nombre_negocio: organizationName || 'Nexus', codigo_descuento: 'CUMPLE-XXXXXX', fecha_expiracion: '--', link_reserva: '[BOOKING_LINK]' };
    return (text || '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key) => (key in context ? context[key] : match));
  };

  const openNewTemplate = () => { setEditingTemplate(null); setTemplateForm({ name: '', purpose: 'custom', subject: '', body: '' }); setShowTemplateEditor(true); };
  const openEditTemplate = (tpl) => { setEditingTemplate(tpl); setTemplateForm({ name: tpl.name, purpose: tpl.purpose, subject: tpl.subject || '', body: tpl.body }); setShowTemplateEditor(true); };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.body.trim()) {
      toast.error('Nombre y contenido son obligatorios');
      return;
    }
    setSavingTemplate(true);
    try {
      if (editingTemplate) {
        await templateAPI.update(editingTemplate.template_id, { name: templateForm.name.trim(), subject: templateForm.subject.trim(), body: templateForm.body.trim() });
        toast.success('Plantilla actualizada');
      } else {
        await templateAPI.create(organizationId, { channel: 'email', purpose: templateForm.purpose, name: templateForm.name.trim(), subject: templateForm.subject.trim(), body: templateForm.body.trim() });
        toast.success('Plantilla creada');
      }
      setShowTemplateEditor(false);
      await loadTemplates();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible guardar la plantilla');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDuplicateTemplate = async (tpl) => {
    try {
      await templateAPI.duplicate(tpl.template_id);
      toast.success('Plantilla duplicada');
      await loadTemplates();
    } catch (error) {
      toast.error('No fue posible duplicar la plantilla');
    }
  };

  const handleDeleteTemplate = async (tpl) => {
    if (!window.confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) return;
    try {
      await templateAPI.delete(tpl.template_id);
      toast.success('Plantilla eliminada');
      await loadTemplates();
    } catch (error) {
      toast.error('No fue posible eliminar la plantilla');
    }
  };

  const handleUseTemplate = (tpl) => {
    setCustomMessage(renderTemplateText(tpl.body));
    if (tpl.subject) setEmailSubject(renderTemplateText(tpl.subject));
    toast.success(`Plantilla "${tpl.name}" cargada en el mensaje`);
  };

  const insertVariable = (variable) => {
    setTemplateForm(prev => ({ ...prev, body: `${prev.body}{{${variable}}}` }));
  };

  // NEXUS_BIRTHDAY_CAMPAIGN_V1
  const campaignDirty = campaign && campaignDraft && JSON.stringify(campaign) !== JSON.stringify(campaignDraft);

  const toggleFreeService = (serviceId) => {
    setCampaignDraft(prev => ({
      ...prev,
      free_service_ids: (prev.free_service_ids || []).includes(serviceId)
        ? prev.free_service_ids.filter(id => id !== serviceId)
        : [...(prev.free_service_ids || []), serviceId],
    }));
  };

  const handleSaveCampaign = async () => {
    if (campaignDraft.reward_type === 'percentage' && (!campaignDraft.percentage || campaignDraft.percentage <= 0 || campaignDraft.percentage > 100)) {
      toast.error('El porcentaje debe estar entre 1 y 100');
      return;
    }
    if (campaignDraft.reward_type === 'free_services' && (campaignDraft.free_service_ids || []).length === 0) {
      toast.error('Selecciona al menos un servicio para regalar');
      return;
    }
    setSavingCampaign(true);
    try {
      const response = await organizationAPI.update(organizationId, { birthday_campaign: campaignDraft });
      const saved = response.data.birthday_campaign;
      setCampaign(saved);
      setCampaignDraft(saved);
      toast.success('Campaña de cumpleaños actualizada');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible guardar la campaña');
    } finally {
      setSavingCampaign(false);
    }
  };

  const displayedClients = audience === 'birthdays' ? birthdayClients : clients;

  const handleToggleClient = (clientId) => {
    setSelectedClients(prev => 
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const handleSelectAll = () => {
    if (selectedClients.length === displayedClients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(displayedClients.map(c => c.client_id));
    }
  };

  const getMessagePreview = () => {
    if (customMessage) return customMessage;

    const clientName = displayedClients[0]?.name || 'Cliente';

    if (selectedTemplate === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER) {
      return `🔔 *Recordatorio de Cita*\n\n¡Hola ${clientName}!\n\nTu cita es próximamente.\nNo faltes! 💈`;
    } else if (selectedTemplate === MESSAGE_TEMPLATES.BIRTHDAY) {
      return generateBirthdayMessage(clientName, organizationName || 'Nexus').replace('\n[BOOKING_LINK]', '');
    } else if (selectedTemplate === MESSAGE_TEMPLATES.REACTIVATION) {
      return generateReactivationMessageFor(clientName, businessType).replace('\n\nAgenda tu cita aquí:\n[BOOKING_LINK]', '');
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
      const clientsWithEmail = displayedClients.filter(c => 
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
                <div className="w-10 h-10 rounded-xl bg-[var(--app-primary)]/20 flex items-center justify-center">
                  <Users size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Seleccionar Clientes</h2>
                  <p className="text-sm text-zinc-400">
                    {selectedClients.length} de {displayedClients.length} seleccionados
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all text-sm"
              >
                <CheckSquare size={16} strokeWidth={1.5} />
                {selectedClients.length === displayedClients.length ? 'Desmarcar' : 'Seleccionar'} Todo
              </button>
            </div>

            {/* NEXUS_CLIENT_BIRTHDAY_V1 — audience toggle */}
            <div className="flex gap-2 mb-4">
              <button
                data-testid="marketing-audience-all"
                onClick={() => { setAudience('all'); setSelectedClients([]); }}
                className={`flex-1 py-2 rounded-lg text-sm border transition-all ${audience === 'all' ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'bg-white/5 border-[var(--app-border)] text-zinc-400'}`}
              >
                Todos los clientes
              </button>
              <button
                data-testid="marketing-audience-birthdays"
                onClick={() => { setAudience('birthdays'); setSelectedClients([]); setSelectedTemplate(MESSAGE_TEMPLATES.BIRTHDAY); }}
                className={`flex-1 py-2 rounded-lg text-sm border transition-all flex items-center justify-center gap-1.5 ${audience === 'birthdays' ? 'bg-pink-500/20 border-pink-500 text-[var(--app-text-primary)]' : 'bg-white/5 border-[var(--app-border)] text-zinc-400'}`}
              >
                <Cake size={14} /> Cumpleaños próximos ({birthdayClients.length})
              </button>
            </div>

            {loadingBirthdays && audience === 'birthdays' ? (
              <div className="text-center py-12 text-zinc-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Cargando cumpleaños...</div>
            ) : displayedClients.length === 0 ? (
              <div className="text-center py-12">
                <BellOff size={48} className="text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">{audience === 'birthdays' ? 'Sin cumpleaños en los próximos 30 días' : 'No hay clientes con notificaciones activadas'}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {displayedClients.map((client) => (
                  <label
                    key={client.client_id}
                    data-testid="marketing-client-row"
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-[var(--app-border)] hover:bg-white/10 cursor-pointer transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClients.includes(client.client_id)}
                      onChange={() => handleToggleClient(client.client_id)}
                      className="w-5 h-5 rounded border-[var(--app-border)] bg-white/5 text-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary)]/20"
                    />
                    <div className="flex-1">
                      <div className="text-[var(--app-text-primary)] font-medium">{client.name}</div>
                      <div className="text-sm text-zinc-400">{client.phone}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {audience === 'birthdays' ? (
                        <span className="text-xs text-pink-400">{client.days_until === 0 ? 'Hoy 🎉' : `en ${client.days_until} día${client.days_until !== 1 ? 's' : ''}`}</span>
                      ) : (
                        <><Bell size={14} className="text-green-400" /><span className="text-xs text-zinc-500">{client.total_visits} visitas</span></>
                      )}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  data-testid="marketing-template-birthday"
                  onClick={() => setSelectedTemplate(MESSAGE_TEMPLATES.BIRTHDAY)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    selectedTemplate === MESSAGE_TEMPLATES.BIRTHDAY
                      ? 'bg-pink-500/20 border-pink-500 text-[var(--app-text-primary)]'
                      : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  <div className="font-medium mb-1">🎂 Cumpleaños</div>
                  <div className="text-xs opacity-75">Felicitación de cumpleaños</div>
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
                className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-500 focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary)]/20 outline-none transition-all resize-none"
                rows={6}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendCampaign}
              disabled={sending || selectedClients.length === 0}
              className="w-full py-3 rounded-xl bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-text-primary)] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

        {/* NEXUS_BIRTHDAY_CAMPAIGN_V1 — configuración de la campaña de cumpleaños */}
        {campaignDraft && (
          <div className="mt-6 backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
                  <Gift size={20} strokeWidth={1.5} className="text-pink-400" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Campaña de cumpleaños</h2>
                  <p className="text-sm text-zinc-400">Pide la fecha de cumpleaños al registrarse y regala algo automáticamente</p>
                </div>
              </div>
              <button
                data-testid="birthday-campaign-toggle"
                onClick={() => setCampaignDraft(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${campaignDraft.enabled ? 'bg-pink-500' : 'bg-zinc-700'}`}
                title={campaignDraft.enabled ? 'Campaña activa' : 'Campaña desactivada'}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${campaignDraft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {campaignDraft.enabled && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-400 mb-2 block">Avisar al manager con</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={60}
                        value={campaignDraft.days_before}
                        onChange={(e) => setCampaignDraft(prev => ({ ...prev, days_before: Number(e.target.value) || 1 }))}
                        className="w-24 px-3 py-2.5 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]"
                      />
                      <span className="text-sm text-zinc-400">día(s) de anticipación</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-400 mb-2 block">El código de regalo vence en</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={365}
                        value={campaignDraft.reward_expires_days}
                        onChange={(e) => setCampaignDraft(prev => ({ ...prev, reward_expires_days: Number(e.target.value) || 1 }))}
                        className="w-24 px-3 py-2.5 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]"
                      />
                      <span className="text-sm text-zinc-400">día(s)</span>
                    </div>
                  </label>
                </div>

                <div>
                  <span className="text-sm font-medium text-zinc-400 mb-2 block">Tipo de regalo</span>
                  <div className="flex gap-2 mb-4">
                    <button
                      data-testid="birthday-reward-type-percentage"
                      onClick={() => setCampaignDraft(prev => ({ ...prev, reward_type: 'percentage' }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm border transition-all ${campaignDraft.reward_type === 'percentage' ? 'bg-pink-500/20 border-pink-500 text-[var(--app-text-primary)]' : 'bg-white/5 border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Descuento por porcentaje
                    </button>
                    <button
                      data-testid="birthday-reward-type-free-services"
                      onClick={() => setCampaignDraft(prev => ({ ...prev, reward_type: 'free_services' }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm border transition-all ${campaignDraft.reward_type === 'free_services' ? 'bg-pink-500/20 border-pink-500 text-[var(--app-text-primary)]' : 'bg-white/5 border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Servicio(s) de regalo
                    </button>
                  </div>

                  {campaignDraft.reward_type === 'percentage' ? (
                    <label className="block max-w-xs">
                      <span className="text-sm text-zinc-400 mb-2 block">Porcentaje de descuento</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={1} max={100}
                          value={campaignDraft.percentage}
                          onChange={(e) => setCampaignDraft(prev => ({ ...prev, percentage: Number(e.target.value) || 0 }))}
                          className="w-24 px-3 py-2.5 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]"
                        />
                        <span className="text-sm text-zinc-400">%</span>
                      </div>
                    </label>
                  ) : (
                    <div>
                      <p className="text-sm text-zinc-400 mb-3">Elige qué servicios de tu catálogo puede regalar este código (el cliente igual paga la propina y cualquier producto extra):</p>
                      {orgServices.length === 0 ? (
                        <p className="text-sm text-zinc-500">No tienes servicios en el catálogo todavía.</p>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {orgServices.map(s => (
                            <button
                              key={s.service_id}
                              onClick={() => toggleFreeService(s.service_id)}
                              className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${(campaignDraft.free_service_ids || []).includes(s.service_id) ? 'bg-pink-500/10 border-pink-500/30 text-pink-300' : 'bg-white/5 border-[var(--app-border)] text-zinc-400'}`}
                            >
                              <span className="truncate">{s.name}</span>
                              {(campaignDraft.free_service_ids || []).includes(s.service_id) && <CheckSquare size={14} className="shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              {campaignDirty && (
                <button onClick={() => setCampaignDraft(campaign)} className="px-4 py-2 text-sm text-zinc-400 hover:text-[var(--app-text-primary)]">
                  Descartar cambios
                </button>
              )}
              <button
                data-testid="birthday-campaign-save"
                onClick={handleSaveCampaign}
                disabled={savingCampaign || !campaignDirty}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 text-white font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingCampaign ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
                Guardar campaña
              </button>
            </div>
          </div>
        )}

        {/* NEXUS_MESSAGE_TEMPLATES_V1 — plantillas de correo, editables por el manager */}
        <div className="mt-6 backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--app-primary)]/20 flex items-center justify-center">
                <FileText size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Plantillas de correo</h2>
                <p className="text-sm text-zinc-400">Personaliza los mensajes que se envían, o crea los tuyos con variables</p>
              </div>
            </div>
            <button
              data-testid="template-new-button"
              onClick={openNewTemplate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-text-primary)] text-sm font-medium transition-all"
            >
              <Plus size={16} strokeWidth={1.5} /> Nueva plantilla
            </button>
          </div>

          {loadingTemplates ? (
            <p className="text-sm text-zinc-400">Cargando plantillas...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin plantillas todavía.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {templates.map(tpl => (
                <div key={tpl.template_id} className="p-4 rounded-xl bg-white/5 border border-[var(--app-border)] flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--app-text-primary)] font-medium">{tpl.name}</span>
                        {tpl.is_default && <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">De fábrica</span>}
                      </div>
                      <span className="text-xs text-zinc-500">{PURPOSE_LABELS[tpl.purpose] || tpl.purpose}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-line">{renderTemplateText(tpl.body)}</p>
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[var(--app-border)]">
                    <button onClick={() => handleUseTemplate(tpl)} className="flex-1 text-xs px-3 py-2 rounded-lg bg-[var(--app-primary)]/20 hover:bg-[var(--app-primary)]/30 border border-[var(--app-primary)]/30 text-[var(--app-primary)] font-medium">
                      Usar en campaña
                    </button>
                    {!tpl.is_default && (
                      <button onClick={() => openEditTemplate(tpl)} title="Editar" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-zinc-400">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDuplicateTemplate(tpl)} title="Duplicar" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-zinc-400">
                      <Copy size={14} />
                    </button>
                    {!tpl.is_default && (
                      <button onClick={() => handleDeleteTemplate(tpl)} title="Eliminar" className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NEXUS_MESSAGE_TEMPLATES_V1 — editor */}
        {showTemplateEditor && (
          <AccessibleModal
            open={showTemplateEditor}
            onClose={() => !savingTemplate && setShowTemplateEditor(false)}
            labelledBy="template-editor-title"
            describedBy="template-editor-description"
            panelClassName="w-full max-w-2xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-6 max-h-[95vh] overflow-y-auto"
          >
            <div className="flex justify-between mb-5">
              <div>
                <h2 id="template-editor-title" className="text-xl text-[var(--app-text-primary)]">{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                <p id="template-editor-description" className="text-sm text-zinc-400">Usa variables como {'{{nombre_cliente}}'} y se reemplazan automáticamente al enviar</p>
              </div>
              <button onClick={() => setShowTemplateEditor(false)} disabled={savingTemplate}><X className="text-zinc-400" size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm text-zinc-400">Nombre
                  <input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} maxLength={80} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" />
                </label>
                {!editingTemplate && (
                  <label className="block text-sm text-zinc-400">Tipo
                    <select value={templateForm.purpose} onChange={(e) => setTemplateForm({ ...templateForm, purpose: e.target.value })} className="mt-2 w-full p-3 bg-[#18181b] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]">
                      <option value="custom" style={{ background: '#18181b' }}>Personalizada</option>
                      <option value="birthday" style={{ background: '#18181b' }}>Cumpleaños</option>
                      <option value="reactivation" style={{ background: '#18181b' }}>Reactivación</option>
                      <option value="promotion" style={{ background: '#18181b' }}>Promoción</option>
                      <option value="welcome" style={{ background: '#18181b' }}>Bienvenida</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="block text-sm text-zinc-400">Asunto del correo
                <input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} maxLength={200} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" />
              </label>
              <div>
                <span className="text-sm text-zinc-400 mb-2 block">Variables disponibles (clic para insertar)</span>
                <div className="flex flex-wrap gap-2 mb-3">
                  {templateVars.map(v => (
                    <button key={v} type="button" onClick={() => insertVariable(v)} className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-xs text-zinc-300 font-mono">
                      {'{{' + v + '}}'}
                    </button>
                  ))}
                </div>
                <label className="block text-sm text-zinc-400">Contenido
                  <textarea value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} rows={8} maxLength={4000} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] resize-none font-mono text-sm" />
                </label>
              </div>
              {templateForm.body && (
                <div className="p-3 rounded-xl bg-white/5 border border-[var(--app-border)]">
                  <span className="text-xs text-zinc-500 block mb-1">Vista previa</span>
                  <p className="text-sm text-zinc-300 whitespace-pre-line">{renderTemplateText(templateForm.body)}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowTemplateEditor(false)} disabled={savingTemplate} className="px-4 py-2 text-zinc-300">Cancelar</button>
                <button onClick={handleSaveTemplate} disabled={savingTemplate} className="px-4 py-2 rounded-xl bg-[var(--app-primary)] text-[var(--app-text-primary)] disabled:opacity-50 flex items-center gap-2">
                  {savingTemplate && <Loader2 size={16} className="animate-spin" />} Guardar plantilla
                </button>
              </div>
            </div>
          </AccessibleModal>
        )}
      </div>
    </div>
  );
};

export default MarketingCampaigns;
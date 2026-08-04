import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { barberAPI, organizationAPI, serviceAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Users, Edit2, Clock, Calendar, Mail } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { confirmAction } from '../components/design';

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const createEmptyBarber = () => ({
  name: '',
  first_name: '',
  last_name: '',
  display_name: '',
  phone: '',
  address: '',
  bio: '',
  avatar: '',
  active: true,
  available_days: [1, 2, 3, 4, 5],
  start_time: '09:00',
  end_time: '18:00',
  service_ids: []
});

const ProfileForm = ({ value, onChange, services, saving, actionLabel, onSubmit }) => {
  const setField = (field, fieldValue) => onChange({ ...value, [field]: fieldValue });
  const toggleDay = (day) => {
    const selected = value.available_days || [];
    setField(
      'available_days',
      selected.includes(day) ? selected.filter((item) => item !== day) : [...selected, day]
    );
  };
  const toggleService = (serviceId) => {
    const selected = value.service_ids || [];
    setField(
      'service_ids',
      selected.includes(serviceId) ? selected.filter((item) => item !== serviceId) : [...selected, serviceId]
    );
  };
  const inputClass = 'w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-zinc-600 focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none';

  return (
    <div className="space-y-6 mt-4">
      <section>
        <h3 className="text-sm font-medium text-[var(--app-text-primary)] mb-3">Información personal</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
            <input type="text" value={value.first_name || ''} onChange={(event) => setField('first_name', event.target.value)} className={inputClass} placeholder="Juan" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Apellido</label>
            <input type="text" value={value.last_name || ''} onChange={(event) => setField('last_name', event.target.value)} className={inputClass} placeholder="Pérez" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400 mb-2 block">Nombre visible</label>
            <input type="text" value={value.display_name || ''} onChange={(event) => setField('display_name', event.target.value)} className={inputClass} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Teléfono</label>
            <input type="tel" value={value.phone || ''} onChange={(event) => setField('phone', event.target.value)} className={inputClass} placeholder="+57 300 000 0000" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Dirección</label>
            <input type="text" value={value.address || ''} onChange={(event) => setField('address', event.target.value)} className={inputClass} placeholder="Opcional" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400 mb-2 flex justify-between"><span>Biografía profesional</span><span>{(value.bio || '').length}/500</span></label>
            <textarea value={value.bio || ''} onChange={(event) => setField('bio', event.target.value.slice(0, 500))} className={`${inputClass} min-h-[100px] resize-y`} placeholder="Experiencia, especialidades y estilo profesional" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400 mb-2 block">URL de avatar <span className="text-zinc-600">(temporal)</span></label>
            <input type="url" value={value.avatar || ''} onChange={(event) => setField('avatar', event.target.value)} className={inputClass} placeholder="https://..." />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-[var(--app-text-primary)] mb-3">Disponibilidad</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {DAYS.map((day) => (
            <button key={day.value} type="button" onClick={() => toggleDay(day.value)} className={`px-3 py-2 rounded-lg border text-sm transition-all ${(value.available_days || []).includes(day.value) ? 'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-[#5EB1FF]' : 'bg-white/5 border-[var(--app-border)] text-zinc-400 hover:bg-white/10'}`}>
              {day.label}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Hora inicio</label>
            <input type="time" value={value.start_time || '09:00'} onChange={(event) => setField('start_time', event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Hora fin</label>
            <input type="time" value={value.end_time || '18:00'} onChange={(event) => setField('end_time', event.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-[var(--app-text-primary)] mb-3">Servicios que presta</h3>
        {services.length === 0 ? (
          <p className="text-sm text-zinc-500 rounded-xl border border-[var(--app-border)] bg-white/3 p-4">No hay servicios creados en esta barbería.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {services.map((service) => (
              <label key={service.service_id} className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-white/3 p-3 text-sm text-zinc-300 cursor-pointer hover:bg-white/5">
                <input type="checkbox" checked={(value.service_ids || []).includes(service.service_id)} onChange={() => toggleService(service.service_id)} className="accent-[#0A84FF]" />
                <span>{service.name}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <label className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-white/3 p-4">
        <span><span className="block text-sm text-[var(--app-text-primary)]">Perfil activo</span><span className="block text-xs text-zinc-500 mt-1">Los perfiles inactivos no aparecen para nuevas reservas.</span></span>
        <input type="checkbox" checked={value.active !== false} onChange={(event) => setField('active', event.target.checked)} className="h-5 w-5 accent-[#0A84FF]" />
      </label>

      <button type="button" onClick={onSubmit} disabled={saving} className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] rounded-xl font-medium transition-all disabled:opacity-50">
        {saving ? 'Guardando...' : actionLabel}
      </button>
    </div>
  );
};

const ManagerBarbers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [newBarber, setNewBarber] = useState(createEmptyBarber);
  const [editingBarber, setEditingBarber] = useState(null);
  const [selectedBarberForBlock, setSelectedBarberForBlock] = useState(null);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [newBlock, setNewBlock] = useState({ date: '', start_time: '13:00', end_time: '14:00', reason: 'Almuerzo' });
  const [organizationName, setOrganizationName] = useState('');

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

  const loadBarbers = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = { organization_id: organizationId };
      const [barbersResponse, servicesResponse] = await Promise.all([
        barberAPI.getAll(params),
        serviceAPI.getAll(params)
      ]);
      setBarbers(barbersResponse.data);
      setServices(servicesResponse.data);
    } catch (error) {
      console.error('Error loading barbers:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadBarbers();
      loadOrganizationName();
    }
  }, [organizationId, loadBarbers, loadOrganizationName]);

  const loadBlockedTimes = async (barberId) => {
    try {
      const response = await barberAPI.getBlockedTimes(barberId);
      setBlockedTimes(response.data);
    } catch (error) {
      console.error('Error loading blocked times:', error);
      toast.error('Error al cargar horarios bloqueados');
    }
  };

  const validateProfile = (profile) => {
    const displayName = (profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`).trim();
    if (!displayName) return 'El nombre visible es obligatorio';
    if (!profile.phone?.trim()) return 'El teléfono es obligatorio';
    if (!(profile.available_days || []).length) return 'Selecciona al menos un día laboral';
    if (!profile.start_time || !profile.end_time || profile.end_time <= profile.start_time) return 'La hora final debe ser posterior a la hora inicial';
    if ((profile.bio || '').length > 500) return 'La biografía no puede superar 500 caracteres';
    return null;
  };

  const buildPayload = (profile, includeOrganization = false) => {
    const displayName = (profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`).trim();
    return {
      name: displayName,
      first_name: (profile.first_name || '').trim() || null,
      last_name: (profile.last_name || '').trim() || null,
      display_name: displayName,
      phone: (profile.phone || '').trim(),
      address: (profile.address || '').trim() || null,
      bio: (profile.bio || '').trim() || null,
      avatar: (profile.avatar || '').trim() || null,
      active: profile.active !== false,
      available_days: profile.available_days || [],
      start_time: profile.start_time,
      end_time: profile.end_time,
      service_ids: profile.service_ids || [],
      ...(includeOrganization ? { organization_id: organizationId } : {})
    };
  };

  const handleCreate = async () => {
    const validationError = validateProfile(newBarber);
    if (validationError) return toast.error(validationError);
    setSaving(true);
    try {
      await barberAPI.create(buildPayload(newBarber, true));
      setIsCreateDialogOpen(false);
      setNewBarber(createEmptyBarber());
      await loadBarbers();
      toast.success('Barbero creado exitosamente');
    } catch (error) {
      console.error('Error creating barber:', error);
      toast.error(error.response?.data?.detail || 'Error al crear barbero');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (barber) => {
    setEditingBarber({
      barber_id: barber.barber_id,
      name: barber.name || '',
      first_name: barber.first_name || '',
      last_name: barber.last_name || '',
      display_name: barber.display_name || barber.name || '',
      phone: barber.phone || '',
      address: barber.address || '',
      bio: barber.bio || '',
      avatar: barber.avatar || '',
      active: barber.active !== false,
      available_days: barber.available_days || [1, 2, 3, 4, 5],
      start_time: barber.start_time || '09:00',
      end_time: barber.end_time || '18:00',
      service_ids: barber.service_ids || []
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    const validationError = validateProfile(editingBarber);
    if (validationError) return toast.error(validationError);
    setSaving(true);
    try {
      await barberAPI.update(editingBarber.barber_id, buildPayload(editingBarber));
      setIsEditDialogOpen(false);
      setEditingBarber(null);
      await loadBarbers();
      toast.success('Barbero actualizado exitosamente');
    } catch (error) {
      console.error('Error updating barber:', error);
      toast.error(error.response?.data?.detail || 'Error al actualizar barbero');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirmAction('¿Desactivar este barbero? Dejará de aparecer para nuevas reservas, pero se conservarán sus citas y su historial.')) return;
    try {
      await barberAPI.delete(id);
      await loadBarbers();
      toast.success('Barbero desactivado');
    } catch (error) {
      console.error('Error deactivating barber:', error);
      toast.error(error.response?.data?.detail || 'Error al desactivar barbero');
    }
  };

  const handleManageBlocks = (barber) => {
    setSelectedBarberForBlock(barber);
    loadBlockedTimes(barber.barber_id);
    setIsBlockDialogOpen(true);
  };

  const handleCreateBlock = async () => {
    if (!newBlock.date || !newBlock.start_time || !newBlock.end_time) {
      toast.error('Completa todos los campos');
      return;
    }

    try {
      await barberAPI.createBlockedTime(selectedBarberForBlock.barber_id, newBlock);
      setNewBlock({ date: '', start_time: '13:00', end_time: '14:00', reason: 'Almuerzo' });
      loadBlockedTimes(selectedBarberForBlock.barber_id);
      toast.success('Horario bloqueado exitosamente');
    } catch (error) {
      console.error('Error creating blocked time:', error);
      toast.error('Error al bloquear horario');
    }
  };

  const handleDeleteBlock = async (blockId) => {
    try {
      await barberAPI.deleteBlockedTime(selectedBarberForBlock.barber_id, blockId);
      loadBlockedTimes(selectedBarberForBlock.barber_id);
      toast.success('Bloqueo eliminado');
    } catch (error) {
      console.error('Error deleting blocked time:', error);
      toast.error('Error al eliminar bloqueo');
    }
  };

  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="min-h-screen nexus-screen flex items-center justify-center">
        <div className="text-[var(--app-text-primary)] text-lg">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen nexus-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <div className="flex items-center gap-4 mr-auto min-w-0">
            <button
              onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
              className="p-2 rounded-xl bg-white/5 border border-[var(--app-border)] hover:bg-white/10 transition-all text-[var(--app-text-primary)]"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0A84FF] flex items-center justify-center">
                <Users size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-4xl font-light tracking-tight text-[var(--app-text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Barberos
                </h1>
                {organizationName ? (
                  <p className="text-zinc-400 text-sm mt-1">{organizationName}</p>
                ) : (
                  <p className="text-zinc-400 text-sm">Gestiona tu equipo de trabajo</p>
                )}
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => navigate(organizationId ? `/manager/settings?org_id=${organizationId}` : '/manager/settings')}
            className="flex items-center gap-2 px-5 py-3 bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 rounded-xl font-medium transition-all whitespace-nowrap"
            title="Invitar una persona y crear su cuenta de acceso"
          >
            <Mail size={20} strokeWidth={1.5} />
            Invitar por correo
          </button>

          {/* Create Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <button data-testid={MANAGER.addBarberBtn} className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95">
                <Plus size={20} strokeWidth={1.5} />
                Crear manualmente
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-[var(--app-text-primary)]">Crear perfil profesional</DialogTitle></DialogHeader>
              <ProfileForm value={newBarber} onChange={setNewBarber} services={services} saving={saving} actionLabel="Crear Barbero" onSubmit={handleCreate} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)] max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-[var(--app-text-primary)]">Editar perfil profesional</DialogTitle></DialogHeader>
            {editingBarber && <ProfileForm value={editingBarber} onChange={setEditingBarber} services={services} saving={saving} actionLabel="Guardar Cambios" onSubmit={handleUpdate} />}
          </DialogContent>
        </Dialog>

        {/* Blocked Times Dialog */}
        <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
          <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)] max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[var(--app-text-primary)] flex items-center gap-2">
                <Clock size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
                Gestionar Horarios - {selectedBarberForBlock?.name}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 mt-4">
              {/* Create Block Form */}
              <div className="bg-white/3 border border-[var(--app-border)] rounded-xl p-4">
                <h4 className="text-[var(--app-text-primary)] font-medium mb-4">Bloquear Nuevo Horario</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Fecha</label>
                    <input
                      type="date"
                      min={getMinDate()}
                      value={newBlock.date}
                      onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Hora inicio</label>
                      <input
                        type="time"
                        value={newBlock.start_time}
                        onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
                        className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Hora fin</label>
                      <input
                        type="time"
                        value={newBlock.end_time}
                        onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
                        className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Motivo</label>
                    <input
                      type="text"
                      value={newBlock.reason}
                      onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      placeholder="Ej: Almuerzo, Cita personal"
                    />
                  </div>
                  <button
                    onClick={handleCreateBlock}
                    className="w-full px-4 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
                  >
                    Bloquear Horario
                  </button>
                </div>
              </div>

              {/* Blocked Times List */}
              <div>
                <h4 className="text-[var(--app-text-primary)] font-medium mb-4">Horarios Bloqueados</h4>
                {blockedTimes.length === 0 ? (
                  <div className="bg-white/3 border border-[var(--app-border)] rounded-xl p-8 text-center">
                    <Calendar size={32} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No hay horarios bloqueados</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blockedTimes.map((block) => (
                      <div
                        key={block.block_id}
                        className="bg-white/3 border border-[var(--app-border)] rounded-xl p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Calendar size={16} strokeWidth={1.5} className="text-[#0A84FF]" />
                            <span className="text-[var(--app-text-primary)] font-medium">{block.date}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-zinc-400">
                            <Clock size={14} strokeWidth={1.5} />
                            <span>{block.start_time} - {block.end_time}</span>
                            <span className="text-zinc-500">•</span>
                            <span>{block.reason}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteBlock(block.block_id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-all"
                        >
                          <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {barbers.map((barber) => {
            const displayName = barber.display_name || barber.name || 'Barbero';
            const selectedServices = services.filter((service) => (barber.service_ids || []).includes(service.service_id));
            return (
              <div key={barber.barber_id} data-testid={MANAGER.barberCard} className={`backdrop-blur-xl border rounded-2xl p-6 transition-all group ${barber.active === false ? 'bg-zinc-900/40 border-zinc-700/50 opacity-75' : 'bg-white/3 border-[var(--app-border)] hover:bg-white/6'}`}>
                <div className="flex items-start justify-between mb-4">
                  {barber.avatar ? (
                    <img src={barber.avatar} alt="" className="w-16 h-16 rounded-full object-cover border border-[var(--app-border)]" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#0A84FF] flex items-center justify-center text-[var(--app-text-primary)] text-xl font-medium">{displayName.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(barber)} className="p-2 rounded-lg bg-white/5 hover:bg-[#0A84FF]/20 text-zinc-400 hover:text-[#0A84FF] transition-all" title="Editar perfil"><Edit2 size={18} strokeWidth={1.5} /></button>
                    {barber.active !== false && <button onClick={() => handleDelete(barber.barber_id)} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-all" title="Desactivar"><Trash2 size={18} strokeWidth={1.5} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[var(--app-text-primary)] font-medium text-lg">{displayName}</h3>
                  <span className={`px-2 py-1 rounded-full text-[11px] ${barber.active === false ? 'bg-zinc-500/20 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{barber.active === false ? 'Inactivo' : 'Activo'}</span>
                </div>
                {barber.phone && <p className="text-sm text-zinc-400 mb-2">{barber.phone}</p>}
                {barber.bio && <p className="text-sm text-zinc-500 line-clamp-2 mb-3">{barber.bio}</p>}
                <div className="text-sm text-zinc-400 mb-3">{barber.start_time || '09:00'} - {barber.end_time || '18:00'}</div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {DAYS.filter((day) => (barber.available_days || [1, 2, 3, 4, 5]).includes(day.value)).map((day) => <span key={day.value} className="px-2 py-1 rounded-md bg-white/5 text-xs text-zinc-400">{day.label}</span>)}
                </div>
                {selectedServices.length > 0 && <div className="flex flex-wrap gap-1.5 mb-4">{selectedServices.map((service) => <span key={service.service_id} className="px-2 py-1 rounded-md bg-purple-500/10 text-xs text-purple-300">{service.name}</span>)}</div>}
                <button onClick={() => handleManageBlocks(barber)} disabled={barber.active === false} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-[var(--app-border)] rounded-xl text-zinc-300 hover:text-[var(--app-text-primary)] transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  <Clock size={16} strokeWidth={1.5} /> Gestionar Horarios
                </button>
              </div>
            );
          })}
        </div>

        {barbers.length === 0 && (
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center">
            <Users size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">No hay barberos registrados</p>
            <p className="text-zinc-500 text-sm">Agrega tu primer barbero para comenzar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerBarbers;

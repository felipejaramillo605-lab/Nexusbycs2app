// NEXUS_8A7D1A_VISIBLE_NEUTRAL_TERMINOLOGY_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { serviceAPI, organizationAPI, inventoryAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Scissors, Edit2, FlaskConical, AlertTriangle, ShieldCheck, X, ImagePlus, Users, CalendarClock, Image as ImageIcon } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { confirmAction, DetailDrawer, EmptyState } from '../components/design';
import { formatCOP as money } from '../lib/currency';

const ManagerServices = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newService, setNewService] = useState({ name: '', duration: 30, price: 0, service_type: 'individual', group_capacity: 8, drop_in_price: '', spot_layout: '', short_description: '' });
  const [editingService, setEditingService] = useState(null);
  const [organizationName, setOrganizationName] = useState('');
  const [recipeService, setRecipeService] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [policy, setPolicy] = useState('WARNING');
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingPresentation, setUploadingPresentation] = useState('');

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

  const loadServices = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = { organization_id: organizationId };
      const response = await serviceAPI.getAll(params);
      setServices(response.data);
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadServices();
      loadOrganizationName();
    }
  }, [organizationId, loadServices, loadOrganizationName]);

  const handleCreate = async () => {
    if (newService.service_type === 'group' && (!newService.group_capacity || newService.group_capacity < 2)) {
      toast.error('La capacidad de un servicio grupal debe ser de al menos 2 cupos');
      return;
    }
    try {
      await serviceAPI.create({
        ...newService,
        drop_in_price: newService.drop_in_price === '' ? null : parseFloat(newService.drop_in_price),
        spot_layout: newService.spot_layout.trim() ? newService.spot_layout.split(',').map(s => s.trim()).filter(Boolean) : null,
        short_description: newService.short_description.trim() || null,
      });
      setIsCreateDialogOpen(false);
      setNewService({ name: '', duration: 30, price: 0, service_type: 'individual', group_capacity: 8, drop_in_price: '', spot_layout: '', short_description: '' });
      loadServices();
      toast.success('Servicio creado exitosamente');
    } catch (error) {
      console.error('Error creating service:', error);
      toast.error('Error al crear servicio');
    }
  };

  const handleEdit = (service) => {
    setEditingService({
      service_id: service.service_id,
      name: service.name,
      duration: service.duration,
      price: service.price,
      photos: service.photos || [],
      short_description: service.short_description || '',
      image_alt: service.image_alt || '',
      image_focal_point: service.image_focal_point || 'center',
      cover_image_url: service.cover_image_url || service.photos?.[0] || '',
      banner_image_url: service.banner_image_url || service.cover_image_url || service.photos?.[0] || '',
      service_type: service.service_type || 'individual',
      group_capacity: service.group_capacity || 8,
      drop_in_price: service.drop_in_price ?? '',
      booking_window_days: service.booking_window_days ?? '',
      cancellation_cutoff_hours: service.cancellation_cutoff_hours ?? '',
      spot_layout: (service.spot_layout || []).join(', ')
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (editingService.service_type === 'group' && (!editingService.group_capacity || editingService.group_capacity < 2)) {
      toast.error('La capacidad de un servicio grupal debe ser de al menos 2 cupos');
      return;
    }
    try {
      await serviceAPI.update(editingService.service_id, {
        name: editingService.name,
        duration: editingService.duration,
        price: editingService.price,
        service_type: editingService.service_type,
        group_capacity: editingService.group_capacity,
        drop_in_price: editingService.drop_in_price === '' ? null : parseFloat(editingService.drop_in_price),
        spot_layout: editingService.spot_layout.trim() ? editingService.spot_layout.split(',').map(s => s.trim()).filter(Boolean) : null,
        booking_window_days: editingService.booking_window_days === '' ? null : Number(editingService.booking_window_days),
        cancellation_cutoff_hours: editingService.cancellation_cutoff_hours === '' ? null : Number(editingService.cancellation_cutoff_hours),
        short_description: editingService.short_description.trim() || null,
        image_alt: editingService.image_alt.trim() || null,
        image_focal_point: editingService.image_focal_point || 'center',
      });
      setIsEditDialogOpen(false);
      setEditingService(null);
      loadServices();
      toast.success('Servicio actualizado exitosamente');
    } catch (error) {
      console.error('Error updating service:', error);
      toast.error('Error al actualizar servicio');
    }
  };


  const openRecipe = async (service) => {
    setRecipeService(service);
    try {
      const [recipeRes, inventoryRes, policyRes] = await Promise.all([
        serviceAPI.getRecipe(service.service_id, { organization_id: organizationId }),
        inventoryAPI.getCatalog({ organization_id: organizationId }),
        serviceAPI.getInventoryPolicy({ organization_id: organizationId })
      ]);
      setRecipe(recipeRes.data);
      setInventory(inventoryRes.data || []);
      setPolicy(policyRes.data.policy || 'WARNING');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible cargar la receta');
      setRecipeService(null);
    }
  };

  const addIngredient = () => {
    const used = new Set((recipe?.lines || []).map(line => line.inventory_item_id));
    const item = inventory.find(row => !used.has(row.item_id) && row.active !== false);
    if (!item) return toast.error('No hay más referencias disponibles');
    setRecipe({ ...recipe, lines: [...(recipe.lines || []), { inventory_item_id: item.item_id, sku_snapshot: item.sku, item_name_snapshot: item.name, unit_snapshot: item.unit, quantity_per_service: 1, unit_cost_snapshot: item.unit_cost || 0, estimated_line_cost: item.unit_cost || 0 }] });
  };

  const updateIngredient = (index, patch) => {
    const lines = [...(recipe?.lines || [])];
    const current = { ...lines[index], ...patch };
    if (patch.inventory_item_id) {
      const item = inventory.find(row => row.item_id === patch.inventory_item_id);
      Object.assign(current, { sku_snapshot: item?.sku, item_name_snapshot: item?.name, unit_snapshot: item?.unit, unit_cost_snapshot: item?.unit_cost || 0 });
    }
    current.estimated_line_cost = Number(current.quantity_per_service || 0) * Number(current.unit_cost_snapshot || 0);
    lines[index] = current;
    setRecipe({ ...recipe, lines });
  };

  const saveRecipe = async () => {
    setRecipeSaving(true);
    try {
      const response = await serviceAPI.saveRecipe(recipeService.service_id, { organization_id: organizationId, notes: recipe?.notes || '', lines: (recipe?.lines || []).map(line => ({ inventory_item_id: line.inventory_item_id, quantity_per_service: Number(line.quantity_per_service) })) });
      setRecipe(response.data);
      toast.success(`Receta v${response.data.version} guardada`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible guardar la receta');
    } finally { setRecipeSaving(false); }
  };

  const changePolicy = async (nextPolicy) => {
    if (nextPolicy === 'STRICT' && !await confirmAction('El modo estricto bloqueará el checkout cuando falten insumos. ¿Deseas activarlo?')) return;
    try {
      await serviceAPI.updateInventoryPolicy({ organization_id: organizationId, policy: nextPolicy });
      setPolicy(nextPolicy);
      toast.success(nextPolicy === 'WARNING' ? 'Modo flexible activado' : 'Modo estricto activado');
    } catch (error) { toast.error(error.response?.data?.detail || 'No fue posible cambiar la política'); }
  };

  const handleDelete = async (id) => {
    if (!await confirmAction('¿Eliminar este servicio?')) return;
    try {
      await serviceAPI.delete(id);
      loadServices();
      toast.success('Servicio eliminado');
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Error al eliminar servicio');
    }
  };

  // NEXUS_SERVICE_PHOTOS_V1 — reuses the catalog's own uploader (max 2 photos)
  const handleUploadServicePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingService) return;
    setUploadingPhoto(true);
    try {
      const response = await serviceAPI.uploadPhoto(editingService.service_id, file, { organization_id: organizationId });
      setEditingService({ ...editingService, photos: response.data.photos });
      loadServices();
      toast.success('Imagen subida');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible subir la imagen');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeleteServicePhoto = async (index) => {
    try {
      const response = await serviceAPI.deletePhoto(editingService.service_id, index, { organization_id: organizationId });
      setEditingService({ ...editingService, photos: response.data.photos });
      loadServices();
      toast.success('Imagen eliminada');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible eliminar la imagen');
    }
  };

  const handleUploadPresentationImage = async (slot, event) => {
    const file = event.target.files?.[0];
    if (!file || !editingService) return;
    setUploadingPresentation(slot);
    try {
      const response = await serviceAPI.uploadPresentationImage(editingService.service_id, slot, file, { organization_id: organizationId });
      const field = slot === 'cover' ? 'cover_image_url' : 'banner_image_url';
      setEditingService(current => current?.service_id === editingService.service_id ? { ...current, [field]: response.data[field] } : current);
      await loadServices();
      toast.success(slot === 'cover' ? 'Portada actualizada' : 'Banner actualizado');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible subir la imagen');
    } finally {
      setUploadingPresentation('');
      event.target.value = '';
    }
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
        <nav aria-label="Servicios" className="flex flex-wrap gap-3 mb-6">
          <span aria-current="page">Catálogo</span>
          <button onClick={() => navigate(`/manager/services/classes?org_id=${encodeURIComponent(organizationId || '')}`)}>Clases</button>
          <button onClick={() => navigate(`/manager/services/classes?tab=plans&org_id=${encodeURIComponent(organizationId || '')}`)}>Membresías</button>
        </nav>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
              className="p-2 rounded-xl bg-white/5 border border-[var(--app-border)] hover:bg-white/10 transition-all text-[var(--app-text-primary)]"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--app-primary)] flex items-center justify-center">
                <Scissors size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-4xl font-light tracking-tight text-[var(--app-text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Servicios
                </h1>
                {organizationName && (
                  <p className="text-zinc-400 text-sm mt-1">{organizationName}</p>
                )}
                <p className="text-zinc-400 text-sm">Gestiona los servicios ofrecidos por tu organización</p>
              </div>
            </div>
          </div>
          
          {/* Create Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <button
                data-testid={MANAGER.addServiceBtn}
                className="flex items-center gap-2 px-6 py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-text-primary)] rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95"
              >
                <Plus size={20} strokeWidth={1.5} />
                Nuevo Servicio
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)]">
              <DialogHeader>
                <DialogTitle className="text-[var(--app-text-primary)]">Crear Servicio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    placeholder="Ej: Consulta inicial"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Duración (minutos)</label>
                  <input
                    type="number"
                    value={newService.duration}
                    onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newService.price}
                    onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Descripción breve</label>
                  <textarea
                    value={newService.short_description}
                    maxLength={280}
                    rows={3}
                    placeholder="Qué hace especial esta clase o servicio"
                    onChange={(e) => setNewService({ ...newService, short_description: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none resize-none"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Se muestra al descubrir una clase. Máximo 280 caracteres.</p>
                </div>
                {/* NEXUS_GROUP_SERVICES_V1 */}
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Tipo de servicio</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="service-type-individual"
                      onClick={() => setNewService({ ...newService, service_type: 'individual' })}
                      className={`p-3 rounded-xl border text-sm transition-all ${newService.service_type === 'individual' ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      data-testid="service-type-group"
                      onClick={() => setNewService({ ...newService, service_type: 'group' })}
                      className={`p-3 rounded-xl border text-sm transition-all ${newService.service_type === 'group' ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Grupal (clase)
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">Un servicio grupal permite que varios clientes reserven el mismo horario, hasta el cupo que definas (ej. clases de pilates, spinning).</p>
                </div>
                {newService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Cupos por clase</label>
                    <input
                      type="number"
                      min="2"
                      data-testid="service-group-capacity"
                      value={newService.group_capacity}
                      onChange={(e) => setNewService({ ...newService, group_capacity: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                  </div>
                )}
                {newService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Precio del día (opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={`Por defecto: ${newService.price || 0}`}
                      value={newService.drop_in_price}
                      onChange={(e) => setNewService({ ...newService, drop_in_price: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                    <p className="text-xs text-zinc-500 mt-1.5">Lo que paga un cliente sin membresía que reserva y asiste pagando el día.</p>
                  </div>
                )}
                {newService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Nombres de los cupos (opcional)</label>
                    <input
                      type="text"
                      placeholder="Bici 1, Bici 2, Bici 3..."
                      value={newService.spot_layout}
                      onChange={(e) => setNewService({ ...newService, spot_layout: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                    <p className="text-xs text-zinc-500 mt-1.5">Separados por coma. Si los defines, el cliente elige un spot al reservar. Vacío = sin selección de spot.</p>
                  </div>
                )}
                <button
                  onClick={handleCreate}
                  className="w-full px-6 py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
                >
                  Crear Servicio
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--app-text-primary)]">Editar Servicio</DialogTitle>
            </DialogHeader>
            {editingService && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={editingService.name}
                    onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Duración (minutos)</label>
                  <input
                    type="number"
                    value={editingService.duration}
                    onChange={(e) => setEditingService({ ...editingService, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingService.price}
                    onChange={(e) => setEditingService({ ...editingService, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                  />
                </div>
                {/* NEXUS_GROUP_SERVICES_V1 */}
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Tipo de servicio</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingService({ ...editingService, service_type: 'individual' })}
                      className={`p-3 rounded-xl border text-sm transition-all ${editingService.service_type === 'individual' ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingService({ ...editingService, service_type: 'group' })}
                      className={`p-3 rounded-xl border text-sm transition-all ${editingService.service_type === 'group' ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'border-[var(--app-border)] text-zinc-400'}`}
                    >
                      Grupal (clase)
                    </button>
                  </div>
                </div>
                {editingService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Cupos por clase</label>
                    <input
                      type="number"
                      min="2"
                      value={editingService.group_capacity}
                      onChange={(e) => setEditingService({ ...editingService, group_capacity: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                  </div>
                )}
                {editingService.service_type === 'group' && (
                  <div className="space-y-3 rounded-2xl border border-[var(--app-border)] p-4 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-[var(--app-text-primary)]"><ImageIcon size={18} /><span className="font-medium">Presentación de la clase</span></div>
                    <p className="text-xs text-zinc-400">Usa una portada 4:3 para el catálogo y un banner horizontal para el detalle. La imagen se optimiza automáticamente.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[['cover', 'Portada', editingService.cover_image_url], ['banner', 'Banner', editingService.banner_image_url]].map(([slot, label, url]) => (
                        <label key={slot} className="relative overflow-hidden min-h-32 rounded-xl border border-dashed border-[var(--app-border)] cursor-pointer focus-within:ring-2 focus-within:ring-[var(--app-primary)] hover:border-[var(--app-primary)] transition-colors">
                          {url ? <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" /> : null}
                          <span className="relative min-h-32 p-3 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent text-white">
                            <strong className="text-sm">{uploadingPresentation === slot ? 'Subiendo…' : label}</strong>
                            <small className="text-xs text-white/80">{url ? 'Reemplazar imagen' : 'Seleccionar imagen'}</small>
                          </span>
                          <input type="file" accept="image/*" className="sr-only" disabled={!!uploadingPresentation} onChange={(event) => handleUploadPresentationImage(slot, event)} />
                        </label>
                      ))}
                    </div>
                    <label className="text-sm text-zinc-400 block">Texto alternativo
                      <input value={editingService.image_alt} maxLength={180} placeholder={editingService.name} onChange={(e) => setEditingService({ ...editingService, image_alt: e.target.value })} className="w-full mt-2 px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] outline-none focus:border-[var(--app-primary)]" />
                    </label>
                    <label className="text-sm text-zinc-400 block">Punto focal
                      <select value={editingService.image_focal_point} onChange={(e) => setEditingService({ ...editingService, image_focal_point: e.target.value })} className="w-full mt-2 px-3 py-2 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] outline-none focus:border-[var(--app-primary)]">
                        <option value="center">Centro</option><option value="top">Parte superior</option><option value="bottom">Parte inferior</option>
                      </select>
                    </label>
                  </div>
                )}
                {editingService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Precio del día (opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={`Por defecto: ${editingService.price || 0}`}
                      value={editingService.drop_in_price}
                      onChange={(e) => setEditingService({ ...editingService, drop_in_price: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                    <p className="text-xs text-zinc-500 mt-1.5">Lo que paga un cliente sin membresía que reserva y asiste pagando el día.</p>
                  </div>
                )}
                {editingService.service_type === 'group' && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Nombres de los cupos (opcional)</label>
                    <input
                      type="text"
                      placeholder="Bici 1, Bici 2, Bici 3..."
                      value={editingService.spot_layout}
                      onChange={(e) => setEditingService({ ...editingService, spot_layout: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none"
                    />
                    <p className="text-xs text-zinc-500 mt-1.5">Separados por coma. Si los defines, el cliente elige un spot al reservar. Vacío = sin selección de spot.</p>
                  </div>
                )}
                {editingService.service_type === 'group' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[['booking_window_days', 'Anticipación máxima (días)'], ['cancellation_cutoff_hours', 'Límite para cancelar (horas)']].map(([field, label]) => (
                      <label key={field} className="text-sm text-zinc-400">{label}
                        <input type="number" min={field === 'booking_window_days' ? 1 : 0} step="1" value={editingService[field]} placeholder="Predeterminado" onChange={e => setEditingService({ ...editingService, [field]: e.target.value })} className="w-full mt-2 px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-xl" />
                      </label>
                    ))}
                  </div>
                )}
                <button
                  disabled={!!uploadingPresentation || uploadingPhoto}
                  onClick={handleUpdate}
                  className="w-full px-6 py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
                >
                  Guardar Cambios
                </button>
                {/* NEXUS_SERVICE_PHOTOS_V1 */}
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Imágenes del servicio (máx. 2)</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(editingService.photos || []).map((url, i) => (
                      <div key={url} className="relative group aspect-square">
                        <img src={url} alt="" className="w-full h-full object-cover rounded-xl border border-[var(--app-border)]" />
                        <button
                          type="button"
                          data-testid={`service-photo-delete-${i}`}
                          onClick={() => handleDeleteServicePhoto(i)}
                          className="absolute top-1 right-1 p-1.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={14} className="text-white" />
                        </button>
                      </div>
                    ))}
                    {(editingService.photos || []).length < 2 && (
                      <label
                        data-testid="service-photo-upload-input"
                        className="aspect-square rounded-xl border border-dashed border-[var(--app-border)] flex flex-col items-center justify-center gap-1 text-zinc-500 cursor-pointer hover:border-[var(--app-primary)] hover:text-[var(--app-primary)] transition-all"
                      >
                        {uploadingPhoto ? <span className="text-xs">Subiendo...</span> : <><ImagePlus size={22} strokeWidth={1.5} /><span className="text-xs">Agregar</span></>}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={handleUploadServicePhoto} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.service_id}
              data-testid={MANAGER.serviceCard}
              className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6 hover:bg-white/6 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--app-primary)]/20 flex items-center justify-center overflow-hidden">
                  {service.photos?.[0] ? <img src={service.photos[0]} alt="" className="w-full h-full object-cover" /> : <Scissors size={24} strokeWidth={1.5} className="text-[var(--app-primary)]" />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openRecipe(service)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300 transition-all opacity-0 group-hover:opacity-100"
                    title="Insumos"
                  >
                    <FlaskConical size={18} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleEdit(service)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-[var(--app-primary)]/20 text-zinc-400 hover:text-[var(--app-primary)] transition-all opacity-0 group-hover:opacity-100"
                    title="Editar"
                  >
                    <Edit2 size={18} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(service.service_id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[var(--app-text-primary)] font-medium text-lg">{service.name}</h3>
                {service.service_type === 'group' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--app-primary)]/15 text-[var(--app-primary)] border border-[var(--app-primary)]/30">
                    <Users size={11} /> {service.group_capacity} cupos
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{service.duration} min</span>
                <span className="text-[var(--app-primary)] font-medium text-lg">${service.price}</span>
              </div>
              {service.service_type === 'group' && (
                <div><button
                  type="button"
                  onClick={() => navigate(`/manager/services/classes?service_id=${encodeURIComponent(service.service_id)}${organizationId ? `&org_id=${encodeURIComponent(organizationId)}` : ''}`)}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-primary)]/40 px-3 py-2 text-sm text-[var(--app-primary)] hover:bg-[var(--app-primary)]/10 transition-colors"
                >
                  <CalendarClock size={16} /> Programar sesión
                </button>
                <button type="button" onClick={() => navigate(`/manager/services/classes?tab=recurring&service_id=${encodeURIComponent(service.service_id)}&org_id=${encodeURIComponent(organizationId || '')}`)} className="mt-2 w-full text-sm text-[var(--app-primary)]">Crear horario recurrente</button></div>
              )}
            </div>
          ))}
        </div>

        {services.length === 0 && (
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center">
            <Scissors size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">No hay servicios creados</p>
            <p className="text-zinc-500 text-sm">Crea tu primer servicio para comenzar</p>
          </div>
        )}


        <DetailDrawer open={!!recipeService} onClose={() => { setRecipeService(null); setRecipe(null); }} title={`Insumos · ${recipeService?.name || ''}`}>
          {!recipe ? <div className="p-6 text-zinc-400">Cargando receta...</div> : <div className="space-y-5 p-1">
            <div className={`rounded-2xl p-4 border ${policy === 'STRICT' ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
              <div className="flex items-center gap-2 text-[var(--app-text-primary)] font-medium">{policy === 'STRICT' ? <ShieldCheck size={18}/> : <AlertTriangle size={18}/>} Control de inventario</div>
              <p className="text-sm text-[var(--app-text-secondary)] mt-1">{policy === 'WARNING' ? 'Flexible: nunca bloquea la prestación ni el cobro; registra advertencias y déficits.' : 'Estricto: bloqueará el checkout cuando falten insumos.'}</p>
              <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => changePolicy('WARNING')} className={`p-2 rounded-xl border ${policy === 'WARNING' ? 'bg-emerald-500/20 border-emerald-500' : 'border-[var(--app-border)]'}`}>Flexible</button><button onClick={() => changePolicy('STRICT')} className={`p-2 rounded-xl border ${policy === 'STRICT' ? 'bg-amber-500/20 border-amber-500' : 'border-[var(--app-border)]'}`}>Estricto</button></div>
            </div>
            <div className="flex justify-between items-end"><div><p className="text-xs text-[var(--app-text-secondary)]">Versión activa</p><p className="text-lg text-[var(--app-text-primary)]">v{recipe.version || 0}</p></div><div className="text-right"><p className="text-xs text-[var(--app-text-secondary)]">Costo estimado</p><p className="text-xl text-[var(--app-primary)]">{money((recipe.lines || []).reduce((sum,line) => sum + Number(line.quantity_per_service || 0) * Number(line.unit_cost_snapshot || 0),0))}</p></div></div>
            {(recipe.lines || []).length === 0 ? <EmptyState title="Sin insumos" description="Agrega referencias para calcular el costo material por servicio"/> : <div className="space-y-3">{recipe.lines.map((line,index) => <div key={`${line.inventory_item_id}-${index}`} className="rounded-2xl border border-[var(--app-border)] p-3 space-y-2"><div className="flex gap-2"><select value={line.inventory_item_id} onChange={e => updateIngredient(index,{inventory_item_id:e.target.value})} className="flex-1 p-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)]">{inventory.filter(item => item.active !== false && (item.item_id === line.inventory_item_id || !(recipe.lines || []).some((used,i) => i !== index && used.inventory_item_id === item.item_id))).map(item => <option key={item.item_id} value={item.item_id}>{item.sku} · {item.name}</option>)}</select><button onClick={() => setRecipe({...recipe,lines:recipe.lines.filter((_,i)=>i!==index)})} className="p-2 text-red-400"><X size={18}/></button></div><div className="grid grid-cols-2 gap-2"><label className="text-xs text-[var(--app-text-secondary)]">Cantidad<input type="number" min="0.0001" step="0.0001" value={line.quantity_per_service} onChange={e => updateIngredient(index,{quantity_per_service:e.target.value})} className="block w-full mt-1 p-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)]"/></label><div className="text-xs text-[var(--app-text-secondary)]">Unidad / costo<div className="mt-1 p-2">{line.unit_snapshot} · {money(line.estimated_line_cost)}</div></div></div></div>)}</div>}
            <button onClick={addIngredient} className="w-full p-3 rounded-xl border border-dashed border-[var(--app-primary)] text-[var(--app-primary)] flex justify-center gap-2"><Plus size={18}/>Agregar insumo</button>
            <textarea value={recipe.notes || ''} onChange={e => setRecipe({...recipe,notes:e.target.value})} placeholder="Notas de la receta" className="w-full p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)]"/>
            <button disabled={recipeSaving} onClick={saveRecipe} className="w-full p-3 rounded-xl bg-[var(--app-primary)] text-white disabled:opacity-50">{recipeSaving ? 'Guardando...' : 'Guardar nueva versión'}</button>
          </div>}
        </DetailDrawer>

      </div>
    </div>
  );
};

export default ManagerServices;

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serviceAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Scissors, Edit2 } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const ManagerServices = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newService, setNewService] = useState({ name: '', duration: 30, price: 0 });
  const [editingService, setEditingService] = useState(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const response = await serviceAPI.getAll();
      setServices(response.data);
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await serviceAPI.create(newService);
      setIsCreateDialogOpen(false);
      setNewService({ name: '', duration: 30, price: 0 });
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
      price: service.price
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    try {
      await serviceAPI.update(editingService.service_id, {
        name: editingService.name,
        duration: editingService.duration,
        price: editingService.price
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

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este servicio?')) return;
    try {
      await serviceAPI.delete(id);
      loadServices();
      toast.success('Servicio eliminado');
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Error al eliminar servicio');
    }
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
            <button
              onClick={() => navigate('/manager/dashboard')}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0A84FF] flex items-center justify-center">
                <Scissors size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-4xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Servicios
                </h1>
                <p className="text-zinc-400 text-sm">Gestiona tus servicios de barbería</p>
              </div>
            </div>
          </div>
          
          {/* Create Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <button
                data-testid={MANAGER.addServiceBtn}
                className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95"
              >
                <Plus size={20} strokeWidth={1.5} />
                Nuevo Servicio
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0A0A0A] border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">Crear Servicio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    placeholder="Ej: Corte de cabello"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Duración (minutos)</label>
                  <input
                    type="number"
                    value={newService.duration}
                    onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newService.price}
                    onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
                >
                  Crear Servicio
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-[#0A0A0A] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Editar Servicio</DialogTitle>
            </DialogHeader>
            {editingService && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={editingService.name}
                    onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Duración (minutos)</label>
                  <input
                    type="number"
                    value={editingService.duration}
                    onChange={(e) => setEditingService({ ...editingService, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingService.price}
                    onChange={(e) => setEditingService({ ...editingService, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <button
                  onClick={handleUpdate}
                  className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
                >
                  Guardar Cambios
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.service_id}
              data-testid={MANAGER.serviceCard}
              className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 hover:bg-white/6 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#0A84FF]/20 flex items-center justify-center">
                  <Scissors size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(service)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-[#0A84FF]/20 text-zinc-400 hover:text-[#0A84FF] transition-all opacity-0 group-hover:opacity-100"
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
              <h3 className="text-white font-medium text-lg mb-2">{service.name}</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{service.duration} min</span>
                <span className="text-[#0A84FF] font-medium text-lg">${service.price}</span>
              </div>
            </div>
          ))}
        </div>

        {services.length === 0 && (
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-12 text-center">
            <Scissors size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">No hay servicios creados</p>
            <p className="text-zinc-500 text-sm">Crea tu primer servicio para comenzar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerServices;
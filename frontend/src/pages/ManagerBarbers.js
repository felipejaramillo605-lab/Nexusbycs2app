import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { barberAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Users, Edit2, Clock, Calendar } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const ManagerBarbers = () => {
  const navigate = useNavigate();
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [newBarber, setNewBarber] = useState({ name: '', avatar: '', available_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' });
  const [editingBarber, setEditingBarber] = useState(null);
  const [selectedBarberForBlock, setSelectedBarberForBlock] = useState(null);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [newBlock, setNewBlock] = useState({ date: '', start_time: '13:00', end_time: '14:00', reason: 'Almuerzo' });

  useEffect(() => {
    loadBarbers();
  }, []);

  const loadBarbers = async () => {
    try {
      const response = await barberAPI.getAll();
      setBarbers(response.data);
    } catch (error) {
      console.error('Error loading barbers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBlockedTimes = async (barberId) => {
    try {
      const response = await barberAPI.getBlockedTimes(barberId);
      setBlockedTimes(response.data);
    } catch (error) {
      console.error('Error loading blocked times:', error);
      toast.error('Error al cargar horarios bloqueados');
    }
  };

  const handleCreate = async () => {
    try {
      await barberAPI.create(newBarber);
      setIsCreateDialogOpen(false);
      setNewBarber({ name: '', avatar: '', available_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' });
      loadBarbers();
      toast.success('Barbero creado exitosamente');
    } catch (error) {
      console.error('Error creating barber:', error);
      toast.error('Error al crear barbero');
    }
  };

  const handleEdit = (barber) => {
    setEditingBarber({
      barber_id: barber.barber_id,
      name: barber.name,
      avatar: barber.avatar,
      available_days: barber.available_days || [1, 2, 3, 4, 5],
      start_time: barber.start_time,
      end_time: barber.end_time
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    try {
      await barberAPI.update(editingBarber.barber_id, {
        name: editingBarber.name,
        avatar: editingBarber.avatar,
        available_days: editingBarber.available_days,
        start_time: editingBarber.start_time,
        end_time: editingBarber.end_time
      });
      setIsEditDialogOpen(false);
      setEditingBarber(null);
      loadBarbers();
      toast.success('Barbero actualizado exitosamente');
    } catch (error) {
      console.error('Error updating barber:', error);
      toast.error('Error al actualizar barbero');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este barbero?')) return;
    try {
      await barberAPI.delete(id);
      loadBarbers();
      toast.success('Barbero eliminado');
    } catch (error) {
      console.error('Error deleting barber:', error);
      toast.error('Error al eliminar barbero');
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
                <Users size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-4xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Barberos
                </h1>
                <p className="text-zinc-400 text-sm">Gestiona tu equipo de trabajo</p>
              </div>
            </div>
          </div>
          
          {/* Create Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <button
                data-testid={MANAGER.addBarberBtn}
                className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95"
              >
                <Plus size={20} strokeWidth={1.5} />
                Nuevo Barbero
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0A0A0A] border-white/10 max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white">Crear Barbero</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={newBarber.name}
                    onChange={(e) => setNewBarber({ ...newBarber, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    placeholder="Ej: Juan Pérez"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Hora inicio</label>
                    <input
                      type="time"
                      value={newBarber.start_time}
                      onChange={(e) => setNewBarber({ ...newBarber, start_time: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Hora fin</label>
                    <input
                      type="time"
                      value={newBarber.end_time}
                      onChange={(e) => setNewBarber({ ...newBarber, end_time: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
                >
                  Crear Barbero
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-[#0A0A0A] border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Editar Barbero</DialogTitle>
            </DialogHeader>
            {editingBarber && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={editingBarber.name}
                    onChange={(e) => setEditingBarber({ ...editingBarber, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Hora inicio</label>
                    <input
                      type="time"
                      value={editingBarber.start_time}
                      onChange={(e) => setEditingBarber({ ...editingBarber, start_time: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Hora fin</label>
                    <input
                      type="time"
                      value={editingBarber.end_time}
                      onChange={(e) => setEditingBarber({ ...editingBarber, end_time: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
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

        {/* Blocked Times Dialog */}
        <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
          <DialogContent className="bg-[#0A0A0A] border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Clock size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
                Gestionar Horarios - {selectedBarberForBlock?.name}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 mt-4">
              {/* Create Block Form */}
              <div className="bg-white/3 border border-white/10 rounded-xl p-4">
                <h4 className="text-white font-medium mb-4">Bloquear Nuevo Horario</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Fecha</label>
                    <input
                      type="date"
                      min={getMinDate()}
                      value={newBlock.date}
                      onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Hora inicio</label>
                      <input
                        type="time"
                        value={newBlock.start_time}
                        onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
                        className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Hora fin</label>
                      <input
                        type="time"
                        value={newBlock.end_time}
                        onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
                        className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Motivo</label>
                    <input
                      type="text"
                      value={newBlock.reason}
                      onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      placeholder="Ej: Almuerzo, Cita personal"
                    />
                  </div>
                  <button
                    onClick={handleCreateBlock}
                    className="w-full px-4 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
                  >
                    Bloquear Horario
                  </button>
                </div>
              </div>

              {/* Blocked Times List */}
              <div>
                <h4 className="text-white font-medium mb-4">Horarios Bloqueados</h4>
                {blockedTimes.length === 0 ? (
                  <div className="bg-white/3 border border-white/10 rounded-xl p-8 text-center">
                    <Calendar size={32} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No hay horarios bloqueados</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blockedTimes.map((block) => (
                      <div
                        key={block.block_id}
                        className="bg-white/3 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Calendar size={16} strokeWidth={1.5} className="text-[#0A84FF]" />
                            <span className="text-white font-medium">{block.date}</span>
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
          {barbers.map((barber) => (
            <div
              key={barber.barber_id}
              data-testid={MANAGER.barberCard}
              className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 hover:bg-white/6 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-xl font-medium">
                  {barber.name.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(barber)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-[#0A84FF]/20 text-zinc-400 hover:text-[#0A84FF] transition-all opacity-0 group-hover:opacity-100"
                    title="Editar"
                  >
                    <Edit2 size={18} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(barber.barber_id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <h3 className="text-white font-medium text-lg mb-2">{barber.name}</h3>
              <div className="text-sm text-zinc-400 mb-4">
                {barber.start_time} - {barber.end_time}
              </div>
              <button
                onClick={() => handleManageBlocks(barber)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-zinc-300 hover:text-white transition-all text-sm"
              >
                <Clock size={16} strokeWidth={1.5} />
                Gestionar Horarios
              </button>
            </div>
          ))}
        </div>

        {barbers.length === 0 && (
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-12 text-center">
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

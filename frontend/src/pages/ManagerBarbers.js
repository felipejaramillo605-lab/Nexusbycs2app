import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { barberAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Users } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

const ManagerBarbers = () => {
  const navigate = useNavigate();
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBarber, setNewBarber] = useState({ name: '', avatar: '', available_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' });

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

  const handleCreate = async () => {
    try {
      await barberAPI.create(newBarber);
      setIsDialogOpen(false);
      setNewBarber({ name: '', avatar: '', available_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' });
      loadBarbers();
    } catch (error) {
      console.error('Error creating barber:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este barbero?')) return;
    try {
      await barberAPI.delete(id);
      loadBarbers();
    } catch (error) {
      console.error('Error deleting barber:', error);
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
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                data-testid={MANAGER.addBarberBtn}
                className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95"
              >
                <Plus size={20} strokeWidth={1.5} />
                Nuevo Barbero
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0A0A0A] border-white/10">
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
                <button
                  onClick={() => handleDelete(barber.barber_id)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} strokeWidth={1.5} />
                </button>
              </div>
              <h3 className="text-white font-medium text-lg mb-2">{barber.name}</h3>
              <div className="text-sm text-zinc-400">
                {barber.start_time} - {barber.end_time}
              </div>
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
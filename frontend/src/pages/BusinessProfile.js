import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Save, Building, MapPin, Clock, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const BusinessProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('org_id') || user?.organization_id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    business_hours: '',
    phone: '',
    whatsapp_link: '',
  });

  const loadOrganization = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/organizations/${organizationId}/public`
      );
      
      if (response.ok) {
        const data = await response.json();
        setFormData({
          name: data.name || '',
          address: data.address || '',
          business_hours: data.business_hours || '',
          phone: data.phone || '',
          whatsapp_link: data.whatsapp_link || '',
        });
      }
    } catch (error) {
      console.error('Error loading organization:', error);
      toast.error('Error al cargar perfil del negocio');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadOrganization();
  }, [loadOrganization]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/organizations/${organizationId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      );

      if (response.ok) {
        toast.success('Perfil actualizado correctamente');
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Error al actualizar el perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <Loader2 size={48} className="text-[#0A84FF] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Perfil del Negocio
              </h1>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Info Card */}
        <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Building size={24} className="text-[#0A84FF]" />
            <h2 className="text-lg font-medium text-white">Información del Negocio</h2>
          </div>
          <p className="text-zinc-400 text-sm">
            Esta información se mostrará a los clientes en el portal de reservas
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <Building size={16} className="inline mr-2" />
              Nombre de la Barbería
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              placeholder="Ej: Barbería Elegante"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <MapPin size={16} className="inline mr-2" />
              Dirección Física
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              placeholder="Ej: Calle 123 #45-67, Bogotá"
            />
          </div>

          {/* Business Hours */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <Clock size={16} className="inline mr-2" />
              Horarios de Atención
            </label>
            <textarea
              value={formData.business_hours}
              onChange={(e) => setFormData({ ...formData, business_hours: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all resize-none"
              rows={3}
              placeholder="Ej: Lunes a Viernes: 9:00 AM - 7:00 PM&#10;Sábados: 9:00 AM - 5:00 PM&#10;Domingos: Cerrado"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Formato libre. Los clientes verán esta información en el portal de reservas.
            </p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <Phone size={16} className="inline mr-2" />
              Teléfono de Contacto
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              placeholder="Ej: +57 300 123 4567"
            />
          </div>

          {/* WhatsApp Link */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <MessageSquare size={16} className="inline mr-2" />
              Link Directo de WhatsApp (Soporte)
            </label>
            <input
              type="url"
              value={formData.whatsapp_link}
              onChange={(e) => setFormData({ ...formData, whatsapp_link: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              placeholder="https://wa.me/573001234567"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Los clientes podrán contactarte directamente desde el portal de reservas
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/manager/dashboard')}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BusinessProfile;

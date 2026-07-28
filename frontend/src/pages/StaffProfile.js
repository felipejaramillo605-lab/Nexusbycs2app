import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, LogOut, Save, Scissors, User, WalletCards } from 'lucide-react';
import { barberAPI, serviceAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const StaffProfile = () => {
  const navigate = useNavigate();
  const { user, logout, checkAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [profileResponse, servicesResponse] = await Promise.all([
          barberAPI.getMyProfile(),
          serviceAPI.getAll({ organization_id: user?.organization_id })
        ]);
        const item = profileResponse.data;
        setProfile({
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          display_name: item.display_name || item.name || '',
          phone: item.phone || '',
          address: item.address || '',
          bio: item.bio || '',
          avatar: item.avatar || '',
          available_days: item.available_days || [1, 2, 3, 4, 5],
          start_time: item.start_time || '09:00',
          end_time: item.end_time || '18:00',
          service_ids: item.service_ids || [],
          active: item.active !== false
        });
        setServices(servicesResponse.data);
      } catch (error) {
        toast.error(error.response?.data?.detail || 'No fue posible cargar tu perfil');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.organization_id]);

  const assignedServices = useMemo(
    () => services.filter((service) => (profile?.service_ids || []).includes(service.service_id)),
    [services, profile?.service_ids]
  );

  const setField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const toggleDay = (day) => {
    const selected = profile.available_days || [];
    setField('available_days', selected.includes(day) ? selected.filter((value) => value !== day) : [...selected, day]);
  };

  const save = async () => {
    const displayName = (profile.display_name || '').trim();
    if (!displayName) return toast.error('El nombre visible es obligatorio');
    if (!profile.phone?.trim()) return toast.error('El teléfono es obligatorio');
    if (!(profile.available_days || []).length) return toast.error('Selecciona al menos un día laboral');
    if (!profile.start_time || !profile.end_time || profile.end_time <= profile.start_time) return toast.error('La hora final debe ser posterior a la hora inicial');
    if ((profile.bio || '').length > 500) return toast.error('La biografía no puede superar 500 caracteres');

    setSaving(true);
    try {
      const response = await barberAPI.updateMyProfile({
        first_name: profile.first_name?.trim() || null,
        last_name: profile.last_name?.trim() || null,
        display_name: displayName,
        phone: profile.phone.trim(),
        address: profile.address?.trim() || null,
        bio: profile.bio?.trim() || null,
        avatar: profile.avatar?.trim() || null,
        available_days: profile.available_days,
        start_time: profile.start_time,
        end_time: profile.end_time
      });
      const updated = response.data;
      setProfile((current) => ({
        ...current,
        first_name: updated.first_name || '',
        last_name: updated.last_name || '',
        display_name: updated.display_name || updated.name || '',
        phone: updated.phone || '',
        address: updated.address || '',
        bio: updated.bio || '',
        avatar: updated.avatar || '',
        available_days: updated.available_days || current.available_days,
        start_time: updated.start_time || current.start_time,
        end_time: updated.end_time || current.end_time
      }));
      await checkAuth();
      toast.success('Perfil actualizado');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible guardar tu perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading || !profile) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Cargando perfil...</div>;
  }

  const inputClass = 'w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white placeholder-zinc-600 focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none';
  const displayName = profile.display_name || 'Profesional';

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-center gap-3 mb-8">
          <button type="button" onClick={() => window.history.back()} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><ArrowLeft size={20} /></button>
          <div className="mr-auto">
            <h1 className="text-3xl sm:text-4xl font-light">Mi perfil profesional</h1>
            <p className="text-zinc-400 text-sm mt-1">Actualiza cómo apareces ante los clientes.</p>
          </div>
          {/* NEXUS_STAFF_INCOME_UI_V1 */}
          {/* NEXUS_STAFF_APPOINTMENTS_UI_V1 */}
          <button type="button" onClick={() => navigate('/staff/appointments')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400"><CalendarDays size={18} /> Mis citas</button>
          <button type="button" onClick={() => navigate('/staff/income')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><WalletCards size={18} /> Mis ingresos</button>
          <button type="button" onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400"><LogOut size={18} /> Cerrar sesión</button>
        </header>

        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="space-y-6 rounded-2xl border border-white/10 bg-white/3 p-5 sm:p-7">
            <section>
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><User size={20} className="text-[#0A84FF]" /> Información personal</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm text-zinc-400">Nombre<input value={profile.first_name} onChange={(event) => setField('first_name', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400">Apellido<input value={profile.last_name} onChange={(event) => setField('last_name', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400 sm:col-span-2">Nombre visible<input value={profile.display_name} onChange={(event) => setField('display_name', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400">Teléfono<input value={profile.phone} onChange={(event) => setField('phone', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400">Dirección<input value={profile.address} onChange={(event) => setField('address', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400 sm:col-span-2">URL de avatar<input value={profile.avatar} onChange={(event) => setField('avatar', event.target.value)} className={`${inputClass} mt-2`} placeholder="https://..." /></label>
                <label className="text-sm text-zinc-400 sm:col-span-2">Biografía <span className="float-right">{profile.bio.length}/500</span><textarea value={profile.bio} onChange={(event) => setField('bio', event.target.value.slice(0, 500))} className={`${inputClass} mt-2 min-h-[110px] resize-y`} /></label>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Clock size={20} className="text-[#0A84FF]" /> Disponibilidad</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {DAYS.map((day) => <button key={day.value} type="button" onClick={() => toggleDay(day.value)} className={`px-3 py-2 rounded-lg border text-sm ${(profile.available_days || []).includes(day.value) ? 'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-[#5EB1FF]' : 'bg-white/5 border-white/10 text-zinc-400'}`}>{day.label}</button>)}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm text-zinc-400">Hora inicio<input type="time" value={profile.start_time} onChange={(event) => setField('start_time', event.target.value)} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-zinc-400">Hora fin<input type="time" value={profile.end_time} onChange={(event) => setField('end_time', event.target.value)} className={`${inputClass} mt-2`} /></label>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2"><Scissors size={20} className="text-purple-300" /> Servicios asignados</h2>
              <p className="text-xs text-zinc-500 mb-3">La administración de la barbería asigna estos servicios.</p>
              <div className="flex flex-wrap gap-2">{assignedServices.length ? assignedServices.map((service) => <span key={service.service_id} className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm">{service.name}</span>) : <span className="text-sm text-zinc-500">No hay servicios asignados.</span>}</div>
            </section>

            <button type="button" onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] disabled:opacity-50"><Save size={18} /> {saving ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/3 p-6 h-fit lg:sticky lg:top-6">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Vista previa pública</p>
            <div className="flex items-start gap-4">
              {profile.avatar ? <img src={profile.avatar} alt="" className="w-20 h-20 rounded-full object-cover border border-white/10" /> : <div className="w-20 h-20 rounded-full bg-[#0A84FF] flex items-center justify-center text-2xl font-medium">{displayName.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0"><h3 className="text-xl font-medium">{displayName}</h3><p className="text-zinc-400 text-sm mt-2">{profile.start_time} - {profile.end_time}</p></div>
            </div>
            {profile.bio && <p className="text-zinc-400 text-sm mt-5 leading-relaxed">{profile.bio}</p>}
            <div className="flex flex-wrap gap-1.5 mt-5">{assignedServices.map((service) => <span key={service.service_id} className="px-2 py-1 rounded-md bg-purple-500/10 text-purple-300 text-xs">{service.name}</span>)}</div>
            {profile.active === false && <p className="mt-5 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">Tu perfil está inactivo. Contacta a la administración.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StaffProfile;

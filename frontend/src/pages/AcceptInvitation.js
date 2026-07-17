import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Loader2, ArrowLeft } from 'lucide-react';
import { publicAPI } from '../api';
import { toast } from 'sonner';

const AcceptInvitation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [validating, setValidating] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ firstName: '', lastName: '', phone: '', address: '', password: '', confirmPassword: '' });

  useEffect(() => {
    let active = true;
    const validate = async () => {
      if (!token) {
        setError('El enlace no contiene una invitación válida');
        setValidating(false);
        return;
      }
      try {
        const response = await publicAPI.validateInvitation(token);
        if (active) setInvitation(response.data);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.detail || 'La invitación es inválida o venció');
      } finally {
        if (active) setValidating(false);
      }
    };
    validate();
    return () => { active = false; };
  }, [token]);

  const validPassword = formData.password.length >= 8 && /[A-Z]/.test(formData.password) && /[0-9]/.test(formData.password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validPassword) return toast.error('La contraseña no cumple los requisitos');
    if (formData.password !== formData.confirmPassword) return toast.error('Las contraseñas no coinciden');
    setLoading(true);
    try {
      await publicAPI.acceptInvitation({
        token,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim() || null,
        password: formData.password,
        confirm_password: formData.confirmPassword
      });
      toast.success('Cuenta creada. Ya puedes iniciar sesión.');
      navigate('/login', { replace: true });
    } catch (requestError) {
      toast.error(requestError.response?.data?.detail || 'No fue posible aceptar la invitación');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none';

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-xl">
        <Link to="/login" className="inline-flex items-center gap-2 mb-6 text-zinc-400 hover:text-white"><ArrowLeft size={18} /> Volver al login</Link>
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-7 sm:p-10">
          {validating ? (
            <div className="py-20 flex items-center justify-center"><Loader2 size={38} className="text-[#0A84FF] animate-spin" /></div>
          ) : error ? (
            <div role="alert" className="text-center py-8"><h1 className="text-2xl text-white mb-3">Invitación no disponible</h1><p className="text-zinc-400">{error}</p></div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-5"><UserPlus className="text-purple-400" /></div>
              <h1 className="text-3xl font-light text-white mb-2">Únete a {invitation.organization_name}</h1>
              <p className="text-zinc-400 text-sm mb-7">Completa tus datos para activar <strong className="text-white">{invitation.email}</strong> como {invitation.role}.</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><label htmlFor="invite-first" className="block text-sm text-zinc-400 mb-2">Nombre</label><input id="invite-first" type="text" autoComplete="given-name" required value={formData.firstName} onChange={(event) => setFormData({ ...formData, firstName: event.target.value })} className={fieldClass} /></div>
                  <div><label htmlFor="invite-last" className="block text-sm text-zinc-400 mb-2">Apellido</label><input id="invite-last" type="text" autoComplete="family-name" required value={formData.lastName} onChange={(event) => setFormData({ ...formData, lastName: event.target.value })} className={fieldClass} /></div>
                </div>
                <div><label htmlFor="invite-phone" className="block text-sm text-zinc-400 mb-2">Teléfono</label><input id="invite-phone" type="tel" autoComplete="tel" required value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className={fieldClass} placeholder="+57 300 000 0000" /></div>
                <div><label htmlFor="invite-address" className="block text-sm text-zinc-400 mb-2">Dirección <span className="text-zinc-600">(opcional)</span></label><input id="invite-address" type="text" autoComplete="street-address" value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} className={fieldClass} /></div>
                <div><label htmlFor="invite-password" className="block text-sm text-zinc-400 mb-2">Contraseña</label><input id="invite-password" type="password" autoComplete="new-password" required value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className={fieldClass} /><p className="text-xs text-zinc-500 mt-2">Mínimo 8 caracteres, una mayúscula y un número.</p></div>
                <div><label htmlFor="invite-confirm" className="block text-sm text-zinc-400 mb-2">Confirmar contraseña</label><input id="invite-confirm" type="password" autoComplete="new-password" required value={formData.confirmPassword} onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })} className={fieldClass} /></div>
                <button type="submit" disabled={loading || !validPassword || formData.password !== formData.confirmPassword} className="w-full h-12 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50">{loading && <Loader2 size={18} className="animate-spin" />}{loading ? 'Creando cuenta...' : 'Aceptar invitación y crear cuenta'}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;

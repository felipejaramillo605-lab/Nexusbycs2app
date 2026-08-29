// NEXUS_AUTH_BRAND_UNIFY_V15: theme tokens instead of hardcoded black/blue.
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authAPI } from '../api';
import { toast } from 'sonner';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const validPassword = formData.password.length >= 8 && /[A-Z]/.test(formData.password) && /[0-9]/.test(formData.password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) return toast.error('El enlace no contiene un token válido');
    if (!validPassword) return toast.error('La contraseña no cumple los requisitos');
    if (formData.password !== formData.confirmPassword) return toast.error('Las contraseñas no coinciden');
    setLoading(true);
    try {
      await authAPI.resetPassword({ token, new_password: formData.password, confirm_password: formData.confirmPassword });
      toast.success('Contraseña actualizada. Inicia sesión nuevamente.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'El enlace es inválido o venció');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 mb-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"><ArrowLeft size={18} /> Volver al login</Link>
        <div className="glass-panel rounded-3xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-6"><Lock className="text-[var(--accent)]" /></div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">Nueva contraseña</h1>
          <p className="text-[var(--text-secondary)] text-sm mb-7">Debe tener mínimo 8 caracteres, una mayúscula y un número.</p>
          {!token ? (
            <div role="alert" className="p-4 rounded-xl bg-[var(--app-danger-soft)] border border-[var(--app-danger)]/30 text-[var(--app-danger)] text-sm">El enlace no es válido. Solicita uno nuevo desde la pantalla de recuperación.</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="reset-password" className="block text-sm text-[var(--text-secondary)] mb-2">Nueva contraseña</label>
                <div className="relative">
                  <input id="reset-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className="w-full px-4 pr-12 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
                </div>
              </div>
              <div>
                <label htmlFor="reset-confirm" className="block text-sm text-[var(--text-secondary)] mb-2">Confirmar contraseña</label>
                <input id="reset-confirm" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={formData.confirmPassword} onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })} className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all" />
              </div>
              <button type="submit" disabled={loading || !validPassword || formData.password !== formData.confirmPassword} className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-all">{loading && <Loader2 size={18} className="animate-spin" />}{loading ? 'Actualizando...' : 'Cambiar contraseña'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
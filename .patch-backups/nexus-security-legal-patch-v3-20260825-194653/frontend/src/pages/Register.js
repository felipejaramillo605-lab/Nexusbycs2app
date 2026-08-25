import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';
import { Eye, EyeOff, User, Mail, Lock, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const validatePassword = (password) => {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return { minLength, hasUpper, hasNumber, isValid: minLength && hasUpper && hasNumber };
  };

  const passwordStrength = validatePassword(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!passwordStrength.isValid) {
      toast.error('La contraseña debe cumplir todos los requisitos');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });
      
      toast.success('Registro exitoso');
      navigate('/pending-approval');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Link
          to="/login"
          className="inline-flex items-center gap-2 mb-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          <span>Volver al login</span>
        </Link>

        {/* Card */}
        <div className="glass-panel p-8 rounded-3xl shadow-elevation-high">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#0A84FF] to-[#0071E3] flex items-center justify-center shadow-lg shadow-[#0A84FF]/25">
              <User size={32} strokeWidth={1.5} className="text-white" />
            </div>
            <h1 className="text-3xl font-light tracking-tight text-[var(--text-primary)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Crear Cuenta
            </h1>
            <p className="text-[var(--text-secondary)] text-sm">
              Solicita acceso a Nexus by CS2
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Nombre completo
              </label>
              <div className="relative">
                <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all"
                  placeholder="Juan Pérez"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-12 pr-12 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {showPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                </button>
              </div>

              {/* Password Requirements */}
              {formData.password && (
                <div className="mt-3 space-y-2">
                  <div className={`flex items-center gap-2 text-xs ${passwordStrength.minLength ? 'text-green-500' : 'text-[var(--text-tertiary)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordStrength.minLength ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                    Mínimo 8 caracteres
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordStrength.hasUpper ? 'text-green-500' : 'text-[var(--text-tertiary)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordStrength.hasUpper ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                    Al menos una mayúscula
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordStrength.hasNumber ? 'text-green-500' : 'text-[var(--text-tertiary)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordStrength.hasNumber ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                    Al menos un número
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pl-12 pr-12 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all"
                  placeholder="Confirma tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-2 text-xs text-red-500">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !passwordStrength.isValid || formData.password !== formData.confirmPassword}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-[var(--accent)] hover:underline font-medium">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;

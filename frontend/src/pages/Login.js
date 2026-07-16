import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { AUTH } from '../constants/testIds';
import { authAPI } from '../api';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [activeTab, setActiveTab] = useState('email');
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    if (loading) return;

    setLoading(true);

    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = `${window.location.origin}/auth/callback`;

    window.location.assign(
      `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`
    );
  };

  const handleEmailLogin = async (event) => {
    event.preventDefault();

    const email = formData.email.trim();

    if (!email || !formData.password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      const response = await authAPI.login({
        email,
        password: formData.password
      });

      const authenticatedUser = response.data;

      completeLogin(authenticatedUser);
      toast.success('¡Bienvenido de nuevo!');

      const destination =
        authenticatedUser.role === 'owner'
          ? '/owner/access-control'
          : '/manager/dashboard';

      navigate(destination, { replace: true });
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || 'Error al iniciar sesión';

      if (
        typeof errorMessage === 'string' &&
        errorMessage.toLowerCase().includes('pending approval')
      ) {
        toast.error('Tu cuenta está pendiente de aprobación');
        navigate('/pending-approval', { replace: true });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'url(https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />

      <div className="relative z-10 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 sm:p-12 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1
            className="text-4xl sm:text-5xl font-light tracking-tight text-white mb-4"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Nexus by CS2
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Sistema de gestión para barberías profesionales
          </p>
        </div>

        <div
          className="flex gap-2 mb-6 bg-white/5 p-1 rounded-xl"
          role="tablist"
          aria-label="Método de inicio de sesión"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'email'}
            onClick={() => setActiveTab('email')}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed ${
              activeTab === 'email'
                ? 'bg-[#0A84FF] text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Email
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'google'}
            onClick={() => setActiveTab('google')}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed ${
              activeTab === 'google'
                ? 'bg-[#0A84FF] text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Google
          </button>
        </div>

        {activeTab === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-zinc-400 mb-2"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={loading}
                  value={formData.email}
                  onChange={(event) =>
                    setFormData((currentData) => ({
                      ...currentData,
                      email: event.target.value
                    }))
                  }
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-zinc-400 mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  value={formData.password}
                  onChange={(event) =>
                    setFormData((currentData) => ({
                      ...currentData,
                      password: event.target.value
                    }))
                  }
                  className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="Tu contraseña"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((currentValue) => !currentValue)
                  }
                  disabled={loading}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={20} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Eye size={20} strokeWidth={1.5} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid={AUTH.loginBtn}
              aria-busy={loading}
              className="w-full min-h-[44px] h-14 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                'Iniciando sesión...'
              ) : (
                <>
                  <LogIn size={20} strokeWidth={1.5} aria-hidden="true" />
                  Iniciar sesión
                </>
              )}
            </button>

            <p className="text-center text-sm text-zinc-400 mt-4">
              ¿No tienes cuenta?{' '}
              <Link
                to="/register"
                className="text-[#0A84FF] hover:underline font-medium"
              >
                Crear cuenta
              </Link>
            </p>
          </form>
        )}

        {activeTab === 'google' && (
          <div className="space-y-4">
            <p className="text-center text-sm text-zinc-400 mb-6">
              Inicia sesión con tu cuenta de Google
            </p>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              aria-busy={loading}
              className="w-full min-h-[44px] h-14 bg-white hover:bg-zinc-100 text-zinc-900 rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>

              {loading ? 'Redirigiendo a Google...' : 'Continuar con Google'}
            </button>

            <p className="text-center text-sm text-zinc-400 mt-4">
              ¿No tienes cuenta?{' '}
              <Link
                to="/register"
                className="text-[#0A84FF] hover:underline font-medium"
              >
                Crear cuenta
              </Link>
            </p>
          </div>
        )}

        <p className="text-xs text-zinc-500 text-center mt-6">
          Al iniciar sesión, aceptas los términos y condiciones
        </p>
      </div>
    </div>
  );
};

export default Login;

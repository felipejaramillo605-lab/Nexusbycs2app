import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Lock, LogIn, UserPlus, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001/api';

export default function ClientPortalAuth() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [organizationName, setOrganizationName] = useState('');

  useEffect(() => {
    // Load organization info
    const loadOrg = async () => {
      try {
        const response = await axios.get(`${API}/public/${orgId}/organization`);
        setOrganizationName(response.data.name || 'Nexus');
      } catch (error) {
        console.error('Error loading organization:', error);
      }
    };
    if (orgId) loadOrg();
  }, [orgId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/public/clients/login`, {
        phone,
        organization_id: orgId,
        pin
      }, { withCredentials: true });

      toast.success('¡Bienvenido de nuevo!');
      navigate(`/portal/${orgId}/dashboard`);
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error(error.response.data.detail || 'Demasiados intentos. Espera un momento.');
      } else {
        toast.error(error.response?.data?.detail || 'PIN o teléfono incorrecto');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/public/clients/register`, {
        phone,
        organization_id: orgId,
        name: name.trim(),
        pin,
        marketing_consent: marketingConsent
      }, { withCredentials: true });

      toast.success('¡Cuenta creada exitosamente!');
      navigate(`/portal/${orgId}/dashboard`);
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error('Demasiados intentos. Intenta más tarde.');
      } else {
        toast.error(error.response?.data?.detail || 'Error al crear cuenta');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to={`/booking/${orgId}`} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6">
            <ArrowLeft size={16} />
            <span className="text-sm">Volver a reservar</span>
          </Link>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Portal de Clientes</h1>
          <p className="text-zinc-400 text-sm">{organizationName}</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl border border-white/10">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LogIn size={16} className="inline mr-2" />
            Iniciar Sesión
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'register'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <UserPlus size={16} className="inline mr-2" />
            Registrarse
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Teléfono
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Name (only for register) */}
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Nombre completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
                maxLength={100}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          )}

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              PIN de 4 dígitos
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(value);
                }}
                placeholder="••••"
                required
                maxLength={4}
                pattern="\d{4}"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-xs text-zinc-500 mt-1">
                Usa un PIN que puedas recordar fácilmente
              </p>
            )}
          </div>

          {/* Marketing Consent (only for register) */}
          {mode === 'register' && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm text-zinc-300">
                    Acepto recibir promociones y novedades por correo/WhatsApp
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Puedes cancelar en cualquier momento
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {mode === 'login' ? 'Iniciando...' : 'Creando cuenta...'}
              </>
            ) : (
              <>
                {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </>
            )}
          </button>

          {/* Forgot PIN Link */}
          {mode === 'login' && (
            <div className="text-center">
              <Link
                to={`/portal/${orgId}/forgot-pin`}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                ¿Olvidaste tu PIN?
              </Link>
            </div>
          )}
        </form>

        {/* Info */}
        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-xs text-zinc-400 text-center">
            {mode === 'login' 
              ? 'Después de 5 intentos fallidos, tu cuenta se bloqueará por 15 minutos'
              : 'Tu PIN es personal y confidencial. No lo compartas con nadie'}
          </p>
        </div>
      </div>
    </div>
  );
}

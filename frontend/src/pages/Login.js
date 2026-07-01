import React from 'react';
import { LogIn } from 'lucide-react';
import { AUTH } from '../constants/testIds';

const Login = () => {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/auth/callback';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center relative overflow-hidden">
      <div 
        className="absolute inset-0 opacity-20" 
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      <div className="relative z-10 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-12 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-light tracking-tight text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Clipper
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            Sistema de gestión para barberías profesionales
          </p>
        </div>

        <button
          data-testid={AUTH.loginBtn}
          onClick={handleLogin}
          className="w-full h-14 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
        >
          <LogIn size={20} strokeWidth={1.5} />
          Iniciar sesión con Google
        </button>

        <p className="text-xs text-zinc-500 text-center mt-6">
          Al iniciar sesión, aceptas los términos y condiciones
        </p>
      </div>
    </div>
  );
};

export default Login;
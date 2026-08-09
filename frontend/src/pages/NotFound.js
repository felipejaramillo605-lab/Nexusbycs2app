import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const NotFound = () => (
  <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-3">Error 404</p>
      <h1 className="text-3xl font-light mb-3">Página no encontrada</h1>
      <p className="text-zinc-400 mb-7">El enlace no existe, está incompleto o corresponde a una versión anterior de la aplicación.</p>
      <Link to="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] px-5 font-medium transition-colors"><ArrowLeft size={18} />Volver al inicio</Link>
    </div>
  </div>
);

export default NotFound;

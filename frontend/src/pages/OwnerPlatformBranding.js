// NEXUS_PLATFORM_BRANDING_V1
import React from 'react';
import { Sparkles } from 'lucide-react';
import PlatformLogoUpload from '../components/PlatformLogoUpload';

export default function OwnerPlatformBranding() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[var(--app-primary-soft)] flex items-center justify-center">
          <Sparkles size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--app-text-primary)]">Marca de Nexus</h1>
          <p className="text-sm text-[var(--app-text-secondary)]">
            Este es el logo de la plataforma en sí, no el de una organización individual.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 space-y-1">
        <p className="text-sm text-[var(--app-text-secondary)]">
          Cada barbería/salón (organización) tiene su propio logo, que solo se ve en <strong className="text-[var(--app-text-primary)]">sus propias páginas</strong> (Configuración → General de cada organización).
        </p>
        <p className="text-sm text-[var(--app-text-secondary)]">
          Este logo, en cambio, es la marca de <strong className="text-[var(--app-text-primary)]">Nexus como proveedor del software</strong>: aparece en el ícono del navegador por defecto, en el panel del owner cuando no estás gestionando una organización puntual, y como &quot;Con tecnología de Nexus&quot; en el encabezado de las páginas de reserva/portal de <strong className="text-[var(--app-text-primary)]">todas</strong> las organizaciones.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
        <PlatformLogoUpload />
      </div>
    </div>
  );
}

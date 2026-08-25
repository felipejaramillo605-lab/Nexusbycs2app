import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Phone, MapPin, AlertTriangle } from 'lucide-react';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Términos de Servicio</h1>
              <p className="text-xs text-zinc-400">Nexus by CS2 — para dueños y administradores de negocio</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose prose-invert max-w-none">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8 flex gap-3">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              <strong>Borrador en revisión.</strong> Este documento describe de forma clara las condiciones bajo las
              que Felipe Jaramillo Parra ("Nexus by CS2") ofrece la plataforma a dueños y administradores de negocio.
              Antes de tratarlo como vinculante frente a terceros, debe ser revisado por un abogado, especialmente
              para operación en Colombia y, si aplica, en Florida (EE.UU.).
            </p>
          </div>

          <section className="mb-8">
            <p className="text-sm text-zinc-400 mb-4">Última actualización: {new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long' })}</p>
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              1. Qué es Nexus
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus by CS2 ("Nexus", "nosotros") es una plataforma de software como servicio (SaaS) para la gestión
              de negocios de barbería/salón: agenda de citas, clientes, inventario, facturación y portal de reservas
              para clientes finales. Al crear una cuenta como dueño o administrador ("tú", "el Negocio"), aceptas
              estos Términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              2. Responsable vs. Encargado del Tratamiento de Datos
            </h2>
            <p className="text-zinc-300 mb-4">
              Bajo la Ley 1581 de 2012 (Colombia), esta distinción es central:
            </p>
            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Tú (el Negocio) eres el Responsable</h3>
                <p className="text-sm text-zinc-400">
                  Decides qué datos de tus clientes finales se recopilan (nombre, teléfono, historial de citas) y
                  para qué los usas. Eres responsable de contar con una base legal para tratarlos y de atender
                  reclamos de tus clientes sobre sus propios datos.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Nexus es el Encargado</h3>
                <p className="text-sm text-zinc-400">
                  Procesamos y almacenamos esos datos técnicamente en tu nombre, siguiendo tus instrucciones (a
                  través del uso normal de la plataforma), con las medidas de seguridad descritas en nuestra{' '}
                  <a href="/privacy-policy" className="text-purple-400 hover:underline">Política de Privacidad</a>.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              3. Tu cuenta y aprobación
            </h2>
            <p className="text-zinc-300 mb-4">
              Las cuentas nuevas de dueño/administrador quedan en estado "pendiente" hasta ser aprobadas. Eres
              responsable de la veracidad de la información que registras y de mantener tu contraseña en secreto.
              Nexus puede suspender cuentas ante uso indebido, impago, o incumplimiento de estos Términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              4. Suscripción y pagos
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus no procesa ni almacena datos de tarjetas directamente. Los cobros de suscripción, cuando
              aplican, se gestionan a través de un proveedor externo de pagos (Wompi/Stripe u otro que se indique
              en tu panel de facturación). Las condiciones específicas de precio, ciclo de facturación y cancelación
              se muestran en tu panel de "Suscripción" antes de confirmar cualquier cobro.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              5. Uso aceptable
            </h2>
            <p className="text-zinc-300 mb-4">
              No debes usar Nexus para actividades ilegales, enviar comunicaciones masivas no solicitadas a
              personas que no sean tus propios clientes, intentar vulnerar la seguridad de la plataforma, ni
              acceder a datos de otros negocios distintos al tuyo.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              6. Limitación de responsabilidad
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus se ofrece "tal cual". En la medida permitida por la ley, no somos responsables por pérdidas
              indirectas derivadas del uso de la plataforma (por ejemplo, ingresos dejados de percibir por una
              interrupción del servicio). Esta cláusula debe ajustarse con asesoría legal antes de considerarse
              definitiva.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              7. Terminación
            </h2>
            <p className="text-zinc-300 mb-4">
              Puedes dejar de usar Nexus en cualquier momento. Al finalizar la relación, tus datos y los de tus
              clientes se conservan según lo indicado en nuestra Política de Privacidad (incluyendo retención por
              obligaciones contables/fiscales), y puedes solicitar la eliminación de tu cuenta.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              8. Ley aplicable
            </h2>
            <p className="text-zinc-300 mb-4">
              Estos Términos se rigen por las leyes de la República de Colombia. Si expandes tu operación a
              Florida (EE.UU.), condiciones adicionales específicas de esa jurisdicción se comunicarán antes del
              lanzamiento allí.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              9. Contacto
            </h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
              <p className="text-sm text-zinc-400 flex items-center gap-2"><Mail size={16} /> Felipe Jaramillo Parra</p>
              <p className="text-sm text-zinc-400 flex items-center gap-2"><Phone size={16} /> Ver datos de contacto en la Política de Privacidad</p>
              <p className="text-sm text-zinc-400 flex items-center gap-2"><MapPin size={16} /> La Estrella, Antioquia, Colombia</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

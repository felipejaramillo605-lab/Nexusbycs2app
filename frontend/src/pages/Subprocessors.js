import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Server } from 'lucide-react';

// Lista publica de encargados y subencargados (Ley 1581 de 2012 y contrato de transmision de datos).
// Fuente de verdad interna: docs/legal/07-retencion-y-subencargados.md. Ningun proveedor nuevo entra a produccion con datos
// reales sin actualizar esta tabla, la politica de privacidad y el contrato, y sin avisar a los negocios con 15 dias de antelacion.
export const SUBPROCESSORS = [
  { name: 'Emergent (infraestructura en la nube)', service: 'Ejecuta la aplicacion', data: 'Todos los datos de la aplicacion', country: 'EE. UU.', region: 'Region por confirmar' },
  { name: 'MongoDB (base de datos)', service: 'Almacena la informacion de la plataforma', data: 'Todos los datos de la aplicacion', country: 'EE. UU. / region de la nube', region: 'Region por confirmar' },
  { name: 'Cloudflare, Inc. (R2)', service: 'Almacenamiento de imagenes (logos, fondos, fotos de servicios, de productos y del equipo)', data: 'Imagenes que sube cada negocio', country: 'EE. UU. / global', region: 'Ubicacion automatica' },
  { name: 'Resend, Inc.', service: 'Correo transaccional (confirmaciones, recordatorios, avisos)', data: 'Nombre, correo y contenido del mensaje', country: 'EE. UU.', region: 'Envio desde Sao Paulo' },
  { name: 'Google LLC', service: 'Inicio de sesion con Google y correo SMTP de respaldo', data: 'Identidad del usuario del negocio; destinatario y contenido del correo', country: 'EE. UU.', region: 'No aplica' },
  { name: 'IONOS', service: 'Dominio, DNS y correo corporativo de soporte', data: 'Correos de soporte', country: 'UE / EE. UU.', region: 'No aplica' },
  { name: 'Proveedor de modelos de lenguaje (a traves de Emergent)', service: 'Asistente Nexus AI para duenos y administradores', data: 'Texto minimo necesario y enmascarado', country: 'EE. UU.', region: 'Proveedor por confirmar' },
  { name: 'Meta Platforms (WhatsApp Business)', service: 'Mensajeria con clientes', data: 'Telefono y texto del mensaje', country: 'EE. UU.', region: 'Solo si el negocio lo habilita' },
  { name: 'Wompi / Stripe', service: 'Procesamiento de pagos', data: 'Datos de pago (Nexus no los almacena)', country: 'Colombia / EE. UU.', region: 'Solo si el negocio cobra en la plataforma' },
  { name: 'TypeSafe (Jev)', service: 'Clasificacion de textos de soporte', data: 'Texto enmascarado de soporte', country: 'EE. UU.', region: 'No activo' },
];

export default function Subprocessors() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Volver">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <Server size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Subencargados del tratamiento</h1>
              <p className="text-xs text-zinc-400">Nexus by CS2 — terceros que pueden tratar datos personales</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <p className="text-zinc-300">
          Para prestar el servicio, Nexus se apoya en los proveedores de esta lista. Cada negocio es Responsable de los datos
          de sus clientes y Nexus actua como Encargado; estos proveedores actuan como subencargados bajo contrato.
          Ultima actualizacion: octubre de 2026.
        </p>

        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/5 text-zinc-300">
              <tr>
                <th className="p-3 font-medium">Proveedor</th>
                <th className="p-3 font-medium">Servicio</th>
                <th className="p-3 font-medium">Datos</th>
                <th className="p-3 font-medium">Pais</th>
                <th className="p-3 font-medium">Region / estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-zinc-400">
              {SUBPROCESSORS.map((item) => (
                <tr key={item.name}>
                  <td className="p-3 text-white">{item.name}</td>
                  <td className="p-3">{item.service}</td>
                  <td className="p-3">{item.data}</td>
                  <td className="p-3">{item.country}</td>
                  <td className="p-3">{item.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-zinc-400 space-y-2">
          <p>
            Nexus no usa analitica ni pixeles publicitarios de terceros ni graba sesiones de los visitantes. Si en el futuro se
            incorpora un proveedor nuevo con datos reales, actualizaremos esta lista, la Politica de Privacidad y el contrato,
            y avisaremos a los negocios con 15 dias de anticipacion.
          </p>
          <p>
            Preguntas o solicitudes: nexusbycs2@gmail.com o +57 323 907 0485. Consulta la{' '}
            <a href="/privacy-policy" className="underline">Politica de Privacidad</a> y los{' '}
            <a href="/terms-of-service" className="underline">Terminos de Servicio</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

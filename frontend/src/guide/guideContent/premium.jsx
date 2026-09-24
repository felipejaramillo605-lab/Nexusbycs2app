import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  FileText,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'Plan Premium da acceso a Nexus AI y a las plantillas premium del portal para la organización. El Manager o Admin puede solicitarlo y revisar si está pendiente o activo.',
    forWhat: 'Sirve para pedir la activación y consultar el estado del acceso. Cuando el Owner desactiva Premium, la organización deja de tener acceso a Nexus AI y a las plantillas premium del portal. La gestión de facturas y la activación corresponden al Owner.',
    whoUses: 'El Manager o Admin que solicita Premium para su organización y da seguimiento a la solicitud.',
  },
  screens: [
    {
      title: 'Configuración general',
      screenshot: {
        src: null,
        alt: 'Configuración de Manager, en la sección General: acción Solicitar plan Premium y el estado de la solicitud, que puede aparecer pendiente o activa.',
      },
      zones: [
        { n: 1, label: 'Configuración → General', desc: 'abre los ajustes generales de la organización', xPct: 30, yPct: 20 },
        { n: 2, label: 'Solicitar plan Premium', desc: 'envía la solicitud para que el Owner la gestione', xPct: 70, yPct: 45 },
        { n: 3, label: 'Estado', desc: 'indica si la solicitud está pendiente o el plan está activo', xPct: 50, yPct: 65 },
      ],
    },
  ],
  steps: [
    {
      id: 'p1',
      title: 'Solicitar Premium para la organización',
      substeps: [
        'En la barra lateral, abre "Configuración" y luego "General" (ruta: /manager/settings?tab=general).',
        'Pulsa "Solicitar plan Premium".',
        'Espera a que el Owner revise la solicitud y gestione la factura.',
        'Vuelve a "General" para consultar el estado: pendiente o activo.',
      ],
      expected: 'La solicitud queda registrada para revisión. Solo el Owner puede asociar una factura y activar el plan.',
    },
  ],
  buttons: [
    { icon: ArrowRight, name: 'Solicitar plan Premium', does: 'Envía la solicitud del Manager para su organización.', when: 'Cuando la organización quiere pedir Premium.' },
  ],
  examples: [
    {
      scenario: 'Tu organización quiere usar Premium y el estado aún no está activo.',
      walkthrough: [
        'Abre "Configuración" → "General".',
        'Pulsa "Solicitar plan Premium".',
        'Avísale al Owner de la solicitud por el canal de trabajo de tu organización.',
        'Consulta el estado en "General" después de que el Owner gestione la factura y confirme la activación.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No encuentro opciones para activar Premium o gestionar una factura.', fix: 'El Manager puede solicitar el plan y consultar su estado. La asociación de facturas y la activación están disponibles solo para el Owner.' },
    { problem: 'La solicitud aparece pendiente.', fix: 'El Owner debe revisar la solicitud, asociar una factura manual elegible de la misma organización y confirmar el pago completo antes de activar el plan.' },
  ],
  checklist: [
    { id: 'p1', label: 'Encontré "Configuración" → "General" y ubiqué "Solicitar plan Premium".' },
    { id: 'p2', label: 'Sé consultar si la solicitud está pendiente o si Premium está activo.' },
    { id: 'p3', label: 'Entendí que el Owner gestiona facturas y activación.' },
  ],
};

const owner = {
  summary: {
    what: 'Premium da acceso a Nexus AI y a las plantillas premium del portal para la organización. Desde Suscripciones puedes revisar solicitudes, facturas asociadas y el estado de activación; al desactivar Premium, se retira ese acceso.',
    forWhat: 'Sirve para tramitar manualmente una factura y activar o desactivar Premium con los motivos y confirmaciones requeridos.',
    whoUses: 'El Owner que administra las suscripciones de sus organizaciones.',
  },
  screens: [
    {
      title: 'Suscripciones',
      screenshot: {
        src: null,
        alt: 'Vista de Suscripciones del Owner con solicitudes y estado por organización, acciones Administrar organización y Actualizar; el detalle de administración permite asociar una factura manual y muestra su estado de pago.',
      },
      zones: [
        { n: 1, label: 'Suscripciones', desc: 'muestra las solicitudes y estados de las organizaciones', xPct: 35, yPct: 20 },
        { n: 2, label: 'Actualizar', desc: 'vuelve a cargar solicitudes y estados', xPct: 85, yPct: 20 },
        { n: 3, label: 'Administrar organización', desc: 'abre la gestión Premium de esa organización', xPct: 72, yPct: 48 },
      ],
    },
    {
      title: 'Administrar una organización',
      screenshot: {
        src: null,
        alt: 'Detalle de una organización en Suscripciones: acción para asociar una factura manual ya existente de la misma organización, campo Motivo de asociación, acceso a Facturas para Confirmar pago, y acciones de activar o desactivar Premium con motivo y confirmación.',
      },
      zones: [
        { n: 1, label: 'Factura manual elegible', desc: 'selecciona una factura existente de esa organización', xPct: 50, yPct: 30 },
        { n: 2, label: 'Motivo de asociación', desc: 'explica por qué se asocia la factura', xPct: 50, yPct: 48 },
        { n: 3, label: 'Facturas → Confirmar pago', desc: 'confirma el pago completo de la factura', xPct: 50, yPct: 68 },
        { n: 4, label: 'Activar o desactivar', desc: 'solicita motivo y confirmación antes de cambiar el estado', xPct: 50, yPct: 88 },
      ],
    },
  ],
  steps: [
    {
      id: 'p4',
      title: 'Revisar solicitudes de Premium',
      substeps: [
        'Abre "Suscripciones" desde la navegación del Owner (ruta: /owner/subscriptions).',
        'Revisa la lista global de organizaciones y el estado de cada solicitud.',
        'Pulsa "Actualizar" si necesitas volver a cargar los datos.',
        'En la organización correspondiente, pulsa "Administrar organización".',
      ],
      expected: 'El detalle muestra la solicitud y el estado de Premium para la organización elegida.',
    },
    {
      id: 'p5',
      title: 'Asociar y cobrar una factura manual',
      substeps: [
        'En "Administrar organización", selecciona una factura manual ya existente, elegible y perteneciente a esa misma organización.',
        'Escribe el "Motivo de asociación" y confirma la asociación.',
        'Abre "Facturas" y localiza la factura asociada.',
        'Pulsa "Confirmar pago" solo después de recibir el pago completo.',
      ],
      expected: 'La factura manual existente queda asociada a la organización. En este paso del panel Plan Premium, asocia una factura ya emitida; no uses "Emitir factura" para crear una factura nueva.',
    },
    {
      id: 'p6',
      title: 'Activar Premium',
      substeps: [
        'Confirma que la factura asociada pertenece a la misma organización y que su pago está completo.',
        'En "Administrar organización", elige activar Premium.',
        'Escribe el motivo de activación y revisa la organización y el estado.',
        'Confirma la acción en el modal de confirmación.',
      ],
      expected: 'Premium se activa para esa organización después de confirmar. La organización obtiene acceso a Nexus AI y a las plantillas premium del portal. La factura sin pago completo no habilita la activación.',
    },
    {
      id: 'p7',
      title: 'Desactivar Premium',
      substeps: [
        'Abre "Administrar organización" para la organización correcta.',
        'Elige desactivar Premium y escribe el motivo.',
        'Revisa la acción y confirma en el modal.',
      ],
      expected: 'Premium queda desactivado para esa organización, el cambio conserva el motivo registrado y se retira el acceso a Nexus AI y a las plantillas premium del portal.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Administrar organización', does: 'Abre las solicitudes, facturas y estado Premium de una organización.', when: 'Al tramitar o revisar el plan de esa organización.' },
    { icon: RefreshCw, name: 'Actualizar', does: 'Vuelve a cargar la lista global de suscripciones.', when: 'Para consultar solicitudes o estados recientes.' },
    { icon: FileText, name: 'Asociar factura manual', does: 'Vincula una factura manual existente y elegible de la misma organización; requiere un motivo.', when: 'Cuando existe una factura válida para la solicitud.' },
    { icon: CheckCircle2, name: 'Facturas → Confirmar pago', does: 'Registra que la factura se pagó por completo.', when: 'Solo después de recibir el pago completo.' },
    { icon: ShieldCheck, name: 'Activar Premium', does: 'Activa el plan para la organización con motivo y confirmación.', when: 'Con la factura asociada pagada en su totalidad.' },
    { icon: CircleAlert, name: 'Desactivar Premium', does: 'Desactiva el plan con motivo y confirmación.', when: 'Cuando el plan debe dejar de estar activo para la organización.' },
  ],
  examples: [
    {
      scenario: 'Una organización tiene una solicitud pendiente y una factura manual elegible por el importe completo.',
      walkthrough: [
        'En "Suscripciones", abre "Administrar organización" para la organización solicitante.',
        'Asocia su factura manual existente e indica el "Motivo de asociación".',
        'En "Facturas", pulsa "Confirmar pago" cuando el importe completo se haya recibido.',
        'Regresa a Suscripciones, elige activar Premium, explica el motivo y confirma en el modal.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No aparece una factura para asociar.', fix: 'El panel Plan Premium asocia una factura manual existente, elegible y de la misma organización. En ese paso no uses "Emitir factura" para crear una factura nueva; revisa Facturas y confirma la organización y el estado de la factura.' },
    { problem: 'La factura figura pagada parcialmente o aún no está pagada.', fix: 'Premium requiere pago completo. Completa y confirma el pago desde "Facturas" antes de intentar activar.' },
    { problem: 'La activación no se completa.', fix: 'Verifica la factura asociada, el pago completo, el motivo de activación y la confirmación en el modal. La activación solo la puede hacer el Owner.' },
  ],
  checklist: [
    { id: 'p4', label: 'Revisé la lista global y abrí "Administrar organización" para la organización correcta.' },
    { id: 'p5', label: 'Asocié solo una factura manual elegible de la misma organización e indiqué el motivo.' },
    { id: 'p6', label: 'Confirmé el pago completo desde "Facturas" antes de activar Premium.' },
    { id: 'p7', label: 'Activé o desactivé con motivo y confirmación en el modal.' },
    { id: 'p8', label: 'Entendí que activar Premium da acceso a Nexus AI y a las plantillas premium del portal, y desactivarlo retira ese acceso.' },
  ],
};

const premium = {
  id: 'premium',
  perRole: {
    owner,
    manager,
  },
};

export default premium;

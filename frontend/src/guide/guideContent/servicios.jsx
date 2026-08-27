// frontend/src/guide/guideContent/servicios.jsx
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  FlaskConical,
  ShieldCheck,
  X,
  Building2,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'Servicios es el catálogo de lo que ofrece el negocio: cada servicio tiene un nombre, una duración y un precio, y puede tener una receta de insumos que se descuenta del inventario al cobrar.',
    forWhat: 'Sirve para mantener al día lo que los clientes pueden reservar y a qué precio, y para controlar cuánto material consume cada servicio.',
    whoUses: 'El Manager (y el Owner) cuando arma el catálogo o ajusta precios y duraciones.',
  },
  screens: [
    {
      title: 'Listado de Servicios',
      screenshot: {
        src: null,
        alt: 'Pantalla "Servicios": barra superior con "Volver", el título y el botón "Nuevo Servicio"; una cuadrícula de tarjetas, una por servicio, con el nombre, la duración en minutos y el precio; al pasar el cursor sobre una tarjeta aparecen tres botones: "Insumos" (matraz), "Editar" (lápiz) y "Eliminar" (papelera). Si no hay servicios, un mensaje invita a crear el primero.',
      },
      zones: [
        { n: 1, label: 'Nuevo Servicio', desc: 'abre el formulario para crear un servicio', xPct: 88, yPct: 12 },
        { n: 2, label: 'Tarjeta de servicio', desc: 'muestra nombre, duración y precio', xPct: 30, yPct: 45 },
        { n: 3, label: 'Insumos', desc: 'abre la receta de inventario del servicio', xPct: 60, yPct: 32 },
        { n: 4, label: 'Editar', desc: 'cambia nombre, duración y precio', xPct: 68, yPct: 32 },
        { n: 5, label: 'Eliminar', desc: 'borra el servicio tras confirmar', xPct: 76, yPct: 32 },
      ],
    },
    {
      title: 'Panel de Insumos (receta)',
      screenshot: {
        src: null,
        alt: 'Panel lateral "Insumos" de un servicio: un bloque "Control de inventario" con dos botones, "Flexible" y "Estricto"; la versión activa de la receta y el costo estimado; una lista de líneas, cada una con un selector de referencia del inventario y un campo "Cantidad"; un botón "Agregar insumo"; un campo de notas; y el botón "Guardar nueva versión".',
      },
      zones: [
        { n: 1, label: 'Flexible / Estricto', desc: 'define si la falta de insumos solo advierte o bloquea el cobro', xPct: 50, yPct: 20 },
        { n: 2, label: 'Costo estimado', desc: 'suma del costo material de la receta', xPct: 80, yPct: 33 },
        { n: 3, label: 'Línea de insumo', desc: 'referencia del inventario y cantidad por servicio', xPct: 45, yPct: 55 },
        { n: 4, label: 'Agregar insumo', desc: 'añade otra referencia a la receta', xPct: 50, yPct: 70 },
        { n: 5, label: 'Guardar nueva versión', desc: 'guarda la receta como una versión nueva', xPct: 50, yPct: 90 },
      ],
    },
  ],
  steps: [
    {
      id: 's1',
      title: 'Crear un servicio',
      substeps: [
        'Pulsa "Nuevo Servicio" en la esquina superior derecha.',
        'Escribe el "Nombre" (por ejemplo, "Corte clásico").',
        'Indica la "Duración (minutos)" y el "Precio".',
        'Pulsa "Crear Servicio".',
      ],
      expected: 'El servicio aparece como una tarjeta nueva en la cuadrícula.',
    },
    {
      id: 's2',
      title: 'Editar la duración o el precio',
      substeps: [
        'Pasa el cursor sobre la tarjeta del servicio y pulsa "Editar" (ícono de lápiz).',
        'Cambia el "Nombre", la "Duración (minutos)" o el "Precio".',
        'Pulsa "Guardar Cambios".',
      ],
      expected: 'La tarjeta muestra los datos actualizados. Las citas ya agendadas conservan su valor anterior.',
    },
    {
      id: 's3',
      title: 'Definir los insumos de un servicio',
      substeps: [
        'Pasa el cursor sobre la tarjeta y pulsa "Insumos" (ícono de matraz).',
        'Elige el modo "Flexible" (solo advierte) o "Estricto" (bloquea el cobro si faltan insumos).',
        'Pulsa "Agregar insumo", elige la referencia del inventario y escribe la "Cantidad" que consume un servicio.',
        'Repite por cada insumo, añade "Notas" si lo necesitas y pulsa "Guardar nueva versión".',
      ],
      expected: 'La receta queda guardada con un número de versión y su costo estimado. Al cobrar una cita de ese servicio se descuentan esas cantidades del inventario.',
    },
    {
      id: 's4',
      title: 'Eliminar un servicio',
      substeps: [
        'Pasa el cursor sobre la tarjeta y pulsa "Eliminar" (ícono de papelera).',
        'Confirma en el aviso.',
      ],
      expected: 'El servicio desaparece del catálogo y deja de poder reservarse.',
    },
  ],
  buttons: [
    { icon: ArrowLeft, name: 'Volver', does: 'Regresa al panel del manager.', when: 'Cuando terminas de trabajar el catálogo.' },
    { icon: Plus, name: 'Nuevo Servicio', does: 'Abre el formulario de creación de servicio.', when: 'Cuando agregas algo nuevo al catálogo.' },
    { icon: Plus, name: 'Campo "Nombre"', does: 'Define cómo se llama el servicio para el negocio y para el cliente.', when: 'Al crear o editar un servicio.' },
    { icon: Plus, name: 'Campo "Duración (minutos)"', does: 'Fija cuánto tiempo ocupa el servicio en la agenda del profesional.', when: 'Al crear o editar; ajusta la disponibilidad que ve el cliente al reservar.' },
    { icon: Plus, name: 'Campo "Precio"', does: 'Fija el valor del servicio que se usará al cobrar.', when: 'Al crear o editar un servicio.' },
    { icon: Plus, name: 'Crear Servicio', does: 'Guarda el servicio nuevo.', when: 'Cuando el nombre, la duración y el precio están listos.' },
    { icon: Edit2, name: 'Editar', does: 'Abre el formulario con los datos del servicio para modificarlos.', when: 'Cuando cambia el precio o la duración.' },
    { icon: Edit2, name: 'Guardar Cambios', does: 'Guarda las modificaciones del servicio.', when: 'Al terminar de editar.' },
    { icon: Trash2, name: 'Eliminar', does: 'Borra el servicio del catálogo tras confirmar.', when: 'Cuando el negocio deja de ofrecer ese servicio.' },
    { icon: FlaskConical, name: 'Insumos', does: 'Abre el panel de la receta de inventario del servicio.', when: 'Cuando quieres controlar qué material consume el servicio.' },
    { icon: ShieldCheck, name: 'Flexible / Estricto', does: 'En "Flexible" la falta de insumos solo genera advertencias; en "Estricto" bloquea el cobro cuando faltan insumos.', when: 'Una vez, según cómo quieras que el inventario afecte la operación.' },
    { icon: Plus, name: 'Agregar insumo', does: 'Añade una línea nueva a la receta con una referencia del inventario.', when: 'Por cada material que consume el servicio.' },
    { icon: FlaskConical, name: 'Selector de referencia (línea de receta)', does: 'Elige qué producto del inventario consume esa línea.', when: 'Al armar o ajustar la receta.' },
    { icon: FlaskConical, name: 'Campo "Cantidad" (línea de receta)', does: 'Indica cuánto de esa referencia consume un solo servicio.', when: 'Al armar o ajustar la receta.' },
    { icon: X, name: 'Quitar línea (equis)', does: 'Elimina esa referencia de la receta.', when: 'Cuando un insumo ya no aplica.' },
    { icon: FlaskConical, name: 'Campo "Notas de la receta"', does: 'Guarda una nota libre sobre la receta.', when: 'Cuando hay algo que aclarar sobre las cantidades.' },
    { icon: FlaskConical, name: 'Guardar nueva versión', does: 'Guarda la receta como una versión nueva del servicio.', when: 'Al terminar de editar los insumos.' },
  ],
  examples: [
    {
      scenario: 'Agregas un servicio nuevo de "Perfilado de barba" a $18.000 y quieres que descuente la cuchilla y la crema del inventario.',
      walkthrough: [
        'Pulsa "Nuevo Servicio", escribe "Perfilado de barba", duración 20 y precio 18000, y pulsa "Crear Servicio".',
        'En la tarjeta del servicio, pulsa "Insumos".',
        'Deja el modo en "Flexible", pulsa "Agregar insumo" y elige la cuchilla con cantidad 1.',
        'Pulsa "Agregar insumo" otra vez, elige la crema y pon la cantidad que se usa por servicio.',
        'Pulsa "Guardar nueva versión".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Creé un servicio pero no aparece cuando un cliente intenta reservar.', fix: 'Un servicio solo se ofrece si hay al menos un profesional que lo tiene marcado en "Servicios asignados". Eso se hace en el módulo "Equipo", editando el perfil de cada profesional.' },
    { problem: 'Cambié el precio y una cita vieja sigue con el valor anterior.', fix: 'Es correcto: el precio se copia a la cita cuando se agenda. El precio nuevo aplica a las reservas que se hagan de ahora en adelante.' },
    { problem: 'Activé el modo "Estricto" y ahora no puedo cobrar algunas citas.', fix: 'En modo estricto el cobro se bloquea si el inventario no alcanza para la receta. Repón el insumo o vuelve a "Flexible" mientras regularizas el stock.' },
    { problem: 'No encuentro dónde asignar profesionales o una categoría al servicio.', fix: 'Desde Servicios solo defines nombre, duración, precio e insumos. La asignación de profesionales vive en "Equipo".' },
  ],
  checklist: [
    { id: 's1', label: 'Creé un servicio de prueba con nombre, duración y precio.' },
    { id: 's2', label: 'Edité la duración o el precio de un servicio y guardé los cambios.' },
    { id: 's3', label: 'Abrí "Insumos", entendí la diferencia entre "Flexible" y "Estricto" y guardé una receta.' },
    { id: 's4', label: 'Sé que un servicio solo se reserva si un profesional lo tiene asignado en "Equipo".' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en este módulo aplica para ti; además, como Owner el catálogo de servicios que ves y editas depende de la organización seleccionada.',
    forWhat: 'Sirve para mantener catálogos y precios distintos por sede desde la misma cuenta. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, cuando revisa o estandariza los servicios de una o varias sedes.',
  },
  screens: [
    {
      title: 'El catálogo es por organización',
      screenshot: {
        src: null,
        alt: 'Pantalla "Servicios" del Owner: idéntica a la del Manager, pero los servicios listados corresponden a la organización activa. Al cambiar de sede en "Inicio", la lista se recarga con los servicios de esa sede.',
      },
      zones: [
        { n: 1, label: 'Organización activa', desc: 'define qué catálogo se muestra; se elige en "Inicio"', xPct: 25, yPct: 12 },
        { n: 2, label: 'Cuadrícula de servicios', desc: 'solo los servicios de la sede seleccionada', xPct: 45, yPct: 50 },
      ],
    },
  ],
  steps: [
    {
      id: 's5',
      title: 'Revisar o editar el catálogo de otra sede',
      substeps: [
        'Abre "Inicio" y cambia de organización en la tarjeta "Organización".',
        'Entra a "Servicios" desde la barra lateral.',
        'Crea o edita los servicios: los cambios aplican solo a esa sede.',
      ],
      expected: 'Trabajas el catálogo de la sede seleccionada sin afectar el de las demás.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Selector de organización (en "Inicio")', does: 'Define de qué sede se muestran y se editan los servicios.', when: 'Antes de entrar a "Servicios" cuando administras varias sedes.' },
  ],
  examples: [
    {
      scenario: 'Abriste una segunda sede y quieres copiar los mismos servicios con un precio un poco más alto.',
      walkthrough: [
        'En "Inicio", selecciona la segunda sede.',
        'Entra a "Servicios" y pulsa "Nuevo Servicio" por cada servicio, con el precio ajustado.',
        'Asigna los profesionales de esa sede a cada servicio desde "Equipo".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Edité un precio y cambió en la sede equivocada.', fix: 'El catálogo sigue a la sede activa. Vuelve a "Inicio", selecciona la sede correcta y entra a "Servicios" desde ahí.' },
  ],
  checklist: [
    { id: 's5', label: 'Cambié de organización y confirmé que "Servicios" mostró solo el catálogo de esa sede.' },
    { id: 's6', label: 'Creé o edité un servicio en una sede sin afectar las demás.' },
    { id: 's7', label: 'Entendí que las acciones y campos son los mismos que ve el Manager.' },
  ],
};

const servicios = {
  id: 'servicios',
  perRole: {
    owner,
    manager,
  },
};

export default servicios;

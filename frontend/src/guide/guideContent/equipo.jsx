// frontend/src/guide/guideContent/equipo.jsx
import {
  ArrowLeft,
  Plus,
  Mail,
  Edit2,
  Trash2,
  Clock,
  BarChart3,
  Star,
  AlertTriangle,
  RefreshCw,
  Briefcase,
  Target,
  CalendarClock,
  Building2,
  X,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'Equipo (o "Profesionales") es donde registras a las personas que atienden: sus datos, su horario, los servicios que hacen, su meta de ingresos y su tipo de contrato. Incluye la pestaña "Reseñas" y, por cada persona, una página de "Métricas".',
    forWhat: 'Sirve para que el equipo aparezca en las reservas con la disponibilidad correcta, y para seguir su desempeño, sus calificaciones y su costo.',
    whoUses: 'El Manager (y el Owner) al dar de alta al equipo y al revisar resultados cada semana o cada mes.',
  },
  screens: [
    {
      title: 'Cuadrícula del Equipo',
      screenshot: {
        src: null,
        alt: 'Pantalla "Profesionales": barra superior con "Volver", el título, el botón "Invitar por correo" y el botón "Crear manualmente"; debajo, una barra de pestañas "Equipo | Reseñas"; en la pestaña "Equipo", una cuadrícula de tarjetas, una por profesional, con la foto o inicial, el nombre, una etiqueta "Activo" o "Inactivo", el teléfono, el horario, los días y los servicios asignados; cada tarjeta tiene los botones "Editar perfil", "Desactivar", "Gestionar Horarios" y "Ver métricas".',
      },
      zones: [
        { n: 1, label: 'Invitar por correo', desc: 'crea la cuenta de acceso de la persona', xPct: 62, yPct: 12 },
        { n: 2, label: 'Crear manualmente', desc: 'abre el formulario del perfil profesional', xPct: 85, yPct: 12 },
        { n: 3, label: 'Pestañas Equipo / Reseñas', desc: 'cambia entre el equipo y sus calificaciones', xPct: 15, yPct: 24 },
        { n: 4, label: 'Etiqueta Activo / Inactivo', desc: 'los inactivos no aparecen para nuevas reservas', xPct: 40, yPct: 40 },
        { n: 5, label: 'Editar perfil / Desactivar', desc: 'acciones de la tarjeta', xPct: 70, yPct: 36 },
        { n: 6, label: 'Gestionar Horarios / Ver métricas', desc: 'bloqueos puntuales y página de métricas', xPct: 50, yPct: 66 },
      ],
    },
    {
      title: 'Pestaña "Reseñas"',
      screenshot: {
        src: null,
        alt: 'Pestaña "Reseñas" del equipo: una tarjeta con el "Promedio de la organización" y el total de reseñas, un botón "Actualizar", y una tabla ordenada con número, nombre del profesional, su calificación con estrellas, el número de reseñas y un botón "Ver métricas". Los profesionales con promedio menor a 3,5 muestran una etiqueta "Baja".',
      },
      zones: [
        { n: 1, label: 'Promedio de la organización', desc: 'calificación media ponderada de todo el equipo', xPct: 25, yPct: 20 },
        { n: 2, label: 'Actualizar', desc: 'vuelve a cargar el resumen de reseñas', xPct: 60, yPct: 20 },
        { n: 3, label: 'Etiqueta "Baja"', desc: 'aparece cuando el promedio del profesional es menor a 3,5', xPct: 45, yPct: 50 },
        { n: 4, label: 'Ver métricas', desc: 'abre la página de métricas de ese profesional', xPct: 85, yPct: 55 },
      ],
    },
    {
      title: 'Página de Métricas del profesional',
      screenshot: {
        src: null,
        alt: 'Página "Métricas" de un profesional: barra superior con "Volver", la foto y el nombre; un selector de periodo con "7 días", "30 días", "90 días", "6 meses" y "1 año"; tarjetas de Calificación, Servicios, Ingresos generados y ROI; bloques de horario, calificaciones internas, citas (completadas, canceladas, no asistió, tasa), finanzas del periodo (ingresos, comisión staff, propinas, ticket promedio, margen); un bloque "Tipo de contrato" con un enlace "Cambiar"; y un gráfico de barras "Desglose semanal".',
      },
      zones: [
        { n: 1, label: 'Selector de periodo', desc: '7 días, 30 días, 90 días, 6 meses o 1 año', xPct: 30, yPct: 20 },
        { n: 2, label: 'Tarjetas de métricas', desc: 'Calificación, Servicios, Ingresos generados y ROI', xPct: 50, yPct: 32 },
        { n: 3, label: 'Finanzas del periodo', desc: 'ingresos, comisión, propinas, ticket y margen', xPct: 50, yPct: 58 },
        { n: 4, label: 'Tipo de contrato · Cambiar', desc: 'alterna entre comisión y salario fijo', xPct: 80, yPct: 72 },
        { n: 5, label: 'Desglose semanal', desc: 'barras de ingresos y servicios por semana', xPct: 50, yPct: 90 },
      ],
    },
  ],
  steps: [
    {
      id: 'e1',
      title: 'Agregar un profesional',
      substeps: [
        'Pulsa "Crear manualmente".',
        'Completa "Nombre", "Apellido", "Nombre visible" y "Teléfono" (obligatorios).',
        'Si quieres, añade "Dirección", "Biografía profesional" y una fotografía.',
        'Pulsa "Crear profesional".',
      ],
      expected: 'El profesional aparece como una tarjeta nueva con la etiqueta "Activo".',
    },
    {
      id: 'e2',
      title: 'Definir su horario y sus días',
      substeps: [
        'Baja hasta la sección "Disponibilidad" del formulario.',
        'Marca los "Días disponibles" (al menos uno).',
        'Fija la "Hora de inicio" y la "Hora de fin" (la de fin debe ser posterior).',
        'Guarda con "Crear profesional" o "Guardar Cambios".',
      ],
      expected: 'El profesional solo ofrece horas para reservar dentro de esos días y ese rango.',
    },
    {
      id: 'e3',
      title: 'Asignar servicios y fijar una meta',
      substeps: [
        'En "Servicios asignados", marca los servicios que hace esa persona.',
        'En "Meta de ingresos", escribe un monto de referencia en "Meta (opcional)".',
        'Elige el "Periodo de la meta": "Semanal" o "Mensual".',
        'Guarda los cambios.',
      ],
      expected: 'El profesional aparece al reservar esos servicios y su avance hacia la meta se calcula en "Mis ingresos" y en el ranking.',
    },
    {
      id: 'e4',
      title: 'Bloquear un horario puntual',
      substeps: [
        'En la tarjeta del profesional, pulsa "Gestionar Horarios".',
        'Escribe la "Fecha", la "Hora inicio", la "Hora fin" y el "Motivo".',
        'Pulsa "Bloquear Horario".',
      ],
      expected: 'Ese rango deja de ofrecerse para reservas ese día. Puedes quitar el bloqueo con la papelera.',
    },
    {
      id: 'e5',
      title: 'Revisar las reseñas del equipo',
      substeps: [
        'Pulsa la pestaña "Reseñas".',
        'Mira el "Promedio de la organización" y la tabla por profesional.',
        'Fíjate en quién tiene la etiqueta "Baja" (promedio menor a 3,5).',
        'Pulsa "Ver métricas" para revisar a esa persona en detalle.',
      ],
      expected: 'Sabes qué profesionales necesitan atención y puedes abrir su página de métricas.',
    },
    {
      id: 'e6',
      title: 'Abrir las métricas de un profesional',
      substeps: [
        'Pulsa "Ver métricas" en la tarjeta o en la tabla de reseñas.',
        'Elige el periodo ("7 días", "30 días", "90 días", "6 meses" o "1 año").',
        'Revisa las tarjetas de Calificación, Servicios, Ingresos generados y ROI, y el "Desglose semanal".',
      ],
      expected: 'Ves el desempeño de esa persona en el periodo elegido.',
    },
    {
      id: 'e7',
      title: 'Configurar el tipo de contrato',
      substeps: [
        'En la página de métricas, baja hasta "Tipo de contrato" y pulsa "Cambiar".',
        'Elige "Comisión" (porcentaje sobre servicios) o "Salario fijo".',
        'Si es "Salario fijo", escribe el "Salario mensual (COP)"; se muestra el costo empleador estimado con el factor 1,52×.',
        'Pulsa "Guardar contrato".',
      ],
      expected: 'El ROI y el margen del negocio se recalculan con el contrato elegido.',
    },
  ],
  buttons: [
    { icon: ArrowLeft, name: 'Volver', does: 'Regresa al panel del manager.', when: 'Al terminar de gestionar el equipo.' },
    { icon: Mail, name: 'Invitar por correo', does: 'Lleva a Configuración para invitar a una persona y crear su cuenta de acceso.', when: 'Cuando el profesional necesita entrar a la app con su propio usuario.' },
    { icon: Plus, name: 'Crear manualmente', does: 'Abre el formulario de perfil profesional.', when: 'Cuando registras a alguien que no necesita cuenta de acceso todavía.' },
    { icon: Plus, name: 'Campos "Nombre" y "Apellido"', does: 'Datos personales del integrante del equipo.', when: 'Obligatorios al crear el perfil.' },
    { icon: Plus, name: 'Campo "Nombre visible"', does: 'Nombre que ven los clientes al reservar.', when: 'Obligatorio; suele ser nombre y apellido.' },
    { icon: Plus, name: 'Campo "Teléfono"', does: 'Contacto del profesional, con indicativo.', when: 'Obligatorio al crear el perfil.' },
    { icon: Plus, name: 'Campo "Dirección"', does: 'Dato de contacto interno.', when: 'Opcional.' },
    { icon: Plus, name: 'Campo "Biografía profesional"', does: 'Texto de hasta 500 caracteres sobre experiencia y especialidades.', when: 'Opcional; se puede mostrar al cliente.' },
    { icon: Plus, name: 'Fotografía del profesional', does: 'Sube o cambia la foto del perfil (se habilita después de crear el perfil).', when: 'Para que el cliente reconozca al profesional.' },
    { icon: CalendarClock, name: 'Días disponibles (Lun a Dom)', does: 'Botones que marcan o desmarcan cada día laboral.', when: 'Al definir la disponibilidad; al menos un día.' },
    { icon: Clock, name: 'Horas "de inicio" y "de fin"', does: 'Definen la jornada dentro de la cual se ofrecen reservas.', when: 'Al definir la disponibilidad; la de fin debe ser posterior a la de inicio.' },
    { icon: Target, name: 'Campo "Meta (opcional)"', does: 'Monto de referencia de lo que el profesional se lleva a casa (comisión + propinas).', when: 'Cuando quieres seguir un objetivo; solo lo fija el manager.' },
    { icon: Target, name: 'Selector "Periodo de la meta"', does: 'Define si la meta se mide "Semanal" o "Mensual".', when: 'Junto con el monto de la meta.' },
    { icon: Plus, name: 'Servicios asignados (casillas)', does: 'Marca qué servicios hace el profesional.', when: 'Al crear o editar; sin al menos uno no aparece al reservar.' },
    { icon: Plus, name: 'Toggle "Perfil activo"', does: 'Activa o desactiva el perfil. Los inactivos no aparecen para nuevas reservas.', when: 'Cuando la persona entra o sale del equipo temporalmente.' },
    { icon: Plus, name: 'Crear profesional / Guardar Cambios', does: 'Guarda el perfil nuevo o sus modificaciones.', when: 'Al terminar de llenar el formulario.' },
    { icon: Edit2, name: 'Editar perfil', does: 'Abre el formulario con los datos del profesional.', when: 'Para cambiar horario, servicios, meta o datos.' },
    { icon: Trash2, name: 'Desactivar', does: 'Deja al profesional inactivo tras confirmar; conserva sus citas e historial.', when: 'Cuando deja de atender pero quieres guardar su registro.' },
    { icon: Clock, name: 'Gestionar Horarios', does: 'Abre la ventana para bloquear rangos puntuales de un día.', when: 'Para almuerzos, permisos o citas personales.' },
    { icon: Clock, name: 'Campos "Fecha", "Hora inicio", "Hora fin", "Motivo"', does: 'Definen el bloqueo puntual.', when: 'Al crear un bloqueo de horario.' },
    { icon: Clock, name: 'Bloquear Horario', does: 'Guarda el bloqueo; el rango deja de ofrecerse ese día.', when: 'Tras llenar los datos del bloqueo.' },
    { icon: Trash2, name: 'Eliminar bloqueo (papelera)', does: 'Quita un horario bloqueado de la lista.', when: 'Cuando el permiso o descanso ya no aplica.' },
    { icon: BarChart3, name: 'Ver métricas', does: 'Abre la página de métricas del profesional.', when: 'Para revisar desempeño, calificaciones y finanzas.' },
    { icon: Star, name: 'Pestaña "Reseñas"', does: 'Muestra el promedio de la organización y la tabla de calificaciones por profesional.', when: 'Al revisar la satisfacción de los clientes.' },
    { icon: RefreshCw, name: 'Actualizar (pestaña Reseñas)', does: 'Vuelve a cargar el resumen de reseñas.', when: 'Si acabas de recibir calificaciones nuevas.' },
    { icon: RefreshCw, name: 'Reintentar (pestaña Reseñas)', does: 'Vuelve a intentar la carga del resumen del equipo cuando falló.', when: 'Cuando la pestaña "Reseñas" muestra un error de carga.' },
    { icon: AlertTriangle, name: 'Etiqueta "Baja"', does: 'Marca a los profesionales con promedio menor a 3,5.', when: 'Es un indicador; revisa a esa persona con "Ver métricas".' },
    { icon: CalendarClock, name: 'Selector de periodo (Métricas)', does: 'Cambia el rango de las métricas: 7 días, 30 días, 90 días, 6 meses o 1 año.', when: 'Según si quieres ver la tendencia corta o larga.' },
    { icon: BarChart3, name: 'Tarjeta "Ingresos/semana" (Finanzas)', does: 'Muestra el promedio de ingresos generados por semana en el periodo.', when: 'Para comparar el ritmo del profesional entre periodos.' },
    { icon: Briefcase, name: 'Tipo de contrato · "Cambiar"', does: 'Abre el editor de contrato.', when: 'Para pasar de comisión a salario fijo o al revés.' },
    { icon: Briefcase, name: 'Opciones "Comisión" / "Salario fijo"', does: 'Eligen cómo se le paga al profesional.', when: 'En el editor de contrato.' },
    { icon: Briefcase, name: 'Campo "Salario mensual (COP)"', does: 'Fija el salario base; muestra el costo empleador con el factor 1,52×.', when: 'Solo cuando el contrato es "Salario fijo".' },
    { icon: Briefcase, name: 'Guardar contrato', does: 'Guarda el tipo de contrato y recalcula ROI y margen.', when: 'Al terminar de configurar el contrato.' },
    { icon: X, name: 'Cancelar (editor de contrato)', does: 'Cierra el editor de contrato sin guardar los cambios.', when: 'Si abriste "Cambiar" por error o no quieres modificar el contrato.' },
    { icon: ArrowLeft, name: 'Volver (Métricas)', does: 'Regresa a la pantalla anterior.', when: 'Al terminar de revisar a un profesional.' },
  ],
  examples: [
    {
      scenario: 'Entra un barbero nuevo que trabaja de martes a sábado, de 10:00 a 19:00, y hace corte y barba.',
      walkthrough: [
        'Pulsa "Crear manualmente" y llena nombre, apellido, nombre visible y teléfono.',
        'En "Disponibilidad", marca Mar, Mié, Jue, Vie y Sáb, con inicio 10:00 y fin 19:00.',
        'En "Servicios asignados", marca "Corte" y "Barba".',
        'Deja el "Perfil activo" encendido y pulsa "Crear profesional".',
      ],
    },
    {
      scenario: 'En la pestaña "Reseñas" ves a una profesional con etiqueta "Baja" (promedio 3,1).',
      walkthrough: [
        'Pulsa "Ver métricas" en su fila.',
        'Elige el periodo "90 días" para ver la tendencia.',
        'Revisa "Calificaciones internas" y los comentarios recientes.',
        'Compara sus "Servicios" y su "Tasa completadas" con el resto del equipo para decidir el plan de acción.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Un profesional no aparece cuando el cliente intenta reservar.', fix: 'Revisa tres cosas: que el "Perfil activo" esté encendido, que tenga al menos un día disponible y una jornada válida, y que tenga marcados los "Servicios asignados" correspondientes.' },
    { problem: 'Fijé una meta pero los ingresos del negocio no cambian.', fix: 'La meta es solo un objetivo de referencia para el profesional; no modifica precios, comisiones ni los reportes de ingresos.' },
    { problem: 'Cambié el contrato a "Salario fijo" y el ROI se ve raro.', fix: 'Con salario fijo el ROI se calcula sobre el costo empleador (salario × 1,52). Confirma que el "Salario mensual" quedó bien escrito y pulsa "Guardar contrato".' },
    { problem: 'Desactivé a alguien por error.', fix: 'Vuelve a "Editar perfil" y enciende el toggle "Perfil activo". No se pierde su historial de citas.' },
  ],
  checklist: [
    { id: 'e1', label: 'Creé un profesional de prueba con sus datos obligatorios.' },
    { id: 'e2', label: 'Definí sus días, su jornada y sus "Servicios asignados".' },
    { id: 'e3', label: 'Le fijé una meta y elegí el periodo (semanal o mensual).' },
    { id: 'e4', label: 'Abrí la pestaña "Reseñas" y ubiqué la etiqueta "Baja".' },
    { id: 'e5', label: 'Entré a "Ver métricas", cambié el periodo y revisé el "Tipo de contrato".' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en este módulo aplica para ti; además, como Owner el equipo y las métricas que ves dependen de la organización seleccionada, así que puedes comparar sedes.',
    forWhat: 'Sirve para supervisar la nómina, el desempeño y las calificaciones de cada sede desde una sola cuenta. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, en las revisiones de resultados por sede.',
  },
  screens: [
    {
      title: 'El equipo y las métricas son por organización',
      screenshot: {
        src: null,
        alt: 'Pantalla "Profesionales" del Owner: idéntica a la del Manager, pero el equipo, la pestaña "Reseñas" y las páginas de métricas corresponden a la organización activa. Al cambiar de sede en "Inicio", todo se recarga con los datos de esa sede.',
      },
      zones: [
        { n: 1, label: 'Organización activa', desc: 'define qué equipo y qué métricas se muestran', xPct: 25, yPct: 12 },
        { n: 2, label: 'Cuadrícula del equipo', desc: 'solo los profesionales de la sede seleccionada', xPct: 45, yPct: 50 },
        { n: 3, label: 'Promedio de la organización', desc: 'en "Reseñas", corresponde a esa sede', xPct: 25, yPct: 24 },
      ],
    },
  ],
  steps: [
    {
      id: 'e6',
      title: 'Comparar el desempeño entre sedes',
      substeps: [
        'En "Inicio", selecciona la primera sede y abre "Equipo".',
        'Revisa la pestaña "Reseñas" y algunas páginas de "Ver métricas" con el mismo periodo.',
        'Vuelve a "Inicio", cambia a la otra sede y repite con el mismo periodo.',
      ],
      expected: 'Comparas calificaciones, servicios e ingresos por profesional entre sedes usando la misma ventana de tiempo.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Selector de organización (en "Inicio")', does: 'Define de qué sede se muestran el equipo, las reseñas y las métricas.', when: 'Antes de entrar a "Equipo" cuando administras varias sedes.' },
  ],
  examples: [
    {
      scenario: 'Quieres saber en qué sede el equipo está mejor calificado este trimestre.',
      walkthrough: [
        'En "Inicio", selecciona la sede A y abre "Equipo" → pestaña "Reseñas".',
        'Anota el "Promedio de la organización".',
        'Cambia a la sede B en "Inicio" y repite.',
        'Para los casos flojos, entra a "Ver métricas" con periodo "90 días".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Veo un equipo que no es el de la sede que quería revisar.', fix: 'El módulo sigue a la sede activa. Vuelve a "Inicio", selecciona la sede correcta y entra a "Equipo" desde ahí.' },
  ],
  checklist: [
    { id: 'e6', label: 'Cambié de organización y confirmé que "Equipo" y "Reseñas" mostraron solo esa sede.' },
    { id: 'e7', label: 'Comparé el promedio de reseñas de dos sedes con el mismo criterio.' },
    { id: 'e8', label: 'Entendí que los formularios y las métricas son los mismos que ve el Manager.' },
  ],
};

const equipo = {
  id: 'equipo',
  perRole: {
    owner,
    manager,
  },
};

export default equipo;

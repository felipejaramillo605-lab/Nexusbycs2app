// frontend/src/guide/guideContent/clientes.jsx
import {
  Search,
  ArrowLeft,
  LogOut,
  Phone,
  Mail,
  Eye,
  MessageSquare,
  Bell,
  BellOff,
  Send,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'Clientes es el directorio de personas que han reservado en el negocio. Muestra sus datos de contacto, sus visitas, sus puntos y su historial de citas.',
    forWhat: 'Sirve para buscar a un cliente, revisar cuántas veces ha venido y qué se hizo, controlar si acepta mensajes y enviarle un recordatorio o una promoción.',
    whoUses: 'El Manager (y el Owner). Los clientes se crean solos cuando reservan; desde aquí no se agregan a mano.',
  },
  screens: [
    {
      title: 'Directorio de Clientes',
      screenshot: {
        src: null,
        alt: 'Pantalla "Clientes": barra superior con "Volver" y "Salir"; tarjeta con el total de clientes registrados; un buscador con los botones "Buscar" y "Limpiar"; una tabla con columnas Cliente (con etiqueta Registrado o Invitado), Teléfono, Email, Visitas, Puntos, Última Visita, un interruptor de notificaciones y las acciones "Ver Historial" y "Enviar Mensaje"; abajo, paginación.',
      },
      zones: [
        { n: 1, label: 'Total de clientes', desc: 'número de clientes registrados en la sede', xPct: 20, yPct: 18 },
        { n: 2, label: 'Buscador', desc: 'busca por nombre, teléfono o correo', xPct: 40, yPct: 30 },
        { n: 3, label: 'Etiqueta Registrado / Invitado', desc: 'si el cliente creó cuenta o solo reservó como invitado', xPct: 22, yPct: 52 },
        { n: 4, label: 'Interruptor de notificaciones', desc: 'activa o desactiva el envío de mensajes de marketing a ese cliente', xPct: 68, yPct: 52 },
        { n: 5, label: 'Ver Historial', desc: 'abre un panel lateral con todas sus citas', xPct: 82, yPct: 52 },
        { n: 6, label: 'Enviar Mensaje', desc: 'abre la ventana para enviarle un mensaje por WhatsApp', xPct: 92, yPct: 52 },
      ],
    },
    {
      title: 'Panel "Ver Historial"',
      screenshot: {
        src: null,
        alt: 'Panel lateral "Historial de [cliente]": arriba el nombre y, debajo, el teléfono y el correo; luego una lista de citas, cada una con el servicio, el profesional, el valor, el estado (Confirmada o Cancelada), la fecha y la hora.',
      },
      zones: [
        { n: 1, label: 'Nombre del cliente', desc: 'encabezado del panel', xPct: 35, yPct: 10 },
        { n: 2, label: 'Contacto del cliente', desc: 'teléfono y correo registrados', xPct: 40, yPct: 20 },
        { n: 3, label: 'Tarjetas de cita', desc: 'servicio, profesional, valor, estado, fecha y hora de cada visita', xPct: 50, yPct: 58 },
      ],
    },
  ],
  steps: [
    {
      id: 'c1',
      title: 'Buscar un cliente',
      substeps: [
        'Abre "Clientes" desde la barra lateral o desde "Acciones rápidas" del panel.',
        'Escribe en el buscador un nombre, un teléfono o un correo.',
        'Pulsa "Buscar".',
        'Para volver a la lista completa, pulsa "Limpiar".',
      ],
      expected: 'La tabla muestra solo los clientes que coinciden con lo que escribiste.',
    },
    {
      id: 'c2',
      title: 'Revisar el historial de visitas',
      substeps: [
        'Ubica al cliente en la tabla.',
        'Mira las columnas "Visitas", "Puntos" y "Última Visita" para una idea rápida.',
        'Pulsa "Ver Historial" para abrir el panel lateral con cada cita: servicio, profesional, valor, estado, fecha y hora.',
      ],
      expected: 'Sabes cuántas veces ha venido el cliente, qué servicios se ha hecho y con quién.',
    },
    {
      id: 'c3',
      title: 'Entender el consentimiento de marketing',
      substeps: [
        'En la fila del cliente, mira el interruptor de notificaciones.',
        'Verde con campana: el cliente acepta recibir mensajes de marketing.',
        'Gris con campana tachada: no acepta; respeta esa preferencia.',
        'Pulsa el interruptor para cambiarlo solo si el cliente te lo pidió.',
      ],
      expected: 'El estado del interruptor refleja si puedes enviarle mensajes promocionales a ese cliente.',
    },
    {
      id: 'c4',
      title: 'Enviar un mensaje por WhatsApp',
      substeps: [
        'Pulsa "Enviar Mensaje" en la fila del cliente.',
        'Elige una plantilla: "Recordatorio", "Reactivación" o "Promoción".',
        'Revisa la "Vista previa del mensaje".',
        'Si quieres, escribe un "Mensaje personalizado" que reemplaza la plantilla.',
        'Pulsa "Enviar Mensaje".',
      ],
      expected: 'Se abre el envío por WhatsApp con el texto elegido para ese cliente.',
    },
    {
      id: 'c5',
      title: 'Moverte entre páginas',
      substeps: [
        'Baja al pie de la tabla.',
        'Usa las flechas para pasar a la página anterior o siguiente (20 clientes por página).',
      ],
      expected: 'Recorres todo el directorio sin perder el filtro de búsqueda.',
    },
  ],
  buttons: [
    { icon: ArrowLeft, name: 'Volver', does: 'Regresa al panel "Inicio".', when: 'Cuando terminas de revisar clientes.' },
    { icon: LogOut, name: 'Salir', does: 'Cierra tu sesión y vuelve al inicio de sesión.', when: 'Al terminar tu turno o en un equipo compartido.' },
    { icon: Search, name: 'Campo de búsqueda', does: 'Filtra el directorio por nombre, teléfono o correo.', when: 'Cuando buscas a un cliente concreto.' },
    { icon: Search, name: 'Buscar', does: 'Ejecuta la búsqueda con el texto escrito.', when: 'Después de escribir en el buscador.' },
    { icon: Search, name: 'Limpiar', does: 'Borra la búsqueda y vuelve a mostrar todos los clientes.', when: 'Cuando terminaste de revisar un resultado.' },
    { icon: Users, name: 'Etiqueta Registrado / Invitado', does: 'Indica si el cliente tiene cuenta en el portal (Registrado) o solo reservó una vez (Invitado). Es informativa.', when: 'Para saber si el cliente puede gestionar sus citas por su cuenta.' },
    { icon: Bell, name: 'Interruptor de notificaciones (activado)', does: 'Marca que el cliente acepta mensajes de marketing.', when: 'Actívalo solo si el cliente dio su consentimiento.' },
    { icon: BellOff, name: 'Interruptor de notificaciones (desactivado)', does: 'Marca que el cliente no quiere mensajes de marketing.', when: 'Déjalo así si el cliente pidió no recibir mensajes.' },
    { icon: Eye, name: 'Ver Historial', does: 'Abre el panel lateral con todas las citas del cliente (servicio, profesional, valor, estado, fecha y hora).', when: 'Antes de atender o llamar a un cliente, para conocer su historia.' },
    { icon: MessageSquare, name: 'Enviar Mensaje', does: 'Abre la ventana de mensaje por WhatsApp.', when: 'Para recordar una cita, reactivar a un cliente o compartir una promoción.' },
    { icon: MessageSquare, name: 'Plantilla "Recordatorio"', does: 'Prepara un texto de recordatorio de cita.', when: 'Un día antes de la cita del cliente.' },
    { icon: MessageSquare, name: 'Plantilla "Reactivación"', does: 'Prepara un texto para clientes que llevan tiempo sin venir.', when: 'Cuando quieres recuperar clientes inactivos.' },
    { icon: MessageSquare, name: 'Plantilla "Promoción"', does: 'Prepara un texto con una oferta.', when: 'Al lanzar una promoción y solo a clientes que aceptan marketing.' },
    { icon: MessageSquare, name: 'Mensaje personalizado', does: 'Reemplaza la plantilla con el texto que tú escribas.', when: 'Cuando el mensaje estándar no encaja.' },
    { icon: Send, name: 'Enviar Mensaje (dentro de la ventana)', does: 'Envía el mensaje por WhatsApp al cliente.', when: 'Cuando la vista previa es correcta.' },
    { icon: ChevronLeft, name: 'Página anterior', does: 'Muestra la página anterior del directorio.', when: 'Para volver a clientes ya revisados.' },
    { icon: ChevronRight, name: 'Página siguiente', does: 'Muestra la página siguiente del directorio.', when: 'Para seguir recorriendo la lista.' },
  ],
  examples: [
    {
      scenario: 'Un cliente llama y quieres recordar qué corte se hizo la última vez y con quién.',
      walkthrough: [
        'Abre "Clientes" y busca su nombre o teléfono.',
        'Pulsa "Buscar".',
        'Pulsa "Ver Historial" en su fila.',
        'Revisa la cita más reciente: servicio, profesional y fecha.',
      ],
    },
    {
      scenario: 'Vas a avisar de una promoción de temporada, pero solo a quien aceptó recibir mensajes.',
      walkthrough: [
        'En "Clientes", revisa el interruptor de notificaciones de cada cliente.',
        'Para los que están en verde, pulsa "Enviar Mensaje".',
        'Elige la plantilla "Promoción" y revisa la vista previa.',
        'Pulsa "Enviar Mensaje".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No encuentro dónde crear o editar un cliente.', fix: 'El directorio no tiene formulario para agregar clientes: se crean automáticamente cuando la persona reserva. Para corregir un dato, pídele al cliente que lo actualice al reservar o desde su portal.' },
    { problem: 'Un cliente aparece dos veces.', fix: 'Suele pasar cuando reservó con teléfonos o correos distintos. No hay unión de fichas desde esta pantalla; usa la búsqueda por teléfono para trabajar con la ficha que tenga el historial más completo.' },
    { problem: 'El cliente no tiene teléfono ni correo y no puedo escribirle.', fix: 'Esos datos vienen de lo que la persona puso al reservar. Pídeselos en el local y que reserve la próxima vez con esa información.' },
    { problem: 'Envié un mensaje de promoción y el cliente se quejó.', fix: 'Revisa el interruptor de notificaciones: solo se debe enviar marketing a quien lo tiene activado. Desactívalo para ese cliente.' },
  ],
  checklist: [
    { id: 'c1', label: 'Busqué un cliente por nombre y luego usé "Limpiar".' },
    { id: 'c2', label: 'Abrí "Ver Historial" de un cliente y revisé sus citas.' },
    { id: 'c3', label: 'Identifiqué qué clientes aceptan mensajes de marketing por el interruptor.' },
    { id: 'c4', label: 'Preparé un mensaje con una plantilla y revisé la vista previa.' },
    { id: 'c5', label: 'Recorrí el directorio con la paginación.' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en Clientes aplica para ti; además, como Owner el directorio que ves corresponde a la organización seleccionada en "Inicio".',
    forWhat: 'Sirve para consultar y contactar clientes de cualquiera de tus sedes desde la misma pantalla. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, cuando revisa la base de clientes de una o varias sedes.',
  },
  screens: [
    {
      title: 'El directorio es por organización',
      screenshot: {
        src: null,
        alt: 'Directorio de Clientes del Owner: idéntico al del Manager, con el nombre de la sede junto al título; el buscador y la tabla operan solo sobre los clientes de la organización activa.',
      },
      zones: [
        { n: 1, label: 'Nombre de la sede', desc: 'aparece junto al título "Clientes"', xPct: 30, yPct: 12 },
        { n: 2, label: 'Buscador', desc: 'busca dentro de los clientes de esa sede', xPct: 40, yPct: 30 },
        { n: 3, label: 'Lista de clientes', desc: 'solo los de la organización seleccionada', xPct: 50, yPct: 58 },
      ],
    },
  ],
  steps: [
    {
      id: 'c6',
      title: 'Consultar los clientes de otra sede',
      substeps: [
        'Abre "Inicio" y cambia de organización en la tarjeta "Organización".',
        'Entra a "Clientes" desde la barra lateral.',
        'El directorio muestra únicamente los clientes de esa sede.',
      ],
      expected: 'Trabajas con la base de clientes de la sede seleccionada, sin mezclar con otras.',
    },
  ],
  buttons: [
    { icon: Users, name: 'Selector de organización (en "Inicio")', does: 'Define de qué sede se muestran los clientes.', when: 'Antes de entrar a "Clientes" cuando administras varias sedes.' },
  ],
  examples: [
    {
      scenario: 'Quieres saber cuántos clientes registrados tiene tu segunda sede.',
      walkthrough: [
        'En "Inicio", selecciona la segunda sede.',
        'Abre "Clientes".',
        'Lee el número en la tarjeta "Clientes Registrados".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Veo clientes que no son de la sede que quería.', fix: 'Vuelve a "Inicio", selecciona la sede correcta y entra a "Clientes" desde ahí.' },
  ],
  checklist: [
    { id: 'c6', label: 'Cambié de organización y confirmé que el directorio mostró solo esa sede.' },
    { id: 'c7', label: 'Revisé el total de clientes registrados de una sede.' },
    { id: 'c8', label: 'Entendí que las acciones son las mismas que ve el Manager.' },
  ],
};

const staff = {
  summary: {
    what: 'Como profesional no tienes un módulo de Clientes. La información del cliente la ves dentro de cada cita, en "Mis citas", y es de solo lectura.',
    forWhat: 'Sirve para conocer a quién vas a atender y poder contactarlo si hace falta, sin acceder a la base completa de clientes.',
    whoUses: 'Cada profesional, al preparar una cita.',
  },
  screens: [
    {
      title: 'Datos del cliente en el detalle de la cita',
      screenshot: {
        src: null,
        alt: 'Panel lateral de detalle de una cita en "Mis citas": muestra estado, fecha, hora, duración, nombre del cliente y si el cobro está registrado o pendiente; abajo, los botones "Llamar" y "Correo" cuando la cita tiene esos datos.',
      },
      zones: [
        { n: 1, label: 'Nombre del cliente', desc: 'a quién vas a atender en esa cita', xPct: 40, yPct: 45 },
        { n: 2, label: 'Estado del cobro', desc: 'Registrado o Pendiente', xPct: 40, yPct: 58 },
        { n: 3, label: 'Llamar / Correo', desc: 'contacto directo con el cliente', xPct: 60, yPct: 78 },
      ],
    },
  ],
  steps: [
    {
      id: 'c9',
      title: 'Consultar el cliente antes de atenderlo',
      substeps: [
        'Abre "Mis citas" y elige "Hoy" o "Próximas".',
        'Pulsa "Ver detalle" en la cita.',
        'Lee el nombre del cliente, la duración y el estado del cobro.',
        'Si necesitas confirmar algo, pulsa "Llamar" o "Correo".',
      ],
      expected: 'Llegas a la cita sabiendo a quién atiendes y con qué servicio.',
    },
  ],
  buttons: [
    { icon: Eye, name: 'Ver detalle (en "Mis citas")', does: 'Abre el panel con los datos del cliente y la cita.', when: 'Para conocer al cliente antes de atenderlo.' },
    { icon: Phone, name: 'Llamar', does: 'Abre el marcador con el teléfono del cliente.', when: 'Para confirmar o avisar algo de la cita.' },
    { icon: Mail, name: 'Correo', does: 'Abre tu app de correo con la dirección del cliente.', when: 'Cuando prefieres escribirle.' },
  ],
  examples: [
    {
      scenario: 'Tu próxima cita es con alguien cuyo nombre no reconoces y quieres saber el servicio.',
      walkthrough: [
        'Abre "Mis citas" y elige "Hoy".',
        'Pulsa "Ver detalle" en esa cita.',
        'Revisa el servicio, la duración y el nombre del cliente.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No puedo editar los datos de un cliente.', fix: 'Es correcto: como profesional solo consultas la información del cliente dentro de la cita. Cualquier cambio lo hace la administración.' },
    { problem: 'No veo el historial completo del cliente.', fix: 'El historial general de clientes es un módulo de la administración. Tú ves solo los datos de la cita que vas a atender.' },
  ],
  checklist: [
    { id: 'c9', label: 'Abrí "Ver detalle" de una cita y ubiqué el nombre del cliente.' },
    { id: 'c10', label: 'Consulté los datos del cliente en "Ver detalle" antes de atenderlo.' },
    { id: 'c11', label: 'Probé "Llamar" o "Correo" para contactar a un cliente desde una cita.' },
    { id: 'c12', label: 'Sé que los datos del cliente son de solo lectura y que la administración los gestiona.' },
  ],
};

const clientes = {
  id: 'clientes',
  perRole: {
    owner,
    manager,
    staff,
  },
};

export default clientes;

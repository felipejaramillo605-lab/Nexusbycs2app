# Paquete legal de Nexus by CS2 — versión 2.0

> **Estado:** versión 2.0, vigente desde el 5 de octubre de 2026, revisada por el abogado del Prestador. Los textos son editables desde el panel Owner (Documentos legales); un cambio de fondo se publica como nueva versión y obliga a aceptar de nuevo.
> **Datos del Responsable que se usan como marcador:** `{{CC_RESPONSABLE}}` y `{{DIRECCION_COMPLETA}}` **no están en el repositorio**: se cargan desde el panel Owner y solo se muestran a usuarios registrados que aceptan el contrato (ver `03-contrato-transmision-datos.md`, cláusula 14).

## Responsable (identificación pública)
- **Nombre:** Felipe Jaramillo Parra, persona natural (comerciante) que opera la plataforma bajo el nombre comercial "Nexus by CS2".
- **Municipio:** La Estrella, Antioquia, Colombia.
- **Correo para solicitudes:** nexusbycs2@gmail.com
- **Teléfono para atención de solicitudes (consultas, reclamos, derechos del titular):** +57 323 907 0485
- **Documento de identidad y dirección completa:** disponibles solo para usuarios registrados que aceptan el contrato (no públicos).

## Índice
| # | Documento | Para quién | Estado |
|---|---|---|---|
| 01 | Política de Tratamiento de Datos Personales v2 | Público (clientes finales, usuarios) | Vigente |
| 02 | Términos y Condiciones de Servicio v2 | Negocios (Owners/Managers) | Vigente |
| 03 | Contrato y Anexo de Transmisión de Datos (DPA) | Negocios, al registrarse | Vigente |
| 04 | Manual interno de Políticas y Procedimientos | Interno (Decreto 1377/2013) | Vigente |
| 05 | Protocolo de Incidentes de Seguridad | Interno | Vigente |
| 06 | Política de Uso Aceptable y de Inteligencia Artificial | Negocios y público | Vigente |
| 07 | Retención, supresión y subencargados | Interno y público (resumen) | Vigente |
| 08 | Operar como persona natural y cuándo crear una sociedad | Fundador | Informe |

## Decisiones de diseño que el abogado debe validar
1. **Roles:** cada negocio es **Responsable** de los datos de sus clientes finales; Nexus es **Encargado** (transmisión, no transferencia). Nexus es Responsable de los datos de sus propios usuarios (Owners, Managers, Staff) y de la operación de la plataforma. ¿Hay supuestos de **corresponsabilidad**?
2. **RNBD:** el Decreto 090 de 2018 limitó el registro a personas jurídicas con activos totales sobre un umbral alto (las fuentes consultadas citan 610.000 UVT; otras 100.000 UVT: confirmar). Hoy el Responsable es persona natural: se asume **no obligado a registrar**, pero **sí sujeto a toda la Ley 1581**. Confirmar y definir qué cambia al constituir una sociedad.
3. **Transmisiones internacionales** (Cloudflare R2, Resend, Google, hosting en la nube, MongoDB Atlas, IONOS, Meta/WhatsApp, y en el futuro un proveedor de IA): la SIC (Circular Externa 005 de 2017) incluye a EE. UU. entre los países con nivel adecuado, pero el exportador sigue siendo responsable y la transmisión a encargados en el exterior exige contrato de transmisión o autorización. Verificar el estado de la Circular Única y de cada contrato de proveedor.
4. **Limitación de responsabilidad e indemnidad** (Términos, cláusulas 12 y 13): validar exigibilidad en relaciones B2B y la prohibición de cláusulas abusivas. **No** se pretende excluir dolo ni culpa grave.
5. **Aceptación electrónica** como prueba (Ley 527 de 1999, Decreto 2364 de 2012): se guarda versión del documento, huella (hash), fecha/hora, IP y usuario.
6. **Datos sensibles:** el tipo de negocio "Consultorio" y los de bienestar pueden inducir a cargar información de salud (dato sensible, Ley 1581 arts. 5 y 6; historias clínicas reguladas por la Resolución 1995 de 1999). La política de uso prohíbe cargar historias clínicas o diagnósticos; validar el texto y si se requiere un régimen reforzado.
7. **Menores de edad:** clientes finales menores requieren autorización del representante (Ley 1581 art. 7, Decreto 1377 art. 12). Validar el flujo de reserva para menores.
8. **Mensajería comercial:** Ley 2300 de 2023 (horario lunes–viernes 7:00–19:00, sábados 8:00–15:00, nunca domingos ni festivos) ya implementada en código para publicidad; validar si recordatorios y avisos operativos deben tratarse igual.
9. **Florida / EE. UU.:** fuera de alcance. **No operar allí** sin abogado licenciado (TCPA, CAN-SPAM, FIPA).
10. **Reformas en trámite** (PLE 274 y 214 de 2025, reforma de la Ley 1581; proyectos de ley de IA): el paquete se diseñó con responsabilidad demostrada, oficial de protección de datos y evaluaciones de impacto como si ya fueran exigibles.

## Inventario de datos (para el registro de actividades de tratamiento)
| Categoría | Titulares | Dónde | Finalidad | Retención propuesta |
|---|---|---|---|---|
| Identificación y contacto (nombre, teléfono, correo) | Clientes finales | MongoDB | Reservas, recordatorios | Mientras haya relación + 2 años de inactividad |
| Historial de citas y cobros | Clientes finales | MongoDB | Prestación del servicio, contabilidad del negocio | 10 años los soportes contables que el negocio deba conservar; el resto 2 años |
| Consentimiento de marketing (texto, fecha, IP) | Clientes finales | MongoDB | Prueba de autorización | Mientras dure el tratamiento + 5 años |
| Cuentas de Owners/Managers/Staff | Usuarios del negocio | MongoDB, Google (login) | Acceso a la plataforma | Mientras exista la cuenta + 1 año |
| Fotos/logos/fondos | Negocio y su personal | Cloudflare R2 + espejo MongoDB | Personalización del portal | Hasta que el negocio las borre o termine el contrato |
| Correos transaccionales y eventos de entrega | Clientes y usuarios | Resend (EE. UU.), MongoDB (hash/enmascarado) | Entregar mensajes | 90 días (eventos) |
| Registros de auditoría y de seguridad | Usuarios | MongoDB | Seguridad y rendición de cuentas | 2 años |
| Textos de soporte | Usuarios del negocio | MongoDB (y, si se aprueba, proveedor de IA enmascarado) | Atención de soporte | 2 años |

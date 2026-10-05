# Retención, supresión y subencargados — Nexus by CS2 (v1)

> **Versión 2.1** · vigente desde el 5 de octubre de 2026. Los soportes contables que cada negocio deba conservar dependen del negocio Responsable y de su contador.

## 1. Tabla de retención propuesta
| Dato / colección | Plazo propuesto | Evento que inicia | Qué pasa al vencer |
|---|---|---|---|
| Clientes finales (identificación, contacto, preferencias) | Mientras haya relación + **2 años de inactividad** | Última cita o interacción | Anonimizar o suprimir, salvo petición del negocio |
| Citas y servicios realizados | 2 años desde la cita (los soportes **contables** que el negocio deba conservar: 10 años, a cargo del negocio) | Fecha de la cita | Anonimizar datos personales, conservar agregados |
| Consentimiento de marketing (texto, fecha, IP) | Mientras dure el tratamiento + **5 años** | Fecha de la autorización o de la revocatoria | Suprimir |
| Solicitudes ARCO y respuestas | **5 años** | Fecha de respuesta | Suprimir |
| Cuentas de Owners/Managers/Staff | Mientras exista la cuenta + **1 año** | Baja de la cuenta | Anonimizar (ya se hace al eliminar) |
| Sesiones y tokens | Hasta su vencimiento | Emisión | Borrado automático |
| Eventos de entrega de correo (Resend) | **90 días** (ya implementado, TTL) | Evento | Borrado automático |
| Registros de auditoría y de seguridad | **2 años** | Evento | Archivar o suprimir |
| Imágenes (R2 + espejo Mongo) | Hasta que el negocio las borre o termine el contrato (+ ≤90 días) | Borrado/terminación | Borrar objeto en R2 y espejo |
| Textos de soporte | 2 años | Cierre del ticket | Suprimir |
| Puntajes de riesgo de clientes (cuando se active) | Se recalculan; se borran al cambiar o al suprimir al cliente | Cálculo | Borrado |
| Respaldos | Máx. **35 días** de rotación | Creación | Sobrescritura |
| Organización eliminada (archivo lógico) | **90 días** hasta supresión definitiva, salvo obligación legal; datos personales de miembros ya anonimizados | Fecha de eliminación | Supresión definitiva programada |

## 2. Supresión de extremo a extremo (qué hay que tocar)
MongoDB (clientes, citas, sesiones, consentimientos) · Cloudflare R2 y espejo `media_blobs` · listas de supresión de Resend (solo para **bloquear** envíos, no para borrar el derecho) · proveedor de IA (no se guarda texto; solo hash/longitud) · respaldos (por rotación) · caches. **Pendiente de implementar** (ver tareas): job de retención y supresión que cubra R2 y espejo, y exportación de datos del titular.

## 3. Subencargados vigentes
| Subencargado | Servicio | Datos | País | Contrato / base | Revisado |
|---|---|---|---|---|---|
| Hosting y nube (Emergent / infraestructura AWS) | Ejecuta la aplicación | Todos los datos de la aplicación | EE. UU. | Términos del proveedor + este contrato | Pendiente confirmar región |
| MongoDB Atlas (MongoDB, Inc.) | Base de datos | Todos | EE. UU. / región de la nube | DPA de MongoDB | Pendiente confirmar región y DPA firmado |
| Cloudflare, Inc. (R2) | Imágenes | Fotos, logos, fondos | EE. UU. / global (ubicación automática) | DPA de Cloudflare | Pendiente archivar DPA |
| Resend, Inc. | Correo transaccional | Nombre, correo, contenido del mensaje | EE. UU. (región São Paulo para envío) | DPA de Resend | Pendiente archivar DPA |
| IONOS | Dominio, DNS, correo corporativo | Correos del soporte | UE / EE. UU. | Contrato IONOS | OK |
| Google LLC | Inicio de sesión; en el futuro, modelos de IA | Identidad del usuario del negocio; texto enmascarado | EE. UU. | Términos de Google / DPA | Pendiente |
| Meta Platforms (WhatsApp Business) | Mensajería | Teléfono y texto de mensajes | EE. UU. | Términos de WhatsApp Business | Solo cuando el negocio lo habilite |
| Wompi / Stripe | Pagos | Datos de pago (no los almacena Nexus) | CO / EE. UU. | Contrato del negocio con el procesador | Solo si el negocio cobra en la plataforma |
| TypeSafe (Jev) | Clasificación de texto | Texto enmascarado de soporte | EE. UU. | **No activo.** Requiere aviso, enmascarado v2, clave propia y evaluación | ⏸️ |

**Regla:** ningún proveedor nuevo entra a producción con datos reales sin actualizar esta tabla, la política de privacidad y el contrato de transmisión, y sin avisar a los negocios con 15 días de anticipación.

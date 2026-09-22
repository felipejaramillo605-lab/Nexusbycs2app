# Auditoría de seguridad: Servicios, Clases y media

Fecha: 2026-09-22
Base revisada: `818b1828a79a124664c9e66c512141cc5d50a801` (`origin/main`)

## Alcance

Revisión estática de rutas públicas y autenticadas de clases, reservas, lista de espera, catálogo y media. Se revisaron `backend/server.py`, `backend/class_schedule.py`, `backend/product_catalog.py`, `backend/service_media.py`, `backend/professional_media.py`, `backend/organization_media.py`, `backend/platform_branding.py`, `backend/request_security.py` y consumidores relevantes del frontend.

La escritura y lectura de media gestionada conservan aislamiento de organización, validación estricta de rutas, límite de 5 MiB, normalización a WebP y `nosniff`; no se confirmó traversal ni una escritura cross-tenant en esas superficies. No existe todavía un endpoint de fondo/video para el portal: queda fuera de esta revisión y deberá entrar en el threat model de la Tarea 4.

## Hallazgos

### Crítico — passwordless expone secretos del cliente

`POST /api/public/auth/passwordless` busca por teléfono y `organization_id` sin autenticación y devuelve el documento completo de `clients`. Ese documento puede contener `pin_hash`, `pin_reset_token`, vencimiento de reset, contadores, IP de consentimiento y otros datos privados. El token de reset se almacena en texto plano y el flujo de restablecimiento lo acepta, por lo que conocer teléfono y organización puede derivar en toma de cuenta si hay token activo.

Archivos: `backend/server.py:2885-2905`, `backend/server.py:407-437`, `backend/server.py:7455-7515`.

Corrección propuesta: responder una proyección pública mínima, excluir permanentemente secretos y estado interno, almacenar tokens de recuperación hasheados y limitar la ruta.

### Alto — checkout público puede agotar inventario

`POST /api/public/{organization_id}/catalog/checkout` descuenta stock y crea una orden `pending_pickup` sin sesión, pago, verificación ni rate limit. Un actor puede repetir carritos de hasta 999 unidades por línea y bloquear ventas legítimas.

Archivo: `backend/product_catalog.py:421-519`.

Corrección propuesta: reservar solo tras pago o una reserva autenticada, corta y expirable; limitar por organización/IP y acotar el volumen del carrito.

### Alto — cancelación pública de clase sin autorización suficiente

`POST /api/public/class-bookings/{class_booking_id}/cancel` cambia cualquier reserva confirmada solo con el identificador opaco, sin sesión, token de cancelación, alcance de organización ni rate limit. La ruta del portal sí verifica `client_id`.

Archivo: `backend/server.py:3923-3928`.

Corrección propuesta: retirar la mutación de invitado o requerir un secreto de cancelación aleatorio, expirable y asociado a la organización; conservar la comprobación de titularidad del portal.

### Alto — reintento concurrente de cancelación puede sobrepromover la lista de espera

La transición de cancelación lee el estado y después actualiza solo por ID sin exigir `status=confirmed` ni comprobar `modified_count`. Cada ejecución decrementa cupo y promueve lista de espera, por lo que dos solicitudes concurrentes pueden promocionar más personas que plazas liberadas.

Archivo: `backend/server.py:3855-3873`.

Corrección propuesta: transición atómica e idempotente `confirmed → cancelled`, comprobar el resultado antes de tocar cupo/promoción y usar transacción MongoDB cuando esté disponible.

### Medio — salida pública de lista de espera sin titularidad

`POST /api/public/waitlist/{waitlist_id}/leave` cambia una entrada `waiting` con solo su ID, sin autenticación, token ni rate limit.

Archivo: `backend/server.py:3915-3920`.

Corrección propuesta: eliminar la ruta de invitado o usar secreto expirable por entrada y limitación; mantener comprobación de `client_id` en portal.

### Medio — reserva pública atribuye acciones por teléfono sin verificación

El flujo público reutiliza el `client_id` existente con `organization_id` y teléfono sin demostrar posesión de ese número. Un tercero puede ocupar un cupo o entrar a la lista bajo el historial de otra persona.

Archivo: `backend/server.py:3625-3720`.

Corrección propuesta: exigir sesión de cliente u OTP antes de asociar una acción a un cliente existente; dejar el invitado como pendiente hasta confirmar.

### Bajo — organización pública devuelve el documento completo

`GET /api/public/{organization_id}/organization` elimina solo `_id` y devuelve el resto. Expone `owner_id` y configuración operativa que no requiere el booking, y hará públicos campos futuros por defecto.

Archivo: `backend/server.py:2876-2882`.

Corrección propuesta: proyección explícita de contrato público y una prueba que impida ampliar la respuesta accidentalmente.

## Riesgos y siguiente paso

No se hicieron cambios de producto en esta tarea. Antes de desplegar nuevas funciones, crear una rama correctiva independiente, atender primero el hallazgo crítico y los tres altos, y validar con pruebas de autorización, concurrencia y reservas. Esta revisión fue estática: proxy/TLS, MongoDB, correo, límites distribuidos y almacenamiento persistente de producción requieren validación en Preview.

## Seguimiento posterior a la auditoría (2026-09-22)

La base actual es `c6acba8` o posterior. Los hallazgos de este informe recibieron
correcciones independientes en `main`: filtración de secretos de passwordless
(#22), autorización y carrera de cancelación/lista de espera (#23), bypass de
membresías (#24), zona horaria y descripción corta (#25), checkout de catálogo
(#26), y proyección pública de organización (#27). Cada corrección debe conservar
sus pruebas de regresión; este documento no sustituye la revisión de sus PRs.

### Medio — atribución por teléfono en el flujo de invitado (mitigación parcial)

La rama de seguimiento limita las reservas y entradas a lista de espera públicas
a 5 acciones por hora por combinación de organización y teléfono normalizado. La
clave se deriva con SHA-256, por lo que el número no queda expuesto en las claves
del limitador ni en su telemetría. El límite se aplica antes de modificar cupos,
crear clientes o insertar reservas/listas de espera y complementa el límite por IP
existente.

Esto reduce la automatización y el daño por abuso, pero no demuestra posesión del
número: un actor todavía podría hacer hasta cinco acciones por hora con un número
de tercero conocido. La solución definitiva pendiente es verificar el teléfono
mediante OTP o asociar el flujo a una sesión temporal de invitado antes de reutilizar
un cliente existente. Además, el limitador actual es en memoria por proceso; para
una garantía entre réplicas deberá migrarse a un almacén compartido.

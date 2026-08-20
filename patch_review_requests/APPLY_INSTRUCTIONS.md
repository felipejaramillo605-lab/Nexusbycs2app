# Feature: Solicitud automática de reseña post-checkout

## Contenido

```
patches/
  server.py               → reemplaza backend/server.py
  email_service.py        → reemplaza backend/email_service.py
  reminder_daemon.py      → reemplaza backend/reminder_daemon.py
  review_requests.py      → NUEVO, va en backend/
  whatsapp_service.py     → NUEVO, va en backend/
  BusinessProfile.js      → reemplaza frontend/src/pages/BusinessProfile.js
```

**Antes de aplicar:** este parche parte del `server.py` que está ahora mismo
en GitHub (`e9998a1`, ya sincronizado). Si en tu entorno tienes cambios
locales en `server.py` que todavía no subiste, dímelo antes de sobrescribir.

## Qué hace

1 hora después de que una cita queda marcada como completada (vía el flujo de
"Completar y cobrar"), se le pide al cliente una reseña de Instagram — por
correo, por WhatsApp (en modo de prueba), o ambos, según lo que configure
cada manager en Perfil del Negocio.

## Decisiones que tomé según tus respuestas

- **Instagram**, no Google — un solo campo de link.
- **1 hora después**, no inmediato — se guarda un registro con
  `scheduled_send_at = ahora + 60 min` en el momento del checkout, y se
  envía en el próximo ciclo del daemon que ya corre cada hora
  (`reminder_daemon.py`). Esto significa que en el peor caso el envío puede
  tardar hasta ~2h (60 min de espera + hasta 60 min hasta el próximo ciclo
  del daemon) — no es instantáneo al minuto, pero es más que suficiente para
  una solicitud de reseña, y evitamos crear un proceso de Supervisor nuevo
  (justo lo que causó el incidente de despliegue anterior).
- **WhatsApp en modo mock** — `backend/whatsapp_service.py` no llama a
  ningún proveedor real. Registra cada envío simulado en una colección nueva
  `whatsapp_mock_outbox` (para que puedas verificar qué se habría enviado) y
  por log. Cuando tengas la API key de WhatsApp Business, el único cambio
  necesario es reemplazar el cuerpo de `send_whatsapp_message()` — ningún
  otro archivo necesita tocarse.
- **Configurable por manager, canal por canal** — en Perfil del Negocio,
  cada organización decide: activar/desactivar la función completa, y elegir
  correo, WhatsApp, ambos, o ninguno. Si un cliente no tiene email
  registrado pero el manager activó WhatsApp, igual se le envía — verifiqué
  que el código no dependa de que exista email para poder programar la
  solicitud (esto lo until encontré y corregí durante la construcción: el
  primer borrador sí tenía esa dependencia por accidente).

## Diseño técnico (para que lo tengas documentado)

- Nueva colección `review_requests`: un documento por cita completada
  (idempotente — si por algún motivo `_trace_appointment_completion` se
  llamara dos veces para la misma cita, no se duplica), con estado por canal
  (`email_status`, `whatsapp_status`: `pending` / `sent` / `failed` /
  `not_applicable`) y hasta 5 reintentos antes de marcar como fallido
  definitivo.
- **No** se conectó al sistema genérico de entrega con leasing/reintentos
  exponenciales que usan confirmaciones y recordatorios
  (`appointment_email_delivery.py`) — a propósito, para mantener esto
  desacoplado de esa ruta más crítica. Reintento simple: si algo falla,
  queda `pending` y se reintenta en el siguiente ciclo horario del daemon.
- El daemon existente (`reminder_daemon.py`) ahora hace dos cosas por ciclo:
  recordatorios (como siempre) y solicitudes de reseña vencidas. Preservé el
  comportamiento original de reintento rápido (5 min) si el ciclo de
  recordatorios falla — las solicitudes de reseña no interfieren con ese
  timing porque son menos críticas.

## Cómo aplicar

```bash
cp patches/server.py backend/server.py
cp patches/email_service.py backend/email_service.py
cp patches/reminder_daemon.py backend/reminder_daemon.py
cp patches/review_requests.py backend/review_requests.py
cp patches/whatsapp_service.py backend/whatsapp_service.py
cp patches/BusinessProfile.js frontend/src/pages/BusinessProfile.js
```

Validación:
```bash
python3 -m py_compile backend/server.py backend/email_service.py backend/reminder_daemon.py backend/review_requests.py backend/whatsapp_service.py && echo "OK sintaxis backend"
cd frontend && yarn build 2>&1 | tail -40 && cd ..
```

**El daemon (`reminder_daemon.py`) no se reinicia solo** — para que tome el
código nuevo necesita que Supervisor lo reinicie. Como ya está registrado y
activo (no es un proceso nuevo), esto debería pasar automáticamente en el
próximo deploy completo. Si después de desplegar quieres confirmar que
tomó el cambio, puedo darte un comando de diagnóstico para verlo.

Commit sugerido (uno solo, ya que todas las piezas son la misma feature):
```bash
git add backend/server.py backend/email_service.py backend/reminder_daemon.py backend/review_requests.py backend/whatsapp_service.py frontend/src/pages/BusinessProfile.js
git commit -m "Feature: automatic Instagram review request 1h after checkout, configurable per organization (email/WhatsApp mock/both)"
git log --oneline -3
```

## Pruebas manuales sugeridas en preview

1. En Perfil del Negocio, activa "Solicitud automática de reseña", pon un
   link de Instagram, marca "Correo electrónico" (deja WhatsApp sin marcar
   por ahora). Guarda.
2. Completa y cobra una cita de un cliente con email registrado.
3. **No esperes 1 hora real en preview** — para probarlo rápido, lo más
   simple es revisar directamente en Mongo que se creó el registro en
   `review_requests` con `scheduled_send_at` ~1h en el futuro y
   `email_status: "pending"`. Si quieres, te preparo un script de
   diagnóstico de solo lectura para ver esto sin tocar Mongo a mano.
4. Repite el punto 1 pero marcando WhatsApp en vez de correo, con un cliente
   que **no tenga email registrado** — confirma que igual se crea el
   registro en `review_requests` (con `email_status: "not_applicable"`,
   `whatsapp_status: "pending"`).
5. Marca ambos canales y confirma que se crean los dos como `pending`.
6. Desactiva la función completa y confirma que al completar una cita **no**
   se crea ningún registro en `review_requests`.

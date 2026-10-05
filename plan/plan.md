# Activación de Resend — correo transaccional desde nexusbycs2.com

Reemplaza Gmail SMTP (nexusbycs2@gmail.com, ~500/día, riesgo de bloqueo) por
Resend como ruta principal de correo transaccional desde el dominio propio,
dejando Gmail SMTP como respaldo. Afecta a confirmaciones y recordatorios de
cita, PIN/contraseña, invitaciones de equipo, alertas de stock bajo y
facturas con PDF; las campañas de marketing se separan en una ruta aparte.

## Quién usa esto

El código corre en el backend (FastAPI). Lo *perciben* los clientes finales
de cada barbería que reciben correo desde `@nexusbycs2.com` y la bandeja de
rebotes del operador. El panel de Resend lo usa Felipe/CS2 para verificar
dominio, revisar bounces, y rotar la clave.

## Qué cambia operativamente

Nada en el frontend; nada en React. Toda la decisión de proveedor queda en
`email_service.py` del backend. Se agrega una capa delgada que intenta
Resend primero y, ante error 5xx o quota, cae a Gmail SMTP para no perder
mensajes mientras se estabiliza. Los correos de marketing se envían con un
remitente separado (p. ej. `news@mail.nexusbycs2.com`) para proteger la
reputación del subdominio transaccional.

## Flujo del mensaje

1. Un endpoint del backend dispara un correo (confirmación de cita,
   recordatorio, factura, invitación, PIN).
2. El servicio arma el mensaje (HTML + texto plano + adjunto opcional).
3. Envía por Resend con remitente verificado del subdominio
   `mail.nexusbycs2.com`.
4. Si Resend responde 2xx, se guarda `email_id`, se cierra.
5. Si Resend responde 429/5xx o lanza timeout, se registra el intento,
   se encola para reintento (una vez) y, si vuelve a fallar, se despacha
   por Gmail SMTP.
6. Un webhook recibe `email.delivered`, `email.bounced`, `email.complained`
   y `email.suppressed`. Verifica la firma Svix, marca el estado en Mongo
   y, si corresponde, deja de intentar a ese destinatario.

## UI/UX

No se agrega UI nueva en esta fase. Posible en fase 3: ver estado de envío
(entregado/rebotado) junto a cada factura/cita en la vista de manager.

---

## Respuesta al prompt de activación — formato exacto solicitado

El modo Planificar no permite activar el conector, ejecutar el script de
prueba, ni crear registros DNS. Los datos de producto, SDK, DNS, límites,
webhooks, supresión y portabilidad vienen del playbook del integration
expert y de la documentación pública de Resend. Lo que requiere ejecución
queda marcado y se ejecuta tras aprobar este plan.

**— Variable(s) de entorno creadas (sin valores)**
- `RESEND_API_KEY` — en `backend/.env` y Secretos de producción. Solo
  backend. Nunca `REACT_APP_*`.
- `SENDER_EMAIL` — remitente verificado del subdominio transaccional
  (recomendado: `no-reply@mail.nexusbycs2.com`).

La clave es **propia del cliente** (cuenta Resend de Felipe/CS2, formato
`re_...`). No es la Universal Key de Emergent. Esto es lo que el prompt
pidió explícitamente ("prefiero cuenta Resend propia") y además hace la
clave portable a cualquier hosting.

**— Paquete pip y versión; ejemplo de 12 líneas (HTML + texto + adjunto)**

Paquete: `resend>=2.0.0`. El SDK es síncrono; se usa dentro de FastAPI con
`asyncio.to_thread` para no bloquear el event loop.

*Async (FastAPI):*
```python
import os, base64, asyncio, resend
resend.api_key = os.environ["RESEND_API_KEY"]
async def send_async(to: str, subject: str, html: str, text: str, pdf: bytes, filename: str):
    params = {"from": os.environ["SENDER_EMAIL"], "to": [to],
              "subject": subject, "html": html, "text": text,
              "attachments": [{"filename": filename,
                               "content": base64.b64encode(pdf).decode(),
                               "content_type": "application/pdf"}]}
    result = await asyncio.to_thread(resend.Emails.send, params)
    return result.get("id")
```

*Sync (job/cron):*
```python
import os, base64, resend
resend.api_key = os.environ["RESEND_API_KEY"]
def send_sync(to: str, subject: str, html: str, text: str, pdf: bytes, filename: str):
    params = {"from": os.environ["SENDER_EMAIL"], "to": [to],
              "subject": subject, "html": html, "text": text,
              "attachments": [{"filename": filename,
                               "content": base64.b64encode(pdf).decode(),
                               "content_type": "application/pdf"}]}
    result = resend.Emails.send(params)
    return result.get("id")
```

**— Registros DNS a crear (tabla)**

Resend genera los **valores exactos** por dominio desde su panel en
`Domains → Add Domain → nexusbycs2.com` (recomendado agregar el subdominio
`mail.nexusbycs2.com` para separar transaccional de corporativo). Los
valores con `TU_...` abajo deben copiarse del panel una vez agregado el
dominio; no se inventan, los lee el usuario del panel y los pega al
proveedor DNS.

| Tipo  | Nombre (Host)                           | Valor (ejemplo del panel Resend)                                                               |
|-------|-----------------------------------------|------------------------------------------------------------------------------------------------|
| MX    | `send.mail.nexusbycs2.com`              | `feedback-smtp.<region>.amazonses.com` prioridad 10                                            |
| TXT   | `send.mail.nexusbycs2.com`              | `v=spf1 include:amazonses.com ~all`                                                            |
| TXT   | `resend._domainkey.mail.nexusbycs2.com` | `v=DKIM1; k=rsa; p=TU_LLAVE_PUBLICA_DKIM_DEL_PANEL`                                            |
| TXT   | `_dmarc.nexusbycs2.com`                 | `v=DMARC1; p=none; rua=mailto:dmarc@nexusbycs2.com; adkim=s; aspf=s` (comenzar con `p=none`)   |

Notas: el selector DKIM que publica Resend es `resend` (en lugar de
`s1`/`s2` de otros proveedores). El SPF y DKIM se ponen **en el subdominio
`mail.`**, no en la raíz, para no afectar el correo que llegue a Gmail de
`@nexusbycs2.com`. DMARC puede ir en la raíz y cubre al subdominio por
herencia. Empezar con `p=none` y endurecer a `quarantine`/`reject` después
de 2–4 semanas de monitorear reportes.

**— Límites y precio**

| Concepto                       | Valor |
|--------------------------------|-------|
| Correos/día plan gratuito      | **100/día** (reset a 00:00 UTC) |
| Correos/mes plan gratuito      | **3.000/mes** |
| Costo para 50.000 correos/mes  | **US$20/mes** (plan transaccional pagado) |
| Tamaño máximo adjunto          | **40 MB total por envío**, después de codificación Base64 |
| Destinatarios por envío        | **50 direcciones** sumando `to` + `cc` + `bcc` |
| Rate limit                     | **10 req/s por team** (ampliable a petición) |
| Costo en créditos de Emergent  | **No aplica** — es cuenta Resend propia; se paga directo a Resend con tarjeta |

Importante: `to`, `cc` y `bcc` cuentan como correos separados contra la
cuota. Los correos recibidos (bounces, respuestas) **también** cuentan en
plan gratuito.

**— Webhooks de rebote/queja (delivered, bounced, complained)**

- URL que debo exponer: cualquier endpoint público del backend; propuesta
  `POST https://nexusbycs2.com/api/webhooks/resend`.
- Firma: Resend firma con **Svix**. Envía tres headers obligatorios para
  verificar:
  - `svix-id`
  - `svix-timestamp`
  - `svix-signature`
- Algoritmo: HMAC-SHA256 sobre `svix_id.svix_timestamp.body` (el cuerpo
  crudo, no reparseado), usando el **secreto del endpoint** que da el
  panel al crear el webhook. Librería recomendada: `pip install svix`;
  método `Webhook(secret).verify(raw_body, headers)`.
- Rechazar el request si el timestamp tiene más de 5 minutos (anti-replay).
- Eventos relevantes para Nexus:
  - `email.sent`
  - `email.delivered`
  - `email.delivery_delayed`
  - `email.bounced`
  - `email.complained`
  - `email.opened`
  - `email.clicked`
  - `email.suppressed` *(se dispara cuando Resend bloqueó el envío porque
    la dirección ya está en la lista de supresión)*

**— Lista de supresión automática**

Sí. Resend mantiene supresión automática por cuenta. Cuando llega
`email.bounced` (hard) o `email.complained`, Resend **agrega la dirección
a la supresión y rechaza futuros envíos a ella** disparando
`email.suppressed`. Consulta:

- UI: Panel Resend → `Suppression List`.
- API: endpoints disponibles vía la API REST para listar y eliminar
  direcciones de la supresión (consultar el panel para el path exacto —
  Resend lo expone en `/suppressions` pero conviene confirmarlo cuando se
  active). No requiere SDK adicional; funciona con el mismo
  `RESEND_API_KEY`.

**— ¿Funciona la clave fuera de Emergent?**

**Sí.** La clave `re_...` es emitida por la cuenta Resend del cliente y
pega directo a `https://api.resend.com`. El proxy de Emergent no está en
el camino. Esto cumple el requisito de migración: si Nexus by CS2 se muda
mañana a Railway/Fly/VPS, la misma clave sigue funcionando sin tocar
código ni DNS.

**— Resultado de las pruebas (✔/✘)**

✘ **No ejecutado en esta sesión.** El modo Planificar no permite activar
el conector, correr un script fuera del repo, ni enviar correos. Las dos
pruebas pedidas (un envío al remitente de pruebas de Resend
→ `creativestrategicsolutions2@gmail.com`, y uno con adjunto PDF ~100 KB)
quedan agendadas como lo primero que se ejecuta al salir de modo
Planificar. Resend provee un remitente de pruebas `onboarding@resend.dev`
que funciona sin verificar el dominio y entrega **únicamente a la cuenta
que posee la API key**; eso es exactamente lo que se necesita para la
primera prueba.

**¿El conector obliga a quedar atado a Emergent?** No. La clave es propia
de Resend. No hay stop condition.

---

## Fases

### Fase 1 — Activación mínima verificada *(construir ahora)*

1. Crear cuenta en resend.com, generar `re_...` key.
2. Agregar `RESEND_API_KEY` y `SENDER_EMAIL` a `backend/.env` y Secretos
   de producción. Nunca al frontend.
3. Agregar `resend>=2.0.0` a `backend/requirements.txt` y reinstalar.
4. Agregar en el panel Resend el dominio **`mail.nexusbycs2.com`**.
5. Felipe copia los 4 registros (MX, SPF TXT, DKIM TXT, DMARC TXT) desde
   el panel al proveedor DNS. Esperar propagación (minutos a horas).
6. Mientras el dominio no esté verificado, probar envío con
   `onboarding@resend.dev` → `creativestrategicsolutions2@gmail.com`:
   un correo simple y uno con PDF 100 KB. Si ambos entregan → ✔.
7. Agregar en `email_service.py` una capa `send_via_resend` que **todavía
   no se usa** desde ningún call-site. Solo deja la función disponible,
   con pruebas unitarias que la ejerzan con un cliente mockeado.
8. Deploy a preview. Un endpoint protegido `/api/debug/test-email` (solo
   admin) permite enviarse un correo de prueba. No se cambia ningún
   envío real todavía.

### Fase 2 — Corte, respaldo y webhooks

9. Cambiar el default de envío a Resend en todos los flujos; dejar Gmail
   SMTP como fallback automático solo ante error del proveedor.
10. Crear el endpoint `/api/webhooks/resend` con verificación Svix. Marcar
    bounces y complaints en Mongo. Suprimir destinatarios con
    `email.complained` localmente también.
11. Panel admin para ver estado de cada envío (lo que llega del webhook).

### Fase 3 — Separación de marketing y endurecimiento

12. Agregar segundo subdominio en Resend (`news.nexusbycs2.com`) para
    campañas de marketing con DKIM/SPF independientes.
13. Elevar DMARC de `p=none` a `p=quarantine` tras 2 semanas de reportes
    limpios, luego a `p=reject`.
14. Alertas internas por volumen anómalo de bounces/complaints (umbral
    por hora).

Solo la Fase 1 se construye tras aprobar este plan. Fases 2 y 3 requieren
nueva aprobación con el detalle del cambio que corresponda.

---

## Supuestos

- **El cliente abre la cuenta Resend a su nombre.** La facturación va a
  Felipe/CS2, no a Emergent. Si se prefiere lo contrario (clave
  universal Emergent-managed, atada a la Universal Key), hay que
  decirlo ahora porque pierde portabilidad.
- **Subdominio de envío = `mail.nexusbycs2.com`.** Si se prefiere otro
  (`send.`, `email.`, `transactional.`) hay que decirlo antes de crear
  el dominio en Resend; cambiarlo después implica rehacer DNS.
- **DMARC arranca en `p=none`** por 2–4 semanas para observar antes de
  endurecer. No se arranca en `quarantine`/`reject` para evitar bloquear
  correo legítimo mientras se afina.
- **Marketing va en subdominio separado** (`news.`) en Fase 3. En Fase 1
  solo se mueve el transaccional. Las campañas siguen por Gmail SMTP
  hasta la Fase 3.
- **Gmail SMTP se mantiene conectado como fallback automático**, no se
  desconecta ni se cambia. Si Resend tiene un incidente, el correo sigue
  saliendo (con riesgo de llegar a spam de ese período, aceptable).
- **El cuerpo HTML existente se preserva.** No se rediseñan plantillas en
  esta fase. Si una plantilla usa fuentes/CSS externo que rompa en
  Resend, se corrige puntualmente, no se refactoriza el sistema de
  plantillas.
- **El webhook es público** pero toda su autenticidad depende de la firma
  Svix. No se agrega otra capa (IP allowlist, etc.) en Fase 1.
- **No se migran correos ya enviados** desde Gmail; el histórico de envíos
  previos no se importa a Resend.

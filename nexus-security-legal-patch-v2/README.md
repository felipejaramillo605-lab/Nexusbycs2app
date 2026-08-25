# Nexus — Security & Legal Patch v2

Parche que combina 3 cosas en un solo paquete verificado por hash:

1. **Fix crítico de seguridad** (pentest): PII de clientes expuesta sin autenticación real.
2. **Fixes legales** (Ley 1581 Colombia / TCPA / CAN-SPAM): consentimiento en reservas de invitado, ToS para
   dueños/managers, actualización de la Política de Privacidad.
3. **Reincorporación de Nexus v1**: paleta morada, tema "Minimalista Morado", personalización de portal por
   manager, onboarding animado por rol — trabajo que se había hecho antes de que GitHub avanzara con los 4 fixes
   de billing y la mejora de reagendamiento, y que tuvo que respaldarse y re-aplicarse con merge manual.

## 1. Fix crítico de seguridad (pentest)

**Hallazgo:** 3 endpoints ARCO (`GET /api/public/clients/my-data`, `PUT /api/public/clients/update-my-data`,
`POST /api/public/clients/request-deletion`) identificaban al cliente solo con `phone` + `organization_id`, sin
PIN, sin token, sin sesión. Cualquiera que adivinara/probara un número de teléfono podía ver, modificar o pedir
borrar los datos de cualquier cliente de cualquier negocio en Nexus, sin límite de tasa.

**Verificado:** ninguno de estos 3 endpoints es llamado desde el frontend actual — son superficie de API sin uso
en la UI. Protegerlos con sesión no rompe ninguna funcionalidad existente.

**Fix aplicado** (`backend/server.py`):
- Los 3 endpoints ahora requieren `client: Client = Depends(get_current_client)` — la misma autenticación por
  sesión/PIN que ya usa el resto del Portal de Cliente. Ya no aceptan `phone`/`organization_id` como parámetros
  de quién eres; usan la identidad de la sesión.
- Se agregó rate limiting (`15/hour`) a los 3.
- `GET /public/clients/my-data` ahora excluye `pin_hash`, `pin_reset_token`, `failed_pin_attempts` de la
  respuesta (antes se devolvían sin necesidad).

**`GET /api/public/clients/history` NO se tocó de la misma forma** — sí es usado por `CustomerPortal.js` como
función de invitado (buscar mis citas por teléfono, sin login, como en OpenTable). Romperlo habría quitado una
función real. En su lugar se le agregó rate limiting (`20/hour`) para frenar scraping masivo, que era el riesgo
real señalado por el pentest.

`POST /api/public/clients/unsubscribe` también recibió rate limiting (`10/hour`) por el mismo motivo (permite
confirmar si un teléfono/email existe en una organización — riesgo de enumeración, no de fuga total de datos).

## 2. Endurecimiento adicional (Alto/Medio del pentest)

- `max_length` agregado a ~15 campos de texto sin límite en modelos Pydantic expuestos en endpoints públicos
  (`RegisterRequest`, `PasswordlessLoginRequest`, `LoginRequest`, `ForgotPasswordRequest`,
  `ResetPasswordRequest`, `ClientRegisterRequest`, `ClientLoginRequest`, `ClientChangePinRequest`,
  `ClientForgotPinRequest`, `ClientResetPinRequest`, `AppointmentCreate.client_phone`) — mitiga el DoS barato de
  enviar payloads de texto arbitrariamente largos.
- `search` en `GET /clients` ahora tiene `max_length=100` (mitiga costo de regex/Mongo en búsquedas larguísimas).

**Lo que NO se tocó, a propósito, y por qué:**
- **Cookie `session_token` con `samesite="none"`** (login Google/Emergent, `server.py` línea ~720): el código
  tiene una advertencia explícita ("NO HARDCODEES LA URL, ESTO ROMPE EL AUTH") ligada a este flujo. No hay forma
  de probar el login de Google en este entorno sin servidor corriendo. Cambiarlo a ciegas arriesga romper el
  login de TODOS los usuarios — un riesgo mayor que el hallazgo original (que además ya está parcialmente
  mitigado por la validación de `Origin`/`Sec-Fetch-Site` que ya existe en `request_security.py`). **Recomendado:
  probar en el preview de Emergent antes de tocar esta línea, con alguien que pueda revertir rápido si el login
  se rompe.**
- **Bump de `fastapi`/`starlette`** en `requirements.txt`: no se aplicó. Es una app de producción de 5,751
  líneas y no hay forma de correr el servidor + MongoDB en este entorno para probar que un bump de versión mayor
  no rompe nada. Recomendado hacerlo en una rama aparte, con `pip install -r requirements.txt` + smoke test
  completo en preview, no como parte de este parche.
- **Contraseña `'nexus'` en el Excel de auditoría de inventario** (`inventory_audit.py`): el propio pentest
  concluyó que esto es solo protección de celdas contra ediciones accidentales, no un control de seguridad real
  (fácilmente removible). No se cambia — no era el problema.
- **`detail=str(e)` en un punto de `server.py`**: se revisó y es un mensaje de validación controlado y legible
  ("La cantidad del movimiento..."), no una excepción cruda con stack trace. Falso positivo del pentest, no se
  tocó.

## 3. Fixes legales (Ley 1581 Colombia + TCPA/CAN-SPAM)

- **`frontend/src/pages/BookingFlow.js`**: el flujo de reserva como invitado (el más usado) no mostraba ningún
  aviso de privacidad ni checkbox de consentimiento de marketing. Se agregó: (a) un aviso con link a
  `/privacy-policy`, y (b) un checkbox opcional de marketing que ahora sí se envía al backend
  (`marketing_consent`) — el backend YA sabía procesar este campo correctamente (`upsert_client` en
  `server.py`), solo faltaba la UI.
- **`frontend/src/pages/PrivacyPolicy.js`**: la página que los usuarios realmente ven en el sitio **no tenía la
  sección "¿Con quién compartimos tus datos?"** (sí existía en el `.md` descargable, pero no en la página web —
  saltaba de la sección 3 a la 5). Se agregó esa sección, mencionando explícitamente WhatsApp Business API y
  Wompi/Stripe como terceros que procesan datos, que antes no se mencionaban en ningún lado. También se actualizó
  la sección de derechos ARCO para reflejar que ahora requieren login (por el fix de seguridad del punto 1).
- **`PRIVACY_POLICY.md`** y **`frontend/public/PRIVACY_POLICY.md`** (el archivo descargable, ambas copias
  idénticas): mismo contenido actualizado — terceros + endpoints ARCO ahora autenticados.
- **`frontend/src/pages/TermsOfService.js`** (NUEVO): Términos de Servicio para dueños/managers de negocio, que
  antes no existían en absoluto — solo había política para clientes finales. Cubre: qué es Nexus, quién es
  "Responsable" vs "Encargado" del tratamiento de datos (distinción clave de la Ley 1581 que faltaba declarar),
  suscripción/pagos, uso aceptable, limitación de responsabilidad, terminación, ley aplicable.
  **Está marcado explícitamente en la propia página como borrador que necesita revisión de abogado** antes de
  tratarse como vinculante — no se inventó texto legal definitivo, siguiendo la recomendación de la auditoría.
- **`frontend/src/pages/Register.js`**: ahora exige checkbox de aceptación de ToS + Política de Privacidad antes
  de poder crear una cuenta de owner/manager (antes no había ningún checkbox de este tipo).
- **`backend/server.py`**: `RegisterRequest` tiene un nuevo campo `tos_accepted: bool`. El endpoint
  `POST /auth/register` rechaza la creación de cuenta si no viene en `true`, y guarda `tos_accepted_at` +
  `tos_accepted_ip` en el documento del usuario para auditoría (mismo patrón que ya se usaba para
  `marketing_consent`).
- **`frontend/src/App.js`**: nueva ruta pública `/terms-of-service`.

**Lo que sigue pendiente de abogado (no resuelto por código, a propósito):**
- Evaluar si Nexus (o cada negocio-cliente) debe registrarse en el RNBD de la SIC — depende de volumen real de
  datos, es un análisis normativo.
- Validación jurídica final del texto de `TermsOfService.js` antes de tratarlo como vinculante.
- Cualquier lanzamiento comercial en Florida debe pausarse hasta revisión de TCPA/FDBR por abogado de EE.UU.
  (multas TCPA son por mensaje, $500–1,500 USD c/u, con litigio privado activo).

## 4. Reincorporación de Nexus v1 (paleta morada + personalización + onboarding)

Este trabajo se había hecho en una sesión anterior mientras el repo local estaba desactualizado respecto a
GitHub (que mientras tanto recibió 2 commits nuevos: 4 fixes de billing y una mejora de reagendamiento). Se
respaldó todo antes de sincronizar, y se reincorporó con un merge manual cuidadoso — en particular,
`OrganizationUpdate` en `backend/server.py` recibió de vuelta los 6 campos de personalización de portal
(`logo_url`, `portal_welcome_message`, `portal_show_team/prices/hours/map`) sin pisar el código nuevo de
reagendamiento que GitHub ya tenía en el mismo archivo.

Incluye: paleta morada en `index.css`, tema "Minimalista Morado" en `clientPortalThemes.js`, panel de
personalización de manager (`PortalCustomizationPanel.jsx`, integrado en `Settings.js`), branding del cliente en
`ClientPortalNav.js`, y onboarding animado por rol (`onboarding/`, integrado en `AdminShell.jsx` y
`ClientPortalThemeWrapper.js`).

## Archivos modificados (verificados por hash antes de aplicar)

- `PRIVACY_POLICY.md`
- `backend/server.py`
- `frontend/public/PRIVACY_POLICY.md`
- `frontend/src/App.js`
- `frontend/src/components/ClientPortalNav.js`
- `frontend/src/components/ClientPortalThemeWrapper.js`
- `frontend/src/components/design/AdminShell.jsx`
- `frontend/src/constants/clientPortalThemes.js`
- `frontend/src/index.css`
- `frontend/src/pages/BookingFlow.js`
- `frontend/src/pages/PrivacyPolicy.js`
- `frontend/src/pages/Register.js`
- `frontend/src/pages/Settings.js`

## Archivos nuevos (no deben existir ya en el repo)

- `frontend/src/components/PortalCustomizationPanel.jsx`
- `frontend/src/components/onboarding/onboardingSteps.js`
- `frontend/src/components/onboarding/onboardingIllustrations.jsx`
- `frontend/src/components/onboarding/OnboardingTour.jsx`
- `frontend/src/pages/TermsOfService.js`
- `scripts/validate-before-push.ps1`

## Cómo aplicar, desde la terminal de VSCode-Emergent (bash)

```bash
bash /ruta/al/paquete/scripts/backup.sh .
bash /ruta/al/paquete/scripts/apply-patch.sh .
bash /ruta/al/paquete/scripts/validate.sh .
```

Si `apply-patch.sh` falla con "Contexto no coincide", el código en Emergent es distinto al auditado (por ejemplo
si hiciste otros cambios manuales ahí que no están en GitHub todavía). **No fuerces la aplicación** — avisa y se
regenera el paquete contra el código actual de Emergent.

Si falla con "ya existe" para un archivo nuevo, algo con ese nombre ya está en el repo — revisa manualmente.

## Validación manual sugerida (ver también scripts/validate.sh)

1. **Seguridad**: sin sesión de cliente activa, llamar `GET /api/public/clients/my-data?phone=X&organization_id=Y`
   debe responder `401`, no datos.
2. Como cliente con PIN logueado, verificar que el Portal de Cliente sigue permitiendo ver/editar tus propios
   datos con normalidad.
3. `/book/{organization_id}` como invitado: debe seguir funcionando, y ahora debe mostrarse el checkbox de
   marketing + link a Política de Privacidad antes de "Confirmar reserva".
4. `/register`: el botón "Crear Cuenta" debe estar deshabilitado hasta marcar el checkbox de ToS.
5. Abrir `/terms-of-service` y `/privacy-policy` — deben cargar sin errores, con las secciones nuevas visibles.
6. Configuración → "Mi Portal" (como manager): debe verse el selector de tema + panel de personalización +
   tema "Minimalista Morado" disponible.
7. Cerrar sesión y volver a entrar con un rol que no haya visto el onboarding — debe aparecer el tour.
8. Revisar visualmente que botones primarios/focus rings del dashboard admin se ven morados.

## Rollback

```bash
bash /ruta/al/paquete/scripts/rollback.sh . /ruta/al/backup/devuelta/por/backup.sh
```

Restaura los 13 archivos modificados. Los 6 archivos nuevos no se borran automáticamente — el script da los
comandos exactos si se necesita.

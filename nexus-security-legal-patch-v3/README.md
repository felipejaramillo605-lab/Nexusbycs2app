# Nexus — Security & Legal Patch v3

Regenerado contra el código REAL actual de Emergent (rama `security/fix-critical-issues`, pusheada a `main` en
GitHub como commit `c7d7b9c`). La v2 de este paquete falló al aplicarse porque Emergent ya tenía una versión
manual, parcialmente aplicada y con defectos, del paquete "Nexus v1" (paleta morada + personalización + onboarding)
que nunca se había subido a GitHub hasta ahora.

## Qué cambió respecto a v2

Al comparar el `server.py` real de Emergent contra mi versión local (ignorando solo diferencias de fin de línea
CRLF/LF, que son cosméticas), confirmé que:

- El fix crítico de seguridad, los fixes legales y el endurecimiento de `max_length` **no estaban aplicados en
  Emergent** — siguen siendo necesarios, sin cambios de contenido respecto a v2.
- Los campos de `OrganizationUpdate` (`logo_url`, `portal_welcome_message`, etc.) para personalización de portal
  **ya estaban en Emergent** — su versión de Nexus v1 coincide con la mía en esa parte, sin conflicto.
- **Cuatro archivos que antes trataba como "nuevos" ya existen en Emergent** (`PortalCustomizationPanel.jsx`,
  `onboarding/onboardingSteps.js`, `onboarding/onboardingIllustrations.jsx`, `onboarding/OnboardingTour.jsx`) —
  este paquete ahora los trata como modificados (verificados por hash), no como nuevos.
- **La versión de Emergent de esos archivos tiene defectos que la mía no tiene:**
  - `index.css`: el acento morado en modo oscuro tenía el valor de modo CLARO puesto por error
    (`#7C3AED` en vez de `#A78BFA` dentro del bloque `.dark`), y las variables HSL de shadcn/ui
    (`--primary`, `--ring`, `--accent`) seguían en azul — solo se habían cambiado las variables hex, no las
    que realmente usan los componentes de shadcn. Los botones probablemente seguían viéndose azules pese al
    "cambio de paleta".
  - `onboardingSteps.js` y `ClientPortalNav.js`: tildes borradas en varias palabras (`facturacion` en vez de
    `facturación`, `Aqui` en vez de `Aquí`, `sesion` en vez de `sesión`) — probablemente un problema de
    codificación UTF-8 en cómo se aplicó el parche anterior.
  - `Settings.js`: la pestaña seguía llamándose "Portal del Cliente" en vez de "Mi Portal".

  Este paquete sobreescribe esos archivos con la versión completa y correcta.
- **`frontend/src/pages/TermsOfService.js` sigue siendo el único archivo verdaderamente nuevo.**
  `scripts/validate-before-push.ps1` también, pero es solo una utilidad de desarrollo local (PowerShell), no
  afecta la app — puedes omitirlo si no te interesa para Emergent.

Para el resto del contenido del parche (fix crítico de seguridad, fixes legales, qué se decidió NO tocar y por
qué), ver el detalle completo abajo — es el mismo de v2, sin cambios de fondo.

---

## 1. Fix crítico de seguridad (pentest)

**Hallazgo:** 3 endpoints ARCO (`GET /api/public/clients/my-data`, `PUT /api/public/clients/update-my-data`,
`POST /api/public/clients/request-deletion`) identificaban al cliente solo con `phone` + `organization_id`, sin
PIN, sin token, sin sesión. Cualquiera que adivinara/probara un número de teléfono podía ver, modificar o pedir
borrar los datos de cualquier cliente de cualquier negocio en Nexus, sin límite de tasa.

**Verificado:** ninguno de estos 3 endpoints es llamado desde el frontend actual. Protegerlos con sesión no
rompe ninguna funcionalidad existente.

**Fix aplicado** (`backend/server.py`):
- Los 3 endpoints ahora requieren `client: Client = Depends(get_current_client)` — la misma autenticación por
  sesión/PIN que ya usa el resto del Portal de Cliente.
- Rate limiting (`15/hour`) agregado a los 3.
- `GET /public/clients/my-data` ya no devuelve `pin_hash`, `pin_reset_token`, `failed_pin_attempts`.

**`GET /api/public/clients/history`** se dejó público (lo usa `CustomerPortal.js` como función real de invitado,
buscar mis citas por teléfono sin login) pero con rate limiting (`20/hour`). `POST /api/public/clients/unsubscribe`
también recibió rate limiting (`10/hour`).

## 2. Endurecimiento adicional

`max_length` agregado a ~15 campos de texto sin límite en modelos Pydantic públicos, y `search` en `GET /clients`
limitado a 100 caracteres.

**No se tocó, a propósito:** cookie `session_token` con `samesite="none"` del login Google (advertencia explícita
en el código de no romperla, imposible de probar aquí), bump de `fastapi`/`starlette` (riesgo sin poder testear
el runtime), contraseña del Excel de auditoría de inventario (no es un control de seguridad real).

## 3. Fixes legales (Ley 1581 Colombia + TCPA/CAN-SPAM)

- `BookingFlow.js`: checkbox de consentimiento de marketing + link a Política de Privacidad en la reserva de
  invitado (el backend ya sabía procesar `marketing_consent`, solo faltaba la UI).
- `PrivacyPolicy.js`: se agregó la sección "¿Con quién compartimos tus datos?" que faltaba en la página web real
  (mencionando WhatsApp Business API y Wompi/Stripe), y se actualizaron los derechos ARCO para reflejar que ahora
  requieren login.
- `TermsOfService.js` (nuevo): Términos de Servicio para dueños/managers — no existían. Cubre Responsable vs
  Encargado del tratamiento, suscripción/pagos, uso aceptable, limitación de responsabilidad. **Marcado
  explícitamente como borrador que necesita revisión de abogado.**
- `Register.js` + `server.py`: checkbox obligatorio de aceptación de ToS, con `tos_accepted_at`/`tos_accepted_ip`
  guardados para auditoría.
- `App.js`: nueva ruta `/terms-of-service`.

**Pendiente de abogado (no resuelto por código, a propósito):** registro RNBD ante la SIC, validación jurídica
final del ToS, y cualquier lanzamiento en Florida debe esperar revisión de TCPA/FDBR.

## Archivos modificados (verificados por hash antes de aplicar, ignorando CRLF/LF)

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
- `frontend/src/components/PortalCustomizationPanel.jsx`
- `frontend/src/components/onboarding/onboardingSteps.js`
- `frontend/src/components/onboarding/onboardingIllustrations.jsx`
- `frontend/src/components/onboarding/OnboardingTour.jsx`

## Archivos nuevos (no deben existir ya en el repo)

- `frontend/src/pages/TermsOfService.js`
- `scripts/validate-before-push.ps1`

## Cómo aplicar, desde la terminal de VSCode-Emergent

```bash
bash /ruta/al/paquete/scripts/backup.sh .
bash /ruta/al/paquete/scripts/apply-patch.sh .
bash /ruta/al/paquete/scripts/validate.sh .
```

Si `apply-patch.sh` falla con "Contexto no coincide", el código en Emergent cambió de nuevo desde que se generó
este paquete. **No fuerces la aplicación** — avisa y se regenera contra el estado actual real.

## Validación manual sugerida

Ver `scripts/validate.sh` — incluye una checklist de 8 puntos cubriendo seguridad, consentimiento legal, y que la
paleta morada + acentos del onboarding se vean correctos esta vez (a diferencia del intento anterior).

## Rollback

```bash
bash /ruta/al/paquete/scripts/rollback.sh . /ruta/al/backup/devuelta/por/backup.sh
```

## Nota sobre el estado del repo en Emergent

El `git status` que compartiste mostró bastante desorden en `/app`: múltiples carpetas de respaldo de intentos
anteriores (`.nexus-portal-personalization-v1-backups/`, `.patch-backups/`), zips viejos sueltos en la raíz
(`nexus-billing-reliability-fixes-v1.zip`, `nexus-portal-personalization-v1*.zip`), y carpetas `base/`/`source/`/
`server.py` sueltas en la raíz del repo (restos de una descompresión anterior hecha directamente sobre `/app` en
vez de en una carpeta aparte). Todo esto ya se commiteó a `main` en GitHub. No es urgente, pero conviene
limpiarlo en algún momento para no ensuciar el historial ni el tamaño del repo — puedo ayudarte a armar un
commit de limpieza aparte cuando quieras, sin mezclarlo con este parche.

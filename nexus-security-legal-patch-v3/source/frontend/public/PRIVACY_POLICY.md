# Política de Privacidad - Nexus by CS2

**Última actualización:** Diciembre 2025

## 1. Introducción

Nexus by CS2 ("nosotros", "nuestro" o "la Plataforma") respeta tu privacidad y está comprometido con la protección de tus datos personales. Esta Política de Privacidad explica cómo recopilamos, usamos, compartimos y protegemos tu información personal.

**Jurisdicciones aplicables:**
- 🇺🇸 Estados Unidos (Florida) - TCPA, CAN-SPAM Act, FIPA
- 🇨🇴 Colombia - Ley 1581 de 2012, Decreto 1377 de 2013

---

## 2. ¿Qué Datos Recopilamos?

Recopilamos la siguiente información personal cuando:
- Realizas una reserva de cita
- Creas una cuenta en el Portal del Cliente
- Aceptas recibir comunicaciones de marketing

### Datos recopilados:
- **Nombre completo**
- **Número de teléfono**
- **Correo electrónico**
- **Historial de citas** (fecha, hora, servicio, profesional)
- **Dirección IP** (al dar consentimiento de marketing)
- **Timestamp de consentimiento** (fecha y hora)

---

## 3. ¿Para Qué Usamos Tus Datos?

### Uso primario (necesario para el servicio):
- ✅ Gestionar y confirmar tus citas
- ✅ Enviarte recordatorios de citas (24 horas antes)
- ✅ Notificarte sobre cambios o cancelaciones
- ✅ Procesar pagos (si aplica)
- ✅ Mantener tu historial de servicios

### Uso secundario (requiere tu consentimiento explícito):
- 📧 Enviar promociones y ofertas especiales
- 📱 Enviar novedades del negocio por WhatsApp/Email
- 📊 Campañas de marketing y retención de clientes

**IMPORTANTE:** Puedes optar por NO recibir comunicaciones de marketing y aún así usar todos nuestros servicios de reserva y gestión de citas.

---

## 4. ¿Con Quién Compartimos Tus Datos?

NO vendemos tu información personal a terceros. Compartimos tus datos únicamente con:

### Proveedores de servicios necesarios:
- **Proveedor de Email (Gmail SMTP)** - Para enviar confirmaciones y recordatorios
- **WhatsApp Business API** - Para enviar confirmaciones y recordatorios de citas por WhatsApp (solo si el negocio lo tiene activado)
- **Proveedor de Hosting** - Para almacenar tu información de forma segura
- **MongoDB Atlas** - Base de datos donde se almacenan tus datos
- **Procesadores de pago (Wompi / Stripe)** - Solo si el negocio cobra suscripciones o pagos a través de la plataforma; Nexus no almacena datos de tarjetas, estos son procesados directamente por el proveedor de pago

### Compartimos solo lo necesario y bajo acuerdos de confidencialidad.

---

## 5. Tus Derechos (ARCO - Ley 1581 Colombia)

Tienes los siguientes derechos sobre tus datos personales:

Para ejercer estos derechos, primero debes iniciar sesión en tu Portal de Cliente (con tu número de teléfono y PIN) — esto es necesario para verificar tu identidad antes de mostrar o modificar tus datos personales. Si nunca creaste un PIN, puedes registrarte gratis en el Portal de Cliente del negocio, o escribirnos directamente a nuestro correo de contacto.

### 📊 **Acceso**
Solicita una copia de todos tus datos personales que tenemos almacenados.
- **Cómo:** Inicia sesión en tu Portal de Cliente → sección "Mis Datos"
- **Endpoint técnico:** `GET /api/public/clients/my-data` (requiere sesión activa)

### ✏️ **Corrección/Actualización**
Corrige o actualiza tu nombre o correo electrónico.
- **Cómo:** Inicia sesión en tu Portal de Cliente → sección "Mis Datos"
- **Endpoint técnico:** `PUT /api/public/clients/update-my-data` (requiere sesión activa)

### 🗑️ **Supresión/Eliminación**
Solicita la eliminación de tus datos personales.
- **Cómo:** Inicia sesión en tu Portal de Cliente → sección "Mis Datos"
- **Endpoint técnico:** `POST /api/public/clients/request-deletion` (requiere sesión activa)
- **Plazo de respuesta:** 15 días hábiles

### 🚫 **Revocación de Consentimiento**
Cancela tu suscripción a comunicaciones de marketing.
- **Link en cada email** o visita: `/unsubscribe?phone={tu_telefono}&org={org_id}`

---

## 6. Cumplimiento Legal

### 🇺🇸 Estados Unidos (Florida)

**TCPA (Telephone Consumer Protection Act):**
- Solo te enviamos mensajes automáticos (SMS/WhatsApp) si das consentimiento explícito
- Puedes cancelar en cualquier momento enviando "STOP"

**CAN-SPAM Act:**
- Todos los emails de marketing incluyen un link de baja
- Incluimos la dirección física del negocio
- Procesamos solicitudes de baja en menos de 10 días

**FIPA (Florida Information Protection Act):**
- Protegemos tus datos con medidas de seguridad técnicas y organizativas
- En caso de brecha de seguridad, notificaremos a las autoridades y afectados

### 🇨🇴 Colombia

**Ley 1581 de 2012 - Habeas Data:**
- Solicitamos tu **autorización previa, expresa e informada** antes de usar tus datos para marketing
- Respetamos tus derechos ARCO (Acceso, Rectificación, Cancelación, Oposición)
- Autoridad competente: **Superintendencia de Industria y Comercio (SIC)**

**Contacto SIC Colombia:**
- Web: www.sic.gov.co
- Línea: 018000 910165

---

## 7. Seguridad de Datos

Implementamos medidas de seguridad para proteger tu información:
- 🔒 Encriptación de contraseñas (bcrypt)
- 🔒 Cookies seguras (httpOnly, secure)
- 🔒 Headers de seguridad (CSP, HSTS, X-Frame-Options)
- 🔒 CORS restrictivo
- 🔒 Acceso basado en roles (RLS - Row Level Security)

---

## 8. Retención de Datos

### ¿Cuánto tiempo guardamos tus datos?
- **Datos de cuenta activa:** Mientras uses el servicio
- **Historial de citas:** Se conserva para cumplir obligaciones contables y fiscales
- **Datos de marketing:** Hasta que solicites tu baja
- **Solicitudes de eliminación:** Procesadas en 15 días hábiles

**Nota:** Podemos retener ciertos datos históricos si existe obligación legal (ej: registros contables, auditorías).

---

## 9. Cambios a Esta Política

Nos reservamos el derecho de actualizar esta Política de Privacidad. Te notificaremos de cambios materiales por email o mediante aviso en la Plataforma.

---

## 10. Contacto

Si tienes preguntas sobre esta Política de Privacidad o deseas ejercer tus derechos:

**Nexus by CS2**
- **Responsable:** Felipe Jaramillo Parra
- **Email:** nexusbycs2@gmail.com
- **Teléfono:** +57 310 370 5753
- **Dirección:** Cr 51 #96 sur 50, La Estrella, Antioquia, Colombia

---

## 11. Consentimiento

Al usar Nexus by CS2 y proporcionar tus datos personales, declaras que:
- Has leído y comprendido esta Política de Privacidad
- Autorizas el tratamiento de tus datos según lo descrito
- Entiendes que puedes revocar tu consentimiento en cualquier momento

---

**Nexus by CS2** - Gestión inteligente para barberías

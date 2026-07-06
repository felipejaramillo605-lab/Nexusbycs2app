# 📧 GUÍA: Configurar Contraseña de Aplicación de Gmail

## Pasos para obtener App Password de nexusbycs2@gmail.com:

### 1. Verificar 2FA (Autenticación de Dos Factores)
- Ve a: https://myaccount.google.com/security
- Inicia sesión con nexusbycs2@gmail.com
- En "Verificación en 2 pasos" → Debe estar **ACTIVADA**
- Si no está activada, actívala primero

### 2. Crear Contraseña de Aplicación
- Ve a: https://myaccount.google.com/apppasswords
- O desde Security → App passwords
- Selecciona app: "Mail"
- Selecciona dispositivo: "Other (Custom name)"
- Nombre: "Nexus App"
- Click "Generate"

### 3. Copiar la Contraseña
- Google mostrará una contraseña de 16 caracteres (ejemplo: "abcd efgh ijkl mnop")
- **COPIA ESTA CONTRASEÑA** (sin espacios: abcdefghijklmnop)
- Solo se muestra UNA VEZ

### 4. Guardar en Variables de Entorno
Añade estas líneas al archivo `/app/backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nexusbycs2@gmail.com
SMTP_PASSWORD=tu_contraseña_de_aplicacion_aqui
SMTP_FROM_EMAIL=nexusbycs2@gmail.com
SMTP_FROM_NAME=Nexus by CS2
```

## ⚠️ IMPORTANTE
- NO uses la contraseña normal de Gmail
- SOLO funciona con App Password
- Guarda la contraseña de forma segura
- No la compartas ni la subas a Git

## 📊 Límites de Gmail SMTP
- **500 emails por día** (límite de Gmail)
- Suficiente para aplicaciones pequeñas/medianas
- Para más volumen, considera Resend o SendGrid

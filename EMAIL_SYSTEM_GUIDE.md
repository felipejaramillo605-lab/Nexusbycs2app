# 📧 SISTEMA DE NOTIFICACIONES AUTOMÁTICAS - Nexus by CS2

## ✅ IMPLEMENTACIÓN COMPLETADA

Sistema completo de emails automáticos configurado para **nexusbycs2@gmail.com**

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### 1. **Confirmación de Cita** (Automática)
- ✅ Se envía inmediatamente al crear una cita
- ✅ Incluye todos los detalles (fecha, hora, barbero, servicio, dirección)
- ✅ Diseño profesional con HTML responsive
- ✅ Tema oscuro premium (Apple liquid glass style)

### 2. **Recordatorio de Cita** (24h antes)
- ✅ Script automático que revisa citas del día siguiente
- ✅ Envía recordatorios solo a citas confirmadas
- ✅ Marca citas como "reminder_sent" para evitar duplicados
- ✅ Ejecutable via cron job cada hora

### 3. **Cancelación de Cita** (Automática)
- ✅ Email de notificación cuando se cancela
- ✅ Incluye detalles de la cita cancelada

---

## 🔧 ARCHIVOS CREADOS

### Backend:
1. `/app/backend/email_service.py` - Servicio principal de emails
2. `/app/backend/send_reminders.py` - Script de recordatorios automáticos
3. `/app/backend/run_reminders.sh` - Shell script para cron job

### Documentación:
4. `/app/GMAIL_APP_PASSWORD_SETUP.md` - Guía para configurar Gmail
5. `/app/EMAIL_SYSTEM_GUIDE.md` - Este archivo

### Configuración:
6. `/app/backend/.env` - Variables SMTP añadidas

---

## ⚙️ CONFIGURACIÓN NECESARIA

### PASO 1: Obtener App Password de Gmail

**CRÍTICO:** Debes completar este paso para que funcione

1. Ve a: https://myaccount.google.com/apppasswords
2. Inicia sesión con **nexusbycs2@gmail.com**
3. Crea nueva contraseña de aplicación:
   - App: Mail
   - Dispositivo: Other (Custom) → "Nexus App"
4. Copia la contraseña de 16 caracteres

### PASO 2: Actualizar .env

Edita `/app/backend/.env` y reemplaza:

```bash
SMTP_PASSWORD=TU_APP_PASSWORD_AQUI
```

Con tu contraseña real (sin espacios):

```bash
SMTP_PASSWORD=abcdefghijklmnop
```

### PASO 3: Reiniciar Backend

```bash
cd /app/backend
sudo supervisorctl restart backend
```

---

## 🧪 TESTING

### Probar Confirmación de Cita:

1. Ir a `/book/:orgId`
2. Crear una cita con un email válido
3. ✅ Debes recibir email de confirmación inmediatamente

### Probar Recordatorios:

```bash
cd /app/backend
python3 send_reminders.py
```

Esto buscará citas de mañana y enviará recordatorios.

### Verificar Logs:

```bash
# Ver logs del backend
tail -f /var/log/supervisor/backend.err.log

# Buscar mensajes de email
grep "Email sent" /var/log/supervisor/backend.err.log
```

---

## 🤖 AUTOMATIZACIÓN (Cron Job)

### Configurar Recordatorios Automáticos:

```bash
# Editar crontab
crontab -e

# Añadir esta línea (ejecuta cada hora)
0 * * * * /app/backend/run_reminders.sh >> /var/log/nexus_reminders.log 2>&1
```

### Ver Logs de Cron:

```bash
tail -f /var/log/nexus_reminders.log
```

---

## 📊 TEMPLATES DE EMAIL

### 1. Confirmación de Cita
- **Subject:** "✅ Cita Confirmada - [Nombre Barbería]"
- **Contenido:**
  - Emoji de bienvenida
  - Detalles completos de la cita
  - Info de contacto del negocio
  - Mensaje de recordatorio futuro

### 2. Recordatorio de Cita
- **Subject:** "🔔 Recordatorio de Cita - [Nombre Barbería]"
- **Contenido:**
  - Alerta de "Tu cita es mañana"
  - Detalles de la cita
  - Teléfono de contacto
  - Mensaje de confirmación

### 3. Cancelación
- **Subject:** "❌ Cita Cancelada - [Nombre Barbería]"
- **Contenido:**
  - Notificación de cancelación
  - Detalles de la cita cancelada
  - Invitación a reagendar

---

## 🎨 DISEÑO DE EMAILS

- ✅ HTML responsive (mobile-friendly)
- ✅ Tema oscuro premium
- ✅ Gradientes y glassmorphism
- ✅ Emojis para mejor UX
- ✅ Fallback a texto plano
- ✅ Compatible con todos los clientes de email

---

## 📈 LÍMITES Y CONSIDERACIONES

### Gmail SMTP (Gratis):
- **500 emails/día**
- Suficiente para 250 citas/día (confirmación + recordatorio)
- Perfecto para empezar

### Si necesitas más volumen:
- Migrar a **Resend** (100 emails/día gratis, luego pago)
- O **SendGrid** (100 emails/día gratis)
- Fácil cambio (solo modificar SMTP config)

---

## 🔍 TROUBLESHOOTING

### "Email sending failed: Authentication failed"
❌ **Causa:** App Password incorrecta o no configurada
✅ **Solución:** Verifica SMTP_PASSWORD en .env

### "Email sending failed: Connection refused"
❌ **Causa:** Backend no puede conectar a Gmail
✅ **Solución:** Verifica SMTP_HOST y SMTP_PORT

### "No emails received"
❌ **Posibles causas:**
1. App Password no configurada
2. Email del cliente incorrecto
3. Emails en carpeta de Spam
✅ **Solución:** Revisar logs y carpeta Spam

### Ver errores detallados:

```bash
tail -100 /var/log/supervisor/backend.err.log | grep "Email"
```

---

## 🚀 PRÓXIMOS PASOS

### Funcionalidades Adicionales (Futuras):

1. **Emails de Reactivación**
   - Para clientes que no han visitado en X días
   - Template ya en email_service.py (por implementar)

2. **Campañas de Marketing**
   - Ya implementado el endpoint backend
   - Falta integración con email_service

3. **Notificaciones al Admin**
   - Cuando hay nueva reserva
   - Resumen diario de citas

4. **Personalización**
   - Permitir al admin editar templates
   - Configurar timing de recordatorios

---

## ✅ CHECKLIST DE VERIFICACIÓN

Antes de considerarlo completo:

- [ ] App Password de Gmail obtenida
- [ ] SMTP_PASSWORD actualizado en .env
- [ ] Backend reiniciado
- [ ] Email de confirmación testeado
- [ ] Script de recordatorios ejecutado manualmente
- [ ] Cron job configurado (opcional)
- [ ] Logs revisados sin errores

---

## 📞 SOPORTE

Si tienes problemas:
1. Revisa `/app/GMAIL_APP_PASSWORD_SETUP.md`
2. Verifica logs del backend
3. Ejecuta send_reminders.py manualmente para ver errores
4. Confirma que la App Password es correcta

---

**Última actualización:** 2025-01-06
**Email configurado:** nexusbycs2@gmail.com
**Sistema:** Gmail SMTP
**Estado:** ⚠️ Requiere App Password para activarse

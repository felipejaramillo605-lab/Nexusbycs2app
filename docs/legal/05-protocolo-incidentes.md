# Protocolo de Incidentes de Seguridad — Nexus by CS2 (v1)

> **Versión 2.0** · vigente desde el 5 de octubre de 2026. Base: Ley 1581 de 2012 (art. 17 lit. n y art. 18 lit. k: informar a la SIC las violaciones a los códigos de seguridad y los riesgos en la administración de la información), Ley 1273 de 2009 (delitos informáticos).

## 1. ¿Qué es un incidente?
Cualquier evento que comprometa la confidencialidad, integridad o disponibilidad de datos personales: acceso no autorizado, fuga o exposición, pérdida o robo de credenciales o dispositivos, modificación o borrado indebido, ransomware, error que muestre datos de una organización a otra, envío de mensajes a destinatarios equivocados, compromiso de un proveedor.

## 2. Clasificación
| Nivel | Criterio | Ejemplos | Meta de contención |
|---|---|---|---|
| **Crítico** | Datos de varios titulares expuestos o acceso de un tercero a producción | Fuga entre organizaciones, credenciales de producción comprometidas | 1 hora |
| **Alto** | Datos de uno o pocos titulares, sin evidencia de uso malicioso | Enlace de gestión filtrado, correo a un destinatario equivocado | 4 horas |
| **Medio / Bajo** | Sin exposición de datos o sin riesgo real | Intento bloqueado, error sin datos | 24 h |

## 3. Quién hace qué
- **Detecta:** cualquiera (usuario, negocio, proveedor, monitoreo). Reporta a nexusbycs2@gmail.com o +57 323 907 0485.
- **Líder del incidente:** Felipe Jaramillo Parra.
- **Soporte técnico:** Claude/Codex (análisis, parches) bajo instrucción del líder.

## 4. Pasos
1. **Registrar** (hora, quién, qué se vio, nivel). Abrir una entrada en la bitácora de incidentes.
2. **Contener:** revocar sesiones y claves (rotar secretos de Emergent, R2, Resend, Meta), poner en solo lectura o apagar la función afectada (banderas), bloquear cuentas, suspender el modo visualización si interviene.
3. **Preservar evidencia:** no borrar logs; guardar auditoría (`platform_audit_log`, eventos de seguridad), capturas, hora y huella de archivos.
4. **Evaluar:** qué datos, cuántos titulares, de qué negocios, durante cuánto tiempo, si hubo acceso real, si hay datos sensibles o de menores.
5. **Erradicar y recuperar:** corregir la causa (parche + prueba que falle sin el parche), restaurar desde respaldo si hace falta, verificar con el QA.
6. **Notificar (con apoyo de abogado):**
   - **Negocio Responsable** afectado: **dentro de las 72 horas** siguientes a conocer el incidente (contrato 03, cláusula 4.6), con la información disponible.
   - **SIC:** cuando se presente una violación de los códigos de seguridad o existan riesgos en la administración de la información, por el canal que la SIC disponga (y cuando exista el Registro de Incidentes). Documentar la decisión de notificar o no y su motivo.
   - **Titulares afectados:** cuando el riesgo sea alto, de forma clara, con qué pasó, qué datos, qué hacer y a quién escribir.
   - **Proveedores y autoridades penales** (Fiscalía/CSIRT) si hay delito informático.
7. **Lecciones aprendidas** (máx. 7 días): causa raíz, qué falló, acciones y responsables; actualizar pruebas, manual y esta guía.

## 5. Plantilla de registro
`ID · fecha/hora de detección · reportado por · nivel · sistemas y datos · titulares/negocios afectados · acciones de contención (hora) · causa raíz · notificaciones (a quién, cuándo) · cierre y acciones preventivas`

## 6. Ensayos
Simulacro una vez al año (p. ej. credencial filtrada y fuga entre organizaciones) y prueba de restauración de respaldo trimestral.

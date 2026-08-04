# Correo y facturacion

## Alcance

Nexus incluye perfiles de facturacion, documentos administrativos de cobro, snapshots de destinatarios, notificaciones, auditoria, backfill historico, entregas controladas y lifecycle simulado.

## Reglas operativas

- Credenciales SMTP solo en variables de entorno.
- Nunca incluir passwords o tokens en Git, logs o capturas.
- El backfill no envia correos.
- Primera entrega: una factura y un destinatario controlado.
- Validar asunto, destinatario, PDF, aviso administrativo, auditoria y reintentos.
- Activar scheduler primero en simulacion.

Los documentos son administrativos y no sustituyen una factura electronica validada por la DIAN.

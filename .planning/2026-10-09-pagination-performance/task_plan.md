# Plan: Auditoría de paginación y rendimiento — octubre 2026

## Objetivo

Auditar rutas de listado, paginación y cuellos de botella de Nexus; priorizar soluciones por impacto/esfuerzo, implementar únicamente mejoras pequeñas y seguras, documentar evidencia y dejar una nota revisable para Claude.

## Restricciones

- No despliegues, cambios de secretos ni datos de producción.
- No alterar contratos de API sin pruebas de compatibilidad.
- Las mejoras de código quedan locales para revisión/CI antes de publicar.

## Fases

1. [x] Inventariar endpoints de listas, patrones de paginación y consultas sin límite.
2. [x] Revisar índices, N+1, conteos, carga frontend y tareas periódicas.
3. [x] Priorizar hallazgos con evidencia, impacto, esfuerzo y solución propuesta.
4. [x] Implementar y validar solo una o más mejoras de bajo riesgo y esfuerzo bajo.
5. [x] Documentar informe y bitácora para Claude; cerrar resultados y límites.
6. [x] Reemplazar la lectura completa de `transaction_summary` por una agregación en base de datos sin alterar su contrato.
7. [x] Validar sintaxis, actualizar el informe y conservar la migración SKU de inventario como cambio API/UI separado; CI queda pendiente para la prueba nueva.

## Estado actual

La auditoría identificó y documentó los riesgos. Se añadió el índice seguro `(audit_id, item_name_snapshot)` para auditorías de inventario. A petición del usuario, ahora se implementa la agregación de resumen de transacciones; la migración SKU de inventario sigue requiriendo un cambio API/UI separado.

## Errores

| Error | Resolución |
|---|---|
| `init-session.ps1 -Name` creó plantillas en la raíz en lugar de una carpeta nombrada | Se eliminaron esas tres plantillas recién creadas y se creó el plan aislado actual. |

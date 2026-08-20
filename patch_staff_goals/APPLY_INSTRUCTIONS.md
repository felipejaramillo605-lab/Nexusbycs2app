# Feature: Metas de staff (semanal/mensual) + ranking del equipo

## Contenido

```
patches/
  ManagerBarbers.js   → reemplaza frontend/src/pages/ManagerBarbers.js
  StaffIncome.js       → reemplaza frontend/src/pages/StaffIncome.js
  api_index.js         → reemplaza frontend/src/api/index.js
apply_server_patch.py  → SCRIPT que edita backend/server.py en sitio (NO lo reemplaces con un archivo)
```

## Por qué `server.py` es distinto a los demás

Tu `server.py` actual ya tiene, sin subir a GitHub todavía, los cambios de
la feature de solicitud de reseñas. Si este parche viniera como un archivo
completo para copiar (`cp`), borraría ese trabajo — el mismo tipo de
incidente que ya tuvimos una vez con la fase 2 del catálogo de unidades.

Por eso `server.py` no está en `patches/` como archivo — viene como
`apply_server_patch.py`, un script que hace 9 ediciones puntuales por
coincidencia exacta de texto sobre tu archivo actual. Es seguro sin
importar si ya subiste reseñas a GitHub o no. Si por algún motivo alguna
edición no encuentra su texto exacto (por ejemplo si ya aplicaste este
parche antes), el script aborta todo sin escribir nada y te dice
exactamente cuál edición falló — no hay aplicaciones parciales silenciosas.

## Qué hace

- Cada profesional puede tener una meta de ingresos (lo que se lleva a
  casa: comisión + propinas), configurable como **semanal o mensual** —
  la fija el manager en Equipo, no el propio staff.
- En "Mis ingresos", el staff ve su avance hacia la meta (solo cuando el
  filtro de periodo coincide con el tipo de meta configurada — una meta
  semanal no se compara contra la ventana de 30 días, y viceversa).
- Nueva sección de **ranking del equipo completo**, visible para
  cualquier staff (no solo managers): todos los profesionales activos de
  la organización, ordenados por lo generado en la ventana seleccionada
  (7 o 30 días), con posición, monto, y avance hacia su propia meta si la
  tienen. El ranking no aplica al filtro "Hoy" (solo semana/mes).

## Cómo aplicar

```bash
cd /app
python3 apply_server_patch.py
cp patches/ManagerBarbers.js frontend/src/pages/ManagerBarbers.js
cp patches/StaffIncome.js frontend/src/pages/StaffIncome.js
cp patches/api_index.js frontend/src/api/index.js
```

Validación:
```bash
python3 -m py_compile backend/server.py && echo "OK sintaxis backend"
cd frontend && yarn build 2>&1 | tail -40 && cd ..
```

## Pruebas manuales sugeridas en preview

1. Equipo → edita un profesional → pon una meta (ej. `1500000`) con
   periodo **Mensual** → guarda → reabre su edición → confirma que quedó
   guardada tal cual.
2. Completa y cobra un par de citas de ese profesional.
3. Como ese staff, en "Mis ingresos" con filtro **30 días** → debe
   aparecer la tarjeta "Meta mensual" con el % de avance.
4. Cambia el filtro a **7 días** → esa tarjeta de meta debe
   **desaparecer** (la meta es mensual, no aplica a la ventana semanal).
5. Repite con una meta **Semanal** en otro profesional y confirma el caso
   inverso (aparece en "7 días", no en "30 días").
6. Con **dos o más profesionales** con ventas registradas, revisa la
   sección "Ranking del equipo" — confirma que el orden es de mayor a
   menor generado, que tu propia fila se resalta ("tú"), y que cambia
   correctamente al alternar entre "7 días" y "30 días".
7. Filtro **Hoy** → confirma que la sección de ranking muestra el mensaje
   de que no aplica, sin error.
8. Un profesional **sin meta asignada** → confirma que no aparece ninguna
   tarjeta de meta ni error para él.

## Commit sugerido

Aparte del commit de reseñas (independiente, sin relación):
```bash
git add backend/server.py frontend/src/pages/ManagerBarbers.js frontend/src/pages/StaffIncome.js frontend/src/api/index.js
git commit -m "Feature: staff goals (weekly/monthly, manager-defined) with progress tracking and full team ranking"
git log --oneline -3
```

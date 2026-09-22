# Servicios → Clases: primer incremento

## Cambios

- Entrada por Servicios con acceso a Catálogo, Clases y Membresías. La ruta antigua `/manager/classes` redirige conservando sus parámetros.
- Accesos por servicio grupal a sesiones y horarios recurrentes con servicio preseleccionado.
- Descripción, portada, banner, texto alternativo y punto focal aditivos, sin migración de reservas. Primera foto como respaldo.
- `service_presentation` compartida por los endpoints de sesiones públicos y autenticados. Consultas de servicios, profesionales y puestos acotadas por organización.
- Tarjetas 4:3 con descripción y duración en el portal autenticado. Se conservan los controles existentes de cupos, puestos, lista de espera y membresía.
- Reemplazo de media con comparación de referencias para rechazar ediciones concurrentes. Borrado posterior a la persistencia y conservación de archivos compartidos por galería/portada/banner.
- El editor conserva y expone ventanas de reserva y cancelación. Las peticiones antiguas que omiten estos campos o presentación no los borran; un `null` explícito sí permite restablecerlos.

## Validación local

- `git diff --check`.
- `py_compile` de los 53 módulos principales de backend y del test nuevo.
- 14 pruebas aisladas: `python -m unittest discover -s backend/tests -p test_service_presentation.py -v`.
- `yarn install --frozen-lockfile` completado con avisos de resoluciones ya existentes.
- Build frontend: `CI=true GENERATE_SOURCEMAP=false yarn build` compiló correctamente.

Las pruebas usan FastAPI y normalización WebP reales; la base de datos y el almacenamiento están sustituidos por dobles de prueba. No equivalen a pruebas concurrentes con MongoDB ni a un recorrido autenticado en navegador.

## Límites y revisión pendiente

- Este PR entrega el primer incremento iniciado localmente, no el plan completo. Quedan el detalle con banner, el override por sesión y la experiencia grupal en BookingFlow/CustomerPortal.
- Validar con datos de prueba: reserva individual, clase de pago, clase cubierta por membresía, ocupación simultánea de cupo/puesto, cancelación y promoción única desde lista de espera; también teclado, móvil y redirección antigua.
- Ante un fallo de transporte de MongoDB con resultado incierto se conservan los archivos, evitando borrar una imagen posiblemente confirmada; puede quedar un archivo huérfano.
- La entrega de imágenes reutiliza el endpoint público de catálogo existente. Se verifica aislamiento de modificación/borrado, no confidencialidad de una imagen pública cuya URL se conoce. Si se requiere lectura autenticada por tenant, debe definirse cómo permitir a invitados descubrir servicios.
- La rama parte del commit `6ab30bb` del PR #15 (no mostrar Cobrar para membresías). Revisar/fusionar #15 primero y comprobar el diff restante antes de fusionar este incremento.
- `.planning/` preexistente se conserva localmente y no se incluye en el commit.

## GitHub y Emergent

Revisar CI y el PR hacia `main`. Tras la fusión, Emergent debe usar **Pull from GitHub** de `main` y comprobar el commit importado. Validar Preview con datos de prueba antes de **Redeploy**. No se realizó deploy ni se modificaron datos o secretos de producción.

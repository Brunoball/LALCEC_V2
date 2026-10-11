# LALCEC V2 — Testing de cierre de Medicamentos (10/10/2026)

Esta corrección modifica **solo archivos de `tests/`** y aporta un SQL opcional de inicialización contable. **No cambia producción, frontend ni backend**. El SQL no se ejecuta automáticamente. Usar junto con los **últimos** `backend.zip` y `src.zip` de LALCEC V2; el backend debe tener activo `core/e2e_guard.php` y los endpoints `e2e_cleanup`, `e2e_snapshot` y `e2e_guard_probe`.

## Instalación

Descomprimir el ZIP en la carpeta del proyecto, conservando la carpeta `tests/` (en el proyecto habitual estará dentro de `frontend/tests/`). Reemplazar exclusivamente los archivos incluidos en `tests/` (00, 21, 22, 23 y este README). Conservar intactos los otros tests. El archivo `PREPARAR_OPCIONES_CONTABLES.sql` es **opcional** y se ejecuta únicamente de forma deliberada en la DB de pruebas.

## Ejecución

Desde `frontend` con las dependencias ya instaladas y `.env.test` configurado:

```powershell
npx playwright test tests/20-medicamentos-stock-integridad.spec.js tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js tests/24-medicamentos-seguridad-regresiones.spec.js tests/07-permisos-solo-lectura.spec.js tests/00-cobertura-total.spec.js --project=chromium --workers=1 --reporter=list
```

Para validar **el sistema administrativo completo**, correr después:

```powershell
npx playwright test --project=chromium --workers=1 --reporter=list
```

`--workers=1` evita bombardear Hostinger. La suite general existente no incluye pruebas reales del bot de WhatsApp, y ninguna suite finita certifica automáticamente el 100 % de los comportamientos posibles.

## Seguridad y prerequisitos

- Las escrituras usan `X-LALCEC-E2E=PLAYWRIGHT` y fixtures con nombre `PW E2E`; el backend protege los registros reales. Setup y teardown ejecutan limpieza E2E y comparan la huella de registros reales. Si falla el **probe** del escudo, la suite aborta.
- Los casos económicos exigen que las categorías y conceptos contables automáticos **ya existan** antes de crear movimientos. Si faltan, el test falla antes de escribir; crear estas opciones deliberadamente desde Configuración en un **ambiente de pruebas** o probar allí primero. Evita que Playwright agregue opciones globales a una base real y viole el baseline. Los nombres se informan en el error.
- Antes de ejecutar por primera vez en producción, hacer backup y verificar que los archivos de backend, principalmente `testing_cleanup.php`, `e2e_guard.php` y Medicamentos, estén desplegados en la misma versión. Preferir staging con una copia de datos saneada para las pruebas de anulaciones y dinero.
- Si un test falla, revisar `test-results`, la respuesta HTTP y la limpieza final. **No ejecutar SQL de limpieza manual** sobre datos reales.
- Los escenarios de doble solicitud validan que no haya dos consumos exitosos con stock insuficiente; en Hostinger el throttling de Playwright puede serializar esas solicitudes. No sustituye un test de carga/concurrencia real.

## Cobertura agregada

| Archivo | Escenarios reales |
| --- | --- |
| 20 — Stock | Alta atómica; edición con historial; baja/reactivación; entradas; FEFO de varios lotes; stock insuficiente; bloqueo/descartes; fechas; cantidades; idempotencia |
| 21 — Contabilidad | Compra y egreso/proveedor; venta multi-lote y asiento único; devoluciones y contramovimientos; anulación de compra; rechazo de doble anulación y compra usada |
| 22 — Préstamos | Socio fixture; varios lotes; descuento único de stock; devoluciones parciales; reintegro y donación de seña; cierre con saldo pendiente; bloqueo de acciones tras cierre |
| 23 — Interfaz | Formularios reales de alta y edición; pestañas Activos/Bajas; lotes/historial; egreso y validación visual FEFO; préstamo/detalle/devolución/cierre; catálogo de consultas |
| 24 — Seguridad | Solicitudes incompatibles por stock; rollback de errores; escudo E2E ante alta sin marca; control de rutas/limpieza segura |
| 07 — Permisos (actualizado) | Consultas de Medicamentos con cuenta lectura; prohibición de todas las mutaciones; ocultación de botones de escritura |
| 00 — Contrato (actualizado) | Descubre ahora las 18 acciones declaradas por `foreach` en `routes.php`, antes ignoradas; exige referencias de cobertura en las specs |

## Correcciones de la corrida 144/152 del 10/10/2026

- `00`: ya no confunde `register('medicamentos_'.$accion, ...)` con la acción literal `medicamentos_`; verifica las 18 acciones dinámicas reales y la ruta alias `/medicamentos`.
- `23`: corrige el filtro `Búsqueda`, recorre la pestaña `Primer ingreso` antes de llenar cantidad, valida estados en `Lotes asignados` y prueba la entrada de stock desde la UI.
- `21`: conserva los contratos de compra/venta y comprueba la anulación mediante su modal real.
- `22`: comprueba reintegro y donación parcial desde los botones y formularios reales, además de confirmar su persistencia.
- **Cuatro opciones contables faltantes:** el backend las generaría automáticamente al contabilizar; eso alteraría configuración no E2E y haría fallar el control de integridad del entorno compartido. Por eso `requireAccountingOptions` sigue abortando antes de escribir. El archivo `PREPARAR_OPCIONES_CONTABLES.sql` permite darlas de alta **una sola vez, manualmente, en una DB de desarrollo/pruebas**, antes del inicio del test y de su snapshot.

**Comprobación efectuada:** los cuatro archivos JS pasan `node --check`; la auditoría estática del test 00 encuentra 90 acciones declaradas, 20 rutas, sin acciones, rutas ni marcadores faltantes. **No se ha ejecutado nuevamente la suite Playwright con la DB y navegador reales.** Hasta repetir los 152 escenarios y revisar cleanup/baseline, no se puede certificar un cierre al 100 % ni congelar el módulo solo con esta revisión.

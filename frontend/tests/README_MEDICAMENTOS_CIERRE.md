# LALCEC V2 — Testing de Medicamentos (actualización 11/10/2026)

Este ZIP contiene la suite Playwright **completa recibida** y una prueba PHP local opcional. **No contiene código de producción ni comandos de borrado de base de datos**. Está preparado para el frontend y backend **posteriores a la eliminación de la tabla auxiliar de solicitudes de Medicamentos**. El backend debe contar con `core/e2e_guard.php` y los endpoints `e2e_cleanup`, `e2e_snapshot` y `e2e_guard_probe`.

## Instalación

Descomprimir el ZIP en la raíz `LALCEC_V2/`: copiar `tests/` dentro de `frontend/tests/` y `tests_local/` en `LALCEC_V2/tests_local/`. **No** copiar `tests/` directamente junto a `backend/`: la ruta prevista para Playwright es `frontend/tests/`. Se mantiene toda la suite original, con cambios puntuales en `20`, `21`, `24`, `helpers/medicamentos.helper.js` y la adición de `50`. El presente ZIP no incluye ningún SQL.

## Ejecución

Desde `frontend` con las dependencias ya instaladas y `.env.test` configurado:

```powershell
npx playwright test tests/20-medicamentos-stock-integridad.spec.js tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js tests/24-medicamentos-seguridad-regresiones.spec.js tests/50-medicamentos-sin-solicitudes.spec.js tests/07-permisos-solo-lectura.spec.js tests/00-cobertura-total.spec.js --project=chromium --workers=1 --reporter=list
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
| 20 — Stock | Alta atómica; edición con historial; baja/reactivación; FEFO de varios lotes; stock insuficiente; bloqueos/descartes; fechas y cantidades; doble ingreso explícito sin idempotencia |
| 21 — Contabilidad | Compra y egreso/proveedor; venta multi-lote y asiento único; devoluciones y contramovimientos; anulación de compra; rechazo de doble anulación y compra usada |
| 22 — Préstamos | Socio fixture; varios lotes; descuento único de stock; devoluciones parciales; reintegro y donación de seña; cierre con saldo pendiente; bloqueo de acciones tras cierre |
| 23 — Interfaz | Formularios reales de alta y edición; pestañas Activos/Bajas; lotes/historial; egreso y validación visual FEFO; préstamo/detalle/devolución/cierre; catálogo de consultas |
| 24 — Seguridad | Concurrencia y stock insuficiente; rollback de errores; escudo E2E ante alta sin marca; rutas y limpieza de las siete tablas persistentes de Medicamentos |
| 50 — Contrato sin solicitudes | No hay consultas a la tabla auxiliar ni envío de claves; transacciones/lockings y bloqueo de doble clic presentes en código local |
| tests_local — Smoke PHP | Prueba transaccional y reintento de deadlock simulados; requiere PHP CLI y backend actualizado |
| 07 — Permisos (actualizado) | Consultas de Medicamentos con cuenta lectura; prohibición de todas las mutaciones; ocultación de botones de escritura |
| 00 — Contrato (actualizado) | Descubre ahora las 18 acciones declaradas por `foreach` en `routes.php`, antes ignoradas; exige referencias de cobertura en las specs |

## Correcciones de la corrida 144/152 del 10/10/2026

- `00`: ya no confunde `register('medicamentos_'.$accion, ...)` con la acción literal `medicamentos_`; verifica las 18 acciones dinámicas reales y la ruta alias `/medicamentos`.
- `23`: corrige el filtro `Búsqueda`, recorre la pestaña `Primer ingreso` antes de llenar cantidad, valida estados en `Lotes asignados` y prueba la entrada de stock desde la UI.
- `21`: conserva los contratos de compra/venta y comprueba la anulación mediante su modal real.
- `22`: comprueba reintegro y donación parcial desde los botones y formularios reales, además de confirmar su persistencia.
- **Cuatro opciones contables faltantes:** el backend las generaría automáticamente al contabilizar; eso alteraría configuración no E2E y haría fallar el control de integridad del entorno compartido. Por eso `requireAccountingOptions` sigue abortando antes de escribir. Esas opciones deben prepararse **manualmente en Configuración sobre una DB de desarrollo/pruebas**, antes del inicio de la suite y de su snapshot. **Este ZIP no trae SQL para modificar la base.**

**Antecedente (10/10/2026):** una revisión previa encontró 90 acciones declaradas y 20 rutas. Este número no se volvió a comprobar mediante Playwright en la entrega actual. **No se ejecutó la suite con DB y navegador reales.** Se requiere volver a ejecutar la suite completa y revisar cleanup/baseline antes de congelar el módulo. El total histórico de 152 escenarios corresponde a la versión anterior.


## Eliminación de la tabla auxiliar — 11/10/2026

- `20`: se eliminó la expectativa de respuesta recuperada por clave; ahora demuestra que dos solicitudes POST independientes generan dos lotes y dos movimientos. **Advertencia:** no repetir un envío por un timeout sin verificar antes el resultado en el historial.
- `21`: se quitó la etiqueta «idempotencia» de un escenario de compra que no verifica ese mecanismo.
- `24`: la auditoría de limpieza espera solo las siete tablas persistentes del módulo.
- `helpers/medicamentos.helper.js`: el alta ya no admite el argumento `key` ni incorpora `_idempotency_key`.
- `50`: nuevo contrato estático contra archivos locales del backend/frontend actualizados (es intencional que el test incluya el nombre de la tabla en una afirmación **negativa**; no es una consulta SQL ni una dependencia de ejecución).
- `tests_local/medicamentos_transaccion_smoke.php`: correr desde la raíz del proyecto con `php tests_local/medicamentos_transaccion_smoke.php`, opcional; no usa MySQL real.

**Alcance de la validación de esta entrega:** lint de sintaxis Node para cada `.js`, análisis estático de referencias y smoke PHP local. **No** se ejecutaron los flujos E2E contra MySQL/Hostinger, por lo que el resultado real debe comprobarse en tu entorno.

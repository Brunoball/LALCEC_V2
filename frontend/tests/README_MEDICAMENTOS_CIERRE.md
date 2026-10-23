# LALCEC V2 · Medicamentos sin lotes — Testing actualizado

Rediseño de octubre de 2026: inventario único por medicamento, sin lotes, pero con fecha de vencimiento, alertas y señalización por colores. Las entradas y salidas se gestionan desde **Editar → Stock**; las bajas requieren motivo. Se conservan compras/ventas contables, anulaciones, préstamos, devoluciones, señas e idempotencia.

## Instalación

Copiar el contenido del ZIP de tests en `LALCEC_V2/frontend/tests`, reemplazando los archivos anteriores; el ZIP de backend ya incluye los cambios a `backend/core/e2e_guard.php` y `backend/modules/testing_cleanup/testing_cleanup.php`. Usar primero la migración SQL y el frontend/backend nuevos de este mismo paquete. La migración elimina deliberadamente todos los medicamentos y préstamos de prueba anteriores.

## Ejecutar

Desde la carpeta `LALCEC_V2/frontend`:

```powershell
npx playwright test tests/20-medicamentos-stock-integridad.spec.js tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js tests/24-medicamentos-seguridad-regresiones.spec.js tests/25-medicamentos-idempotencia.spec.js tests/26-medicamentos-alertas-vencimientos.spec.js tests/27-medicamentos-venta-lote-descartado.spec.js tests/50-medicamentos-sin-solicitudes.spec.js tests/51-medicamentos-opciones.spec.js --project=chromium --workers=1 --reporter=list
```

Luego, para toda la suite:

```powershell
npx playwright test --project=chromium --workers=1 --reporter=list
```

## Alcance

- Alta sin stock y con stock; entrada por donación o compra; salida por entrega, venta, ajuste o descarte.
- Historial por medicamento y prevención de stock negativo; datos históricos inmutables.
- Bajas obligatoriamente motivadas y reactivaciones.
- Asientos contables de compras, ventas y anulaciones (compensatorias).
- Préstamos sin lotes, devoluciones parciales, señas, reintegros y cierre.
- Alertas por fechas de vencimiento de medicamentos y por devoluciones previstas de préstamos.
- Claves de idempotencia, concurrencia y guardia E2E sobre registros de prueba.

**No se ejecutaron pruebas funcionales contra MySQL/Hostinger desde este entorno.** Se validó sintaxis de PHP, JS/JSX y la eliminación de referencias antiguas. Ejecutá Playwright en tu entorno local y verificá el resultado antes de publicar. El nombre del spec `27-medicamentos-venta-lote-descartado.spec.js` se mantiene por compatibilidad, pero su lógica ya no usa lotes.

## Actualización del 20/10/2026

- `51-medicamentos-opciones.spec.js`: valida los catálogos contra la API y los valores históricos del inventario. El SQL de migración en la raíz es opcional una vez aplicado; si existe, también se inspecciona. Incluye alta rápida de Presentación/Unidad y la gestión desde Configuración.
- `12-contabilidad-ui-completa.spec.js`: prueba el límite vigente de **20 registros por página** en Otros ingresos y Egresos, con 21 registros simulados y navegación de dos páginas.
- `helpers/medicamentos.helper.js`: las altas E2E con stock reciben una fecha de vencimiento futura, hoy obligatoria por backend.
- `50-medicamentos-sin-solicitudes.spec.js`: corrige el conteo histórico de diez a nueve operaciones transaccionales reales.
- `26-medicamentos-alertas-vencimientos.spec.js`: suma una prueba real de alertas de medicamentos (umbral, descarte y stock inalterado).
- `00-cobertura-total.spec.js`: conserva el contrato de acciones y rutas, elimina marcadores de lotes obsoletos y exige los recorridos de la nueva Configuración.
- Estos cambios de pruebas no alteran datos de usuarios. Las opciones creadas por Playwright se eliminan por ID; la seguridad/limpieza automática del proyecto sigue siendo obligatoria.
- Comprobar funcionamiento con `npx playwright test --project=chromium --workers=1 --reporter=list` desde `frontend` antes de considerar cerrada la suite.

## Cobertura UI pendiente de ejecución

El contrato global verifica únicamente los botones que realmente tienen prueba de interfaz. Los escenarios API de anulaciones, señas, devoluciones y alertas no constituyen por sí mismos pruebas visuales de todos sus botones. No se afirma 100 % de cobertura UI hasta completar esas pruebas y ejecutar la suite con éxito.

## Actualización del 22/10/2026 · Cierre definitivo

- **Requiere la migración** `sql/2026-10-22_medicamentos_cierre_vencimientos.sql` antes de ejecutar la suite.
- `28-medicamentos-cierre-regresiones.spec.js` (nuevo): anulación exitosa de compra con restauración del vencimiento, criterio conservador con ingresos posteriores, fecha de ingreso declarada, textos largos (422 en lugar de 500), edición con formulario desactualizado (409), venta/entrega de vencidos y sin fecha, importes contables exactos (compra, venta y compensación), venta fallida sin asiento huérfano, protección de asientos desde Contabilidad e idempotencia con contenido distinto.
- `20` y `22`: la baja exige stock 0 y ningún préstamo con unidades pendientes; se ajustaron los escenarios y se agregó "seña vacía equivale a sin seña".
- `23`: baja con stock muestra el paso previo y deshabilita la confirmación; un medicamento vencido solo ofrece Descarte / Ajuste negativo en Restar stock.
- Los specs de API (20–22, 24–28, 50, 51) se ejecutaron contra una base local cargada con `lalcec_v2.sql` y la guardia E2E activa: 40/40 aprobados. Los escenarios de interfaz (23 y la parte UI de 51) deben ejecutarse en tu entorno con navegador.

## Sincronización del 23/10/2026 · UI de Medicamentos

- `23-medicamentos-ui-flujos.spec.js`: ajusta el nombre accesible del botón de minimizar las alertas; valida el texto exacto del selector de medicamentos para préstamos (nombre comercial y stock, sin descripción), tolerando únicamente la transformación a mayúsculas aplicada por el componente.
- `23-medicamentos-ui-flujos.spec.js`: incorpora regresiones **de interfaz** para el historial: una venta anulable permite abrir la confirmación, exige medio de pago, motivo y confirmación física, ejecuta la anulación y bloquea la segunda; una compra inicialmente anulable se deshabilita después de un consumo posterior y exhibe el motivo del bloqueo. Las operaciones utilizan datos `PW E2E` y la limpieza segura existente.
- `51-medicamentos-opciones.spec.js`: usa el encabezado real `.med-config__head` de Configuración → Medicamentos.
- **No se agregan pruebas para WhatsApp ni para BotPanel**. Se mantiene su exclusión explícita del contrato administrativo.
- Solo se modifican estos dos specs y esta nota de instalación; no hay cambios en `src/`, `backend/` ni SQL.

Para probar los archivos corregidos:

```powershell
npx playwright test tests/23-medicamentos-ui-flujos.spec.js tests/51-medicamentos-opciones.spec.js --project=chromium --workers=1 --reporter=list
```

Para cerrar el testing hay que ejecutar luego la suite completa y confirmar que aprueban los escenarios E2E y la verificación de integridad. **Esta actualización fue validada estáticamente, pero no ejecutada contra la aplicación/DB** desde el entorno de entrega.

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

# LALCEC V2 · Medicamentos sin lotes — Testing actualizado

Rediseño de octubre de 2026: inventario único por medicamento, sin lotes, fechas de vencimiento ni bloqueo de lotes. Las entradas y salidas se gestionan desde **Editar → Stock**; las bajas requieren motivo. Se conservan compras/ventas contables, anulaciones, préstamos, devoluciones, señas e idempotencia.

## Instalación

Copiar el contenido del ZIP de tests en `LALCEC_V2/frontend/tests`, reemplazando los archivos anteriores; el ZIP de backend ya incluye los cambios a `backend/core/e2e_guard.php` y `backend/modules/testing_cleanup/testing_cleanup.php`. Usar primero la migración SQL y el frontend/backend nuevos de este mismo paquete. La migración elimina deliberadamente todos los medicamentos y préstamos de prueba anteriores.

## Ejecutar

Desde la carpeta `LALCEC_V2/frontend`:

```powershell
npx playwright test tests/20-medicamentos-stock-integridad.spec.js tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js tests/24-medicamentos-seguridad-regresiones.spec.js tests/25-medicamentos-idempotencia.spec.js tests/26-medicamentos-alertas-vencimientos.spec.js tests/27-medicamentos-venta-lote-descartado.spec.js tests/50-medicamentos-sin-solicitudes.spec.js --project=chromium --workers=1 --reporter=list
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
- Alertas exclusivamente por fecha prevista de devolución del préstamo.
- Claves de idempotencia, concurrencia y guardia E2E sobre registros de prueba.

**No se ejecutaron pruebas funcionales contra MySQL/Hostinger desde este entorno.** Se validó sintaxis de PHP, JS/JSX y la eliminación de referencias antiguas. Ejecutá Playwright en tu entorno local y verificá el resultado antes de publicar. El nombre del spec `27-medicamentos-venta-lote-descartado.spec.js` se mantiene por compatibilidad, pero su lógica ya no usa lotes.

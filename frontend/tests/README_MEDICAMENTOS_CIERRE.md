# LALCEC V2 — Testing actualizado de Medicamentos (17/10/2026)

**Alcance:** stock/lotes, ventas y compras contables, devoluciones, préstamos, señas, cierre con donación automática, anulación de ventas en lotes descartados, semáforo/alertas y descartes persistentes, seguridad E2E e idempotencia.

## Instalación (importante)

Este paquete contiene **solo archivos nuevos o modificados de pruebas y del escudo E2E**. No reemplaza el módulo Medicamentos. Extraer desde la raíz `LALCEC_V2/`, respetando las rutas:

- `frontend/tests/...`: tests Playwright y helpers.
- `backend/core/e2e_guard.php`: permite que el test de alertas solo descarte avisos de lotes/préstamos E2E, bloqueando avisos de terceros.
- `backend/modules/testing_cleanup/testing_cleanup.php`: permite limpiar con seguridad los registros E2E de las dos nuevas tablas, protege los reales en el snapshot de huella y evita dejar residuos.

El spec `tests/50-medicamentos-sin-solicitudes.spec.js` **se reemplaza con el mismo nombre** para que no persista un test viejo que exigía la eliminación de `medicamentos_solicitudes`. El nombre de archivo se conserva solo por compatibilidad; el contenido comprueba el módulo con idempotencia.

No requiere SQL adicional, asumiendo que ya instalaste las tablas `medicamentos_solicitudes` y `medicamentos_alertas_descartadas` junto con el módulo actual. Es **indispensable** que `backend/core/e2e_guard.php` y `backend/modules/testing_cleanup/testing_cleanup.php` estén publicados en el entorno contra el que corrés Playwright **antes** de ejecutar tests que escriben datos.

## Antes de correr

1. Hacé un respaldo de la base de datos de pruebas.
2. Confirmá `PW_ENVIRONMENT`, `PW_BASE_URL`, `PW_API_URL`, credenciales y `PW_E2E_HEADER` de tu `.env.test`. La API debe tener los endpoints `e2e_guard_probe`, `e2e_cleanup`, `e2e_status`, `e2e_snapshot` y proteger mutaciones por `X-LALCEC-E2E: PLAYWRIGHT`.
3. El setup verifica escudo, limpia datos E2E previos y guarda la huella de datos ajenos a E2E; el teardown vuelve a limpiar y comparar. NO intentes forzar el setup si informa que falta el escudo.
4. El frontend debe ser exactamente el de los últimos `src.zip`/`backend.zip` auditados. Las opciones de Contable de compras, ventas, anulaciones y señas deben existir de antemano (el test económico aborta sin escribir si faltan).

**Las claves de idempotencia generadas por los tests llevan `med-PWE2E-...`**. En los tests de UI se transforma de manera determinista la clave del frontend antes de llegar al backend, manteniendo el comportamiento de reintento. La limpieza *solo* puede borrar esas claves, jamás las normales. Los descartes se eliminan únicamente si corresponden a lotes/préstamos identificados como E2E.

## Ejecución

Desde `LALCEC_V2/frontend`, con Playwright y su Chromium ya instalados:

```powershell
npx playwright test tests/20-medicamentos-stock-integridad.spec.js tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js tests/24-medicamentos-seguridad-regresiones.spec.js tests/25-medicamentos-idempotencia.spec.js tests/26-medicamentos-alertas-vencimientos.spec.js tests/27-medicamentos-venta-lote-descartado.spec.js tests/50-medicamentos-sin-solicitudes.spec.js tests/07-permisos-solo-lectura.spec.js tests/00-cobertura-total.spec.js --project=chromium --workers=1 --reporter=list
```

Para toda la administración:

```powershell
npx playwright test --project=chromium --workers=1 --reporter=list
```

`--workers=1` reduce riesgos de carreras no controladas contra Hostinger; los tests específicos de idempotencia sí envían solicitudes repetidas/concurrentes a propósito.

## Cobertura relevante

- **20:** altas atómicas, estados, FEFO, lotes, movimiento inválido y dos solicitudes intencionalmente distintas.
- **21:** compras / reintegros, venta multi-lote, anulación y no duplicación de asientos.
- **22:** préstamos / devoluciones / seña, reintegro como egreso, donación automática solo al finalizar, sin botón de donación manual.
- **23:** acciones UI y tabla de préstamos sin N.º; información, devolución, finalización.
- **24:** concurrencia, escudo E2E, validaciones y rutas actuales.
- **25:** falta de clave, reintento idéntico, conflicto de payload, concurrencia con misma clave, seña y cierre idempotentes.
- **26:** alertas a 30 días, fecha alterada, descarte permanente, confirmación/cancelación, mini-pestaña, préstamo con/sin fecha y cierre.
- **27:** venta ya facturada y lote original descartado, anulación con un solo egreso, devolución a lote nuevo BLOQUEADO.
- **50:** verificación del contrato fuente de las 10 escrituras, acciones nuevas y alertas.
- **07, 00:** permisos solo-lectura, cobertura de API/UI general y ausencia de specs deshabilitados.

## Límites de la verificación

Estos tests fueron actualizados frente a los ZIP suministrados y sus archivos verificaron sintaxis. **No se ejecutó Playwright contra un MySQL/navegador real en este entorno**. Por eso la cobertura funcional declarada no puede presentarse como *100 % validada*. No se prueba el bot externo de WhatsApp y los tests unitarios Jest de la API y de `vencimientos.js` que ya existen dentro de `src/` siguen siendo útiles.

No uses `tests/helpers/db-cleanup.php` para borrar registros: la limpieza debe realizarla exclusivamente la API con escudo E2E. Para producción, ejecutá primero en local/staging y comprobá el teardown y el snapshot antes de repetir en Hostinger.

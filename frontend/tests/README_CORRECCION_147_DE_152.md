# Corrección incremental de la corrida 147/152 — 10/10/2026

## Evidencia de `Texto pegado.txt` y `test-results.zip`

La última ejecución pasó **147 de 152** (5 fallaron). La limpieza informó **549 registros/archivos E2E eliminados** e **Integridad OK**; estos números describen la corrida anterior y **no** la validación de la presente corrección.

| Escenario | Causa comprobada | Acción |
|---|---|---|
| `21...` compra/anulación | No existe `CATEGORIA_INGRESO: REINTEGROS DE COMPRAS DE MEDICAMENTOS` ni `CONCEPTO_INGRESO: REINTEGRO DE COMPRA DE MEDICAMENTOS` | Preparar DB de pruebas de forma deliberada |
| `21...` venta/anulación | No existe `CATEGORIA_EGRESO: DEVOLUCIONES DE VENTAS DE MEDICAMENTOS` ni `CONCEPTO_EGRESO: DEVOLUCIÓN DE VENTA DE MEDICAMENTOS` | Preparar DB de pruebas de forma deliberada |
| `22...` préstamo con seña | La captura muestra la fila `#6`, pero `filter({has:loansTable.getByRole('cell',...)})` intenta encontrar de nuevo una tabla dentro de la fila | Usar un locator de celda relativo a la fila |
| `23...` alta UI | `getByLabel('Cantidad')` también selecciona el panel accesible `Lote y cantidad`, por lo que Playwright rechaza la ambigüedad | Seleccionar el `spinbutton` etiquetado `Cantidad *` |
| `23...` préstamos UI | La captura muestra la fila `#8`; mismo error de locator del test 22 | Usar un locator de celda relativo a la fila |

## Paso a paso

Extraer el ZIP en `LALCEC_V2/frontend/`. Solo reemplazar los dos `.spec.js` de este archivo.

Si las cuatro opciones aún faltan, crear desde **Configuración → Contabilidad** en la DB de pruebas, o aplicar manualmente `PREPARAR_OPCIONES_CONTABLES.sql` después de revisar su contenido y hacer backup. Este SQL genera opciones funcionales permanentes y no forma parte del setup/teardown E2E, porque crearlas durante los tests rompería la huella de datos reales protegida.

El SQL usa `ON DUPLICATE KEY UPDATE` sin cambios efectivos y no reactiva opciones desactivadas. Se basa en el índice único `(tipo,nombre)` comentado en `medicamentos_soporte.php`; no hay `lalcec_v2.sql` adjunto para validar esta restricción en la base real. Confirmar los cuatro registros con el `SELECT` final.

Probar primero los casos afectados:

```powershell
npx playwright test tests/21-medicamentos-contabilidad-anulaciones.spec.js tests/22-medicamentos-prestamos-senas.spec.js tests/23-medicamentos-ui-flujos.spec.js --project=chromium --workers=1 --reporter=list
```

Luego ejecutar toda la suite:

```powershell
npx playwright test --project=chromium --workers=1 --reporter=list
```

Los selectores se verificaron contra los roles/nombres accesibles guardados en `test-results.zip`; ambos archivos JS pasan `node --check`. El backend y src se examinaron solo para confirmar comportamiento, **no** fueron alterados. Esta corrección todavía requiere validación en tu entorno real antes de congelar el testing.

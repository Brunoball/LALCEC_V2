# Informe de refuerzo de cobertura — LALCEC_V2

## Alcance analizado

Se compararon cuatro fuentes del proyecto entregado:

- frontend React (`src`)
- backend PHP (`backend`)
- suite Playwright (`tests`)
- esquema/datos SQL (`lalcec_v2 (9).sql`)

El objetivo fue localizar flujos funcionales, validaciones e integridades de datos existentes en el sistema que no tuvieran una regresión explícita y reforzar la suite sin duplicar casos que ya estaban bien cubiertos.

## Estado de la suite

- Antes: **19 specs / 129 tests declarados**.
- Después: **20 specs / 135 tests declarados**.
- Archivos JavaScript de la suite comprobados con `node --check`: **33**.
- Errores de sintaxis JS detectados: **0**.
- `test.only`, `test.skip`, `test.fixme`, `describe.only`, `describe.skip`: **0**.
- Backend PHP comprobado con `php -l`: **46 archivos / 0 errores de sintaxis**.
- Acciones registradas por el backend administrativo: **71** en total (**64 funcionales + 7 de infraestructura E2E**).

> Importante: esto es cobertura funcional/contractual reforzada. No equivale a un porcentaje medido de line/branch coverage. Para afirmar “100% de líneas/ramas” hace falta ejecutar frontend y backend instrumentados (por ejemplo V8/Istanbul + Xdebug/PCOV) contra la suite completa.

## Archivos modificados

- `tests/00-cobertura-total.spec.js`
- `tests/06-api-contratos.spec.js`
- `tests/10-contabilidad.spec.js`
- `tests/18-saldos-favor.spec.js`
- `tests/19-cobertura-complementaria.spec.js` (nuevo)

## Refuerzos realizados

### Contrato global de cobertura

El test `00-cobertura-total.spec.js` ya no da por cubierta una acción o una ruta únicamente porque su nombre exista como texto suelto. Ahora exige una referencia vinculada a una ejecución de API, una matriz de contrato recorrida, una intercepción/request UI, navegación real o una aserción de URL. También se elevó el piso de la suite a **135 tests** y se incluyeron marcadores de las regresiones nuevas.

### Categorías

Se agregó un ciclo API completo:

1. alta de categoría;
2. consulta de historial de precios;
3. baja;
4. verificación en listado de inactivas;
5. reactivación;
6. rechazo de baja con ID inexistente;
7. comprobación de auditoría de crear / dar de baja / reactivar.

### Descuentos familiares

Se agregaron validaciones explícitas para:

- rango inválido de integrantes (`RANGO_INTEGRANTES_INVALIDO`);
- vigencia con fecha final anterior a la inicial (`VIGENCIA_DESCUENTO_INVALIDA`);
- baja de una regla;
- aparición en historial;
- doble baja (`ESTADO_SIN_CAMBIOS`);
- imposibilidad de editar una regla histórica (`DESCUENTO_FAMILIAR_HISTORICO`);
- auditoría de alta y baja.

### Cuotas / condonaciones

Se agregó un flujo API completo para:

- rechazar una fecha futura de condonación;
- condonar una cuota correctamente;
- comprobar monto `0` y estado `CONDONADO`;
- comprobar aparición en el filtro de condonados;
- impedir condonar dos veces el mismo período (`PAGO_YA_REGISTRADO`);
- revertir la condonación;
- comprobar que el socio vuelve a aparecer como deudor.

### Saldos a favor

Se reforzaron guardas de consistencia:

- no permitir usar saldo sin declarar el monto de saldo que el operador vio al confirmar (`SALDO_FAVOR_APLICACION_ESPERADA_REQUERIDA`);
- no permitir aplicar saldo por encima de la deuda (`SALDO_FAVOR_APLICACION_INVALIDA`);
- no permitir volver a eliminar un saldo que ya quedó en cero (`SALDO_FAVOR_NO_EXISTE`);
- se mantienen las pruebas existentes de concurrencia, sobrantes, consumo parcial/total y persistencia.

### Familias

Se agregó una regresión explícita para impedir dar de baja una familia con una fecha anterior a la incorporación de sus integrantes (`FECHA_INVALIDA`). Esto alinea la API con la integridad temporal de `familias_socios`.

### Contabilidad

Se agregó cobertura para:

- opción duplicada (`OPCION_DUPLICADA`);
- estado inválido de opción (`ESTADO_OPCION_INVALIDO`);
- baja y reactivación correctas de una opción;
- uso cruzado de una opción de tipo incorrecto al guardar un ingreso (`OPCION_CONTABLE_INVALIDA`).

### Regresión visual de Cuotas

Se agregó una prueba a 1440×900 con sidebar expandido que comprueba:

- que pestañas, buscador y filtros no se superpongan;
- que el gap entre pestañas, buscador, mes y medio de pago permanezca aproximadamente en el valor del diseño;
- alineación vertical de los filtros;
- floating label del buscador dentro de su contenedor;
- layout específico de “Saldos a favor” sin filtros que no corresponden;
- modal “Agregar saldo” con placeholders y textos auxiliares esperados.

## Integridad SQL cubierta

La revisión del SQL se cruzó con la suite. Los casos reforzados están alineados con restricciones relevantes de datos, entre ellas:

- unicidad de cuota por socio/año/mes;
- monto cero para condonaciones;
- rangos y vigencias válidas en descuentos familiares;
- vínculos familiares con fechas coherentes;
- unicidad de opciones contables por tipo/nombre;
- trazabilidad e idempotencia de saldos a favor.

## Qué ya estaba bien cubierto y se conservó

La suite existente ya tenía buena cobertura de login/autenticación, dashboard, socios persona/empresa, familias, usuarios, permisos de solo lectura, configuración, categorías/descuentos UI, pagos y concurrencia, precios históricos, descuentos familiares, contabilidad UI/API, exportaciones, eliminación definitiva/trazabilidad de socios, Panel Bot y saldos a favor. Los cambios se concentraron en huecos y contratos débiles, no en duplicar esos escenarios.

## Validación que falta ejecutar en el proyecto real

El ZIP de tests entregado no incluye `package.json`, instalación de `@playwright/test`, `playwright.config` ni los servidores frontend/backend en ejecución. Por eso aquí se pudo validar sintaxis y estructura, pero **no ejecutar la corrida E2E real**.

Desde el `frontend` real del proyecto, ejecutar primero los cambios:

```powershell
npx playwright test tests/00-cobertura-total.spec.js tests/06-api-contratos.spec.js tests/10-contabilidad.spec.js tests/18-saldos-favor.spec.js tests/19-cobertura-complementaria.spec.js --project=chromium --workers=1 --reporter=list
```

Luego toda la suite:

```powershell
npx playwright test --project=chromium --workers=1 --reporter=list
```

Si esa corrida queda verde, el siguiente paso para hablar de cobertura “100%” en sentido técnico sería instrumentar line/branch coverage y atacar únicamente las ramas que el reporte marque como no ejecutadas.

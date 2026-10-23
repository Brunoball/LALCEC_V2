const { test, expect } = require('./fixtures/auth.fixture');
const fs = require('node:fs');
const path = require('node:path');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { uniqueSuffix, todayIso } = require('./helpers/data.helper');
const { createMedicine, createBorrower, entryFixture, stockOf, movementsOf } = require('./helpers/medicamentos.helper');

const frontend = process.cwd();
const backend = path.resolve(frontend, '..', 'backend');
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

// Las alertas de vencimiento son flotantes y pueden tapar las acciones del stock.
// Se cierran desde su encabezado como lo haría un usuario, sin forzar el clic.
async function ocultarAlertas(page) {
  const alertas = page.locator('aside.med-alertas--abiertas');
  const ocultar = alertas.getByRole('button', { name: 'Ocultar alertas de vencimiento', exact: true });
  try {
    await ocultar.first().waitFor({ state: 'visible', timeout: 4000 });
  } catch (_error) {
    return; // No se abrió el panel flotante en este escenario.
  }
  for (const boton of await ocultar.all()) {
    if (await boton.isVisible()) await boton.click();
  }
  await expect(alertas).toHaveCount(0);
}

// No crea medicamentos ni modifica la información de usuarios reales.
test.describe('Medicamentos: catálogos configurables', () => {
  test('contrato: catálogos disponibles, datos históricos y rutas vigentes', async ({ request }) => {
    // La migración SQL se ejecuta una sola vez; no tiene por qué permanecer en
    // LALCEC_V2/sql para que la instalación, ya migrada, pueda correr Playwright.
    const api = read(backend, 'modules/medicamentos/medicamentos_opciones.php');
    const gestion = read(backend, 'modules/medicamentos/medicamentos_gestion.php');
    const routes = read(backend, 'modules/medicamentos/routes.php');
    expect(api).toContain('OPTION_IN_USE');
    expect(api).toContain('medicamentos_opciones');
    expect(gestion).toContain("MedicamentosOpciones::validar($db,'PRESENTACION'");
    expect(gestion).toContain("MedicamentosOpciones::validar($db,'UNIDAD_STOCK'");
    for (const action of ['medicamentos_opciones', 'medicamentos_opcion_guardar', 'medicamentos_opcion_estado', 'medicamentos_opcion_eliminar']) {
      expect(routes).toContain(action);
    }

    // Validación real de la base instalada: la tabla es consultable por API
    // y las opciones históricas de cada medicamento siguen disponibles.
    const optionsResponse = await apiCall(request, 'medicamentos_opciones');
    const items = optionsResponse.registros;
    expect(Array.isArray(items)).toBe(true);
    for (const option of items) {
      expect(['PRESENTACION', 'UNIDAD_STOCK', 'ORIGEN_INGRESO', 'SALIDA_STOCK']).toContain(option.tipo);
      expect(String(option.nombre).trim()).not.toBe('');
      expect([0, 1]).toContain(Number(option.activo));
    }
    // También se exige la ruta de medios de pago usada por compras/ventas;
    // evita que el contrato global marque el endpoint como no ejercitado.
    const medios = await apiCall(request, 'medicamentos_medios');
    expect(Array.isArray(medios.registros)).toBe(true);
    for (const medio of medios.registros) {
      expect(Number(medio.id_medio_pago)).toBeGreaterThan(0);
      expect(String(medio.nombre).trim()).not.toBe('');
    }
    const medicines = (await apiCall(request, 'medicamentos_catalogo')).registros || [];
    for (const medicine of medicines) {
      for (const [tipo, campo] of [['PRESENTACION', 'presentacion'], ['UNIDAD_STOCK', 'unidad_stock']]) {
        const name = String(medicine[campo] || '').trim().toLocaleUpperCase('es-AR');
        if (!name) continue;
        expect(items.some(option => option.tipo === tipo &&
          String(option.nombre).trim().toLocaleUpperCase('es-AR') === name),
        `Falta la opción histórica ${tipo}: ${name}`).toBe(true);
      }
    }

    // Solo si el desarrollador conserva el script original en /sql, también
    // verificamos el contrato DDL. Su ausencia no invalida la base migrada.
    const migration = path.resolve(frontend, '..', 'sql', '2026-10-20_medicamentos_opciones.sql');
    if (fs.existsSync(migration)) {
      const sql = fs.readFileSync(migration, 'utf8');
      expect((sql.match(/CREATE TABLE/gi) || []).length).toBe(1);
      expect(sql).toContain('INSERT IGNORE INTO `medicamentos_opciones`');
      expect(sql).toContain('FROM `medicamentos`');
      expect(sql).toContain('UNIQUE KEY `uq_med_opciones_tipo_nombre`');
    }
  });

  test('API: alta, edición, baja, reactivación, duplicados y eliminación en los cuatro selectores', async ({ request }) => {
    for (const tipo of ['PRESENTACION', 'UNIDAD_STOCK', 'ORIGEN_INGRESO', 'SALIDA_STOCK']) {
      const name = `PW E2E OPCION ${uniqueSuffix()}`;
      const changed = `PW E2E EDITADA ${uniqueSuffix()}`;
      let id = null;
      try {
        const created = await apiCall(request, 'medicamentos_opcion_guardar', {
          method: 'POST', data: { tipo, nombre: name },
        });
        id = Number(created.id_opcion);
        expect(id).toBeGreaterThan(0);
        const listed = await apiCall(request, 'medicamentos_opciones');
        expect(listed.registros.some(x => Number(x.id_opcion) === id && x.nombre === name && x.tipo === tipo)).toBe(true);
        const duplicate = await apiResult(request, 'medicamentos_opcion_guardar', {
          method: 'POST', data: { tipo, nombre: name },
        });
        expect(duplicate.ok).toBe(false);
        await apiCall(request, 'medicamentos_opcion_guardar', {
          method: 'POST', data: { id_opcion: id, tipo, nombre: changed },
        });
        await apiCall(request, 'medicamentos_opcion_estado', {
          method: 'POST', data: { id_opcion: id, activo: 0 },
        });
        let options = (await apiCall(request, 'medicamentos_opciones')).registros;
        expect(Number(options.find(x => Number(x.id_opcion) === id)?.activo)).toBe(0);
        await apiCall(request, 'medicamentos_opcion_estado', {
          method: 'POST', data: { id_opcion: id, activo: 1 },
        });
        options = (await apiCall(request, 'medicamentos_opciones')).registros;
        expect(Number(options.find(x => Number(x.id_opcion) === id)?.activo)).toBe(1);
      } finally {
        if (id !== null) await apiCall(request, 'medicamentos_opcion_eliminar', {
          method: 'POST', data: { id_opcion: id },
        });
      }
    }
  });

  test('API: los orígenes del sistema vienen de la base con su código y están disponibles', async ({ request }) => {
    const origenes = (await apiCall(request, 'medicamentos_opciones')).registros.filter(o => o.tipo === 'ORIGEN_INGRESO');
    const sistema = Object.fromEntries(origenes.filter(o => o.codigo_sistema).map(o => [o.codigo_sistema, o]));
    for (const codigo of ['DONACION', 'COMPRA', 'AJUSTE', 'INICIAL']) {
      expect(sistema[codigo], `Falta el origen del sistema ${codigo}: ejecutar 2026-10-22_medicamentos_origenes_sistema.sql`).toBeTruthy();
      expect(String(sistema[codigo].nombre).trim()).not.toBe('');
    }
  });

  test('API: un origen del catálogo registra un ingreso sin costo y queda protegido mientras se usa', async ({ request }) => {
    const origen = `PW E2E ORIGEN ${uniqueSuffix()}`;
    const creado = await apiCall(request, 'medicamentos_opcion_guardar', { method: 'POST', data: { tipo: 'ORIGEN_INGRESO', nombre: origen } });
    const idOrigen = Number(creado.id_opcion);
    try {
      const fx = await createMedicine(request, { first: entryFixture({ cantidad: 2 }) });
      const ingreso = await apiCall(request, 'medicamentos_ingresar', {
        method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ origen, cantidad: 3 }) },
      });
      const mov = (await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(ingreso.id_movimiento));
      expect(mov).toMatchObject({ tipo: 'INGRESO_OTRO', origen });
      expect(mov.id_egreso_contable).toBeNull();
      expect(mov.id_ingreso_contable).toBeNull();
      expect(mov.motivo_no_anulable).toMatch(/no admite anulación/i);
      const row = await stockOf(request, fx.id);
      expect(Number(row.stock_actual)).toBe(5);
      expect(row.ultimo_origen).toBe(origen);

      const listado = (await apiCall(request, 'medicamentos_opciones')).registros;
      expect(Number(listado.find(o => Number(o.id_opcion) === idOrigen).cantidad_usos)).toBe(1);
      const enUso = await apiResult(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: idOrigen } });
      expect(enUso.status).toBe(409);
      expect(enUso.body.codigo).toBe('OPTION_IN_USE');
      const renombre = await apiResult(request, 'medicamentos_opcion_guardar', { method: 'POST', data: { id_opcion: idOrigen, tipo: 'ORIGEN_INGRESO', nombre: `${origen} X` } });
      expect(renombre.body.codigo).toBe('OPTION_IN_USE');

      await apiCall(request, 'medicamentos_opcion_estado', { method: 'POST', data: { id_opcion: idOrigen, activo: 0 } });
      const inactivo = await apiResult(request, 'medicamentos_ingresar', {
        method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ origen, cantidad: 1 }) },
      });
      expect(inactivo.status).toBe(422);
      expect(inactivo.body.codigo).toBe('OPTION_INACTIVE');
      const inexistente = await apiResult(request, 'medicamentos_ingresar', {
        method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ origen: `PW E2E NO EXISTE ${uniqueSuffix()}`, cantidad: 1 }) },
      });
      expect(inexistente.status).toBe(422);
      expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(5);
    } finally {
      // En uso no puede eliminarse: la limpieza E2E final la borra cuando ya no la usa ningún movimiento.
      await apiResult(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: idOrigen } });
    }
  });

  test('API: el buscador de donante/proveedor ofrece solo socios activos', async ({ request }) => {
    const socio = await createBorrower(request);
    const buscar = async () => (await apiCall(request, 'medicamentos_procedencias', { params: { buscar: socio.person.dni } })).registros || [];
    expect((await buscar()).some(x => x.clave === `SOCIO:${socio.id}`)).toBe(true);
    await apiCall(request, 'socios_eliminar', {
      method: 'POST', data: { id: socio.id, fecha_baja: todayIso(), motivo_baja: 'PW E2E SOCIO INACTIVO PARA PROCEDENCIAS' },
    });
    const despues = await buscar();
    expect(despues.some(x => x.clave === `SOCIO:${socio.id}`)).toBe(false);
    expect(despues.every(x => !String(x.detalle || '').includes('INACTIVO'))).toBe(true);
  });

  test('UI: opción AGREGAR abre modal pequeño y agrega al selector sin cerrar el medicamento', async ({ page, request }) => {
    await page.goto('/medicamentos/stock');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    await expect(editor).toBeVisible();
    const presentacion = editor.getByLabel(/Presentación/);
    await expect(presentacion.locator('option').first()).toHaveText(/AGREGAR OPCIÓN/);
    await presentacion.selectOption('__MED_AGREGAR__');
    const modal = page.getByRole('dialog', { name: 'Agregar presentación' });
    await expect(modal).toBeVisible();
    const name = `PW E2E RAPIDA ${uniqueSuffix()}`;
    let id = null;
    try {
      await modal.getByRole('textbox', { name: /Nombre de la opción/ }).fill(name);
      await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(editor).toBeVisible();
      await expect(presentacion).toHaveValue(name);
      const listed = await apiCall(request, 'medicamentos_opciones');
      id = Number(listed.registros.find(item => item.nombre === name && item.tipo === 'PRESENTACION')?.id_opcion);
      expect(id).toBeGreaterThan(0);
    } finally {
      await editor.getByRole('button', { name: 'Cerrar' }).click();
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', {
        method: 'POST', data: { id_opcion: id },
      });
    }
  });
  test('UI: alta rápida de unidad de stock conserva abierto el formulario', async ({ page, request }) => {
    await page.goto('/medicamentos');
    await expect(page).toHaveURL(/\/medicamentos\/stock(?:[?#]|$)/);
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    const unidad = editor.getByLabel(/Unidad de stock/);
    await expect(unidad.locator('option').first()).toHaveText(/AGREGAR OPCIÓN/);
    await unidad.selectOption('__MED_AGREGAR__');
    const modal = page.getByRole('dialog', { name: 'Agregar unidad de stock' });
    await expect(modal).toBeVisible();
    const name = `PW E2E US RAP ${uniqueSuffix()}`;
    let id = null;
    try {
      await modal.getByRole('textbox', { name: /Nombre de la opción/ }).fill(name);
      await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(editor).toBeVisible();
      await expect(unidad).toHaveValue(name);
      const listed = await apiCall(request, 'medicamentos_opciones');
      id = Number(listed.registros.find(option => option.tipo === 'UNIDAD_STOCK' && option.nombre === name)?.id_opcion);
      expect(id).toBeGreaterThan(0);
    } finally {
      // El modal de alta rápida se superpone al editor: si falló el guardado,
      // se cierra primero para no ocultar la causa real tras un timeout.
      if (await modal.isVisible()) {
        await modal.getByRole('button', { name: 'Cancelar' }).click();
      }
      if (await editor.isVisible()) {
        await editor.getByRole('button', { name: 'Cerrar' }).click();
      }
      // Limpieza segura incluso si la aserción falló antes de obtener el ID.
      if (!id) {
        const listado = (await apiCall(request, 'medicamentos_opciones')).registros || [];
        id = Number(listado.find(option => option.tipo === 'UNIDAD_STOCK' && option.nombre === name)?.id_opcion);
      }
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', {
        method: 'POST', data: { id_opcion: id },
      });
    }
  });

  test('UI: el selector Origen permite agregar un origen sin cerrar el medicamento', async ({ page, request }) => {
    await page.goto('/medicamentos/stock');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    await editor.getByLabel('Stock inicial (opcional)').fill('2');
    const origenSelect = editor.getByLabel(/^Origen/);
    await expect(origenSelect.locator('option').first()).toHaveText(/AGREGAR OPCIÓN/);
    await origenSelect.selectOption('__MED_AGREGAR__');
    const modal = page.getByRole('dialog', { name: 'Agregar origen de ingreso' });
    await expect(modal).toBeVisible();
    const name = `PW E2E ORIGEN RAP ${uniqueSuffix()}`;
    let id = null;
    try {
      await modal.getByRole('textbox', { name: /Nombre de la opción/ }).fill(name);
      await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(editor).toBeVisible();
      await expect(origenSelect).toHaveValue(name);
      const listed = await apiCall(request, 'medicamentos_opciones');
      id = Number(listed.registros.find(item => item.nombre === name && item.tipo === 'ORIGEN_INGRESO')?.id_opcion);
      expect(id).toBeGreaterThan(0);
    } finally {
      if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancelar' }).click();
      if (await editor.isVisible()) await editor.getByRole('button', { name: 'Cerrar' }).click();
      if (!id) {
        const listado = (await apiCall(request, 'medicamentos_opciones')).registros || [];
        id = Number(listado.find(option => option.tipo === 'ORIGEN_INGRESO' && option.nombre === name)?.id_opcion);
      }
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: id } });
    }
  });

  test('UI: Configuración muestra la pestaña Orígenes de ingreso y permite crear uno', async ({ page, request }) => {
    await page.goto('/configuracion/medicamentos');
    const tabs = page.getByRole('tablist', { name: 'Selectores de medicamentos' });
    await tabs.getByRole('tab', { name: 'Orígenes de ingreso' }).click();
    await expect(tabs.getByRole('tab', { name: 'Orígenes de ingreso' })).toHaveAttribute('aria-selected', 'true');
    // El texto explicativo sobre los orígenes se quitó de Configuración.
    // Validar la tabla real, sin depender de contenido informativo eliminado.
    await expect(page.locator('.med-config__table .med-config__head')).toContainText('Acciones');
    await expect(page.getByText(/Opciones del selector Origen \/ Motivo del ingreso/i)).toHaveCount(0);
    const name = `PW E2E CFG O ${uniqueSuffix()}`;
    let id = null;
    try {
      await page.getByRole('button', { name: 'Nuevo origen de ingreso' }).click();
      const modal = page.getByRole('dialog', { name: 'Nuevo origen de ingreso' });
      await modal.getByRole('textbox', { name: 'Nombre *' }).fill(name);
      await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(page.getByRole('button', { name: `Editar ${name}` })).toBeVisible();
      const listed = await apiCall(request, 'medicamentos_opciones');
      id = Number(listed.registros.find(o => o.tipo === 'ORIGEN_INGRESO' && o.nombre === name)?.id_opcion);
      expect(id).toBeGreaterThan(0);
    } finally {
      if (!id) {
        const listado = (await apiCall(request, 'medicamentos_opciones')).registros || [];
        id = Number(listado.find(o => o.tipo === 'ORIGEN_INGRESO' && o.nombre === name)?.id_opcion);
      }
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: id } });
    }
  });

  test('UI: Configuración de medicamentos permite administrar ambas pestañas', async ({ page, request }) => {
    await page.goto('/configuracion/medicamentos');
    const tabs = page.getByRole('tablist', { name: 'Selectores de medicamentos' });
    await expect(tabs.getByRole('tab', { name: 'Presentaciones' })).toBeVisible();
    await tabs.getByRole('tab', { name: 'Unidades de stock' }).click();
    await expect(tabs.getByRole('tab', { name: 'Unidades de stock' })).toHaveAttribute('aria-selected', 'true');
    const name = `PW E2E CFG U ${uniqueSuffix()}`;
    const edited = `PW E2E CFG E ${uniqueSuffix()}`;
    let id = null;
    try {
      await page.getByRole('button', { name: 'Nueva unidad de stock' }).click();
      let modal = page.getByRole('dialog', { name: 'Nueva unidad de stock' });
      await modal.getByRole('textbox', { name: 'Nombre *' }).fill(name);
      await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      const initial = await apiCall(request, 'medicamentos_opciones');
      id = Number(initial.registros.find(option => option.tipo === 'UNIDAD_STOCK' && option.nombre === name)?.id_opcion);
      expect(id).toBeGreaterThan(0);

      await page.getByRole('button', { name: `Editar ${name}` }).click();
      modal = page.getByRole('dialog', { name: 'Editar unidad de stock' });
      await modal.getByRole('textbox', { name: 'Nombre *' }).fill(edited);
      await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(page.getByRole('button', { name: `Dar de baja ${edited}` })).toBeVisible();
      await page.getByRole('button', { name: `Dar de baja ${edited}` }).click();
      let state = page.getByRole('dialog', { name: 'Dar de baja opción' });
      await state.getByRole('button', { name: 'Dar de baja', exact: true }).click();
      await expect(state).not.toBeVisible();
      await expect(page.getByRole('button', { name: `Reactivar ${edited}` })).toBeVisible();
      await page.getByRole('button', { name: `Reactivar ${edited}` }).click();
      state = page.getByRole('dialog', { name: 'Reactivar opción' });
      await state.getByRole('button', { name: 'Dar de alta', exact: true }).click();
      await expect(state).not.toBeVisible();
      const updated = await apiCall(request, 'medicamentos_opciones');
      const option = updated.registros.find(item => Number(item.id_opcion) === id);
      expect(option).toMatchObject({ tipo: 'UNIDAD_STOCK', nombre: edited });
      expect(Number(option.activo)).toBe(1);
    } finally {
      // Ante un fallo tras guardar, recuperar el ID por el nombre único E2E.
      if (!id) {
        const listado = (await apiCall(request, 'medicamentos_opciones')).registros || [];
        id = Number(listado.find(option => option.tipo === 'UNIDAD_STOCK' && [name, edited].includes(option.nombre))?.id_opcion);
      }
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', {
        method: 'POST', data: { id_opcion: id },
      });
    }
  });

  test('contrato: motivos del sistema mantienen código estable y migración SQL disponible', async ({ request }) => {
    const opciones = (await apiCall(request, 'medicamentos_opciones')).registros || [];
    const salidas = opciones.filter(o => o.tipo === 'SALIDA_STOCK' && o.codigo_sistema);
    for (const codigo of ['ENTREGA_DONACION', 'SALIDA_VENTA', 'AJUSTE_SALIDA', 'BAJA_DESCARTE']) {
      const opcion = salidas.find(o => o.codigo_sistema === codigo);
      expect(opcion, `Falta el motivo ${codigo}: aplicar sql/2026-10-23_medicamentos_motivos_salida.sql`).toBeTruthy();
      expect(String(opcion.nombre)).not.toBe('');
    }
    const script = path.resolve(frontend, '..', 'sql', '2026-10-23_medicamentos_motivos_salida.sql');
    if (fs.existsSync(script)) {
      const sql = fs.readFileSync(script, 'utf8');
      expect(sql).toContain('SALIDA_STOCK');
      expect(sql).toContain('chk_med_opciones_tipo');
    }
  });

  test('API: motivo de salida propio resta stock sin asiento y respeta baja y trazabilidad', async ({ request }) => {
    const motivo = `PW E2E ROTURA ${uniqueSuffix()}`;
    const creado = await apiCall(request, 'medicamentos_opcion_guardar', {
      method: 'POST', data: { tipo: 'SALIDA_STOCK', nombre: motivo },
    });
    const id = Number(creado.id_opcion);
    try {
      const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
      const salida = await apiCall(request, 'medicamentos_salida', {
        method: 'POST', data: { id_medicamento: fx.id, tipo: motivo, cantidad: 2, detalle: 'PW E2E DESCARGA CON MOTIVO' },
      });
      const registrado = (await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(salida.id_movimiento));
      expect(registrado).toMatchObject({ tipo: 'AJUSTE_SALIDA', origen: motivo });
      expect(registrado.id_ingreso_contable).toBeNull();
      expect(registrado.id_egreso_contable).toBeNull();
      expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(3);
      const opciones = (await apiCall(request, 'medicamentos_opciones')).registros;
      expect(Number(opciones.find(o => Number(o.id_opcion) === id).cantidad_usos)).toBeGreaterThan(0);
      const renombrar = await apiResult(request, 'medicamentos_opcion_guardar', {
        method: 'POST', data: { id_opcion: id, tipo: 'SALIDA_STOCK', nombre: motivo + ' NUEVO' },
      });
      expect(renombrar.status).toBe(409);
      await apiCall(request, 'medicamentos_opcion_estado', { method: 'POST', data: { id_opcion: id, activo: 0 } });
      const inactivo = await apiResult(request, 'medicamentos_salida', {
        method: 'POST', data: { id_medicamento: fx.id, tipo: motivo, cantidad: 1 },
      });
      expect(inactivo.status).toBe(422);
      expect(inactivo.body.codigo).toBe('OPTION_INACTIVE');
      expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(3);
      const eliminar = await apiResult(request, 'medicamentos_opcion_eliminar', {
        method: 'POST', data: { id_opcion: id },
      });
      expect(eliminar.status).toBe(409);
      expect(eliminar.body.codigo).toBe('OPTION_IN_USE');
    } finally {
      // El catálogo está vinculado a un movimiento E2E. El guard de limpieza
      // elimina los datos propios al terminar los tests, sin borrar datos reales.
      await apiResult(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: id } });
    }
  });

  test('UI: motivo de salida permite alta rápida y Configuración tiene su pestaña', async ({ page, request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const name = `PW E2E SALIDA RAPIDA ${uniqueSuffix()}`;
    let id = null;
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
    const registro = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row')
      .filter({ hasText: fx.medicine.nombre_comercial });
    await expect(registro).toBeVisible();
    await ocultarAlertas(page);
    await registro.getByRole('button', { name: 'Editar' }).click();
    const editor = page.getByRole('dialog', { name: new RegExp('Editar medicamento') });
    try {
      await editor.getByRole('tab', { name: 'Stock' }).click();
      await editor.getByRole('button', { name: 'Restar stock' }).click();
      const motivos = editor.getByLabel('Motivo de salida *');
      await expect(motivos.locator('option').first()).toHaveText(/AGREGAR OPCIÓN/);
      await motivos.selectOption('__MED_AGREGAR__');
      const modal = page.getByRole('dialog', { name: 'Agregar motivo de salida' });
      await expect(modal).toBeVisible();
      // Escape cierra el alta rápida, nunca el editor que quedó detrás.
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
      await expect(editor).toBeVisible();
      await motivos.selectOption('__MED_AGREGAR__');
      await modal.getByRole('textbox', { name: /Nombre de la opción/ }).fill(name.toLowerCase());
      await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(motivos).toHaveValue(name);
      const opciones = (await apiCall(request, 'medicamentos_opciones')).registros || [];
      id = Number(opciones.find(o => o.tipo === 'SALIDA_STOCK' && o.nombre === name)?.id_opcion);
      expect(id).toBeGreaterThan(0);
    } finally {
      const modal = page.getByRole('dialog', { name: 'Agregar motivo de salida' });
      if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancelar' }).click();
      if (await editor.isVisible()) await editor.getByRole('button', { name: 'Cerrar' }).click();
      if (!id) {
        const opciones = (await apiCall(request, 'medicamentos_opciones')).registros || [];
        id = Number(opciones.find(o => o.tipo === 'SALIDA_STOCK' && o.nombre === name)?.id_opcion);
      }
      if (id) await apiCall(request, 'medicamentos_opcion_eliminar', { method: 'POST', data: { id_opcion: id } });
    }
    await page.goto('/configuracion/medicamentos');
    const tab = page.getByRole('tab', { name: 'Motivos de salida' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Nuevo motivo de salida' })).toBeVisible();
  });

});

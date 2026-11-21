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

  test('API: alta, edición, baja, reactivación y eliminación en los tres selectores configurables', async ({ request }) => {
    for (const tipo of ['PRESENTACION', 'ORIGEN_INGRESO', 'SALIDA_STOCK']) {
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

  test('UI: cada sección de Banco de Drogas tiene su propia ruta y presentaciones', async ({ page }) => {
    await page.goto('/medicamentos/stock');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    let editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    let presentacion = editor.getByLabel('Presentación *');
    const opciones = async () => presentacion.locator('option').evaluateAll(xs => xs.map(x => x.value));
    expect(await opciones()).toEqual(['COMPRIMIDOS','INYECTABLES','GOTAS','CREMAS','OTRAS/OS']);
    await expect(presentacion).toHaveValue('COMPRIMIDOS');
    await expect(editor.getByLabel('Unidad de dosis')).toHaveValue('MG');
    await expect(editor.getByLabel(/Sector de Banco de Drogas/)).toHaveCount(0);
    await page.goto('/medicamentos/dolor/stock');
    await page.getByRole('button', { name: 'Nuevo tratamiento' }).click();
    editor = page.getByRole('dialog', { name: 'Nuevo tratamiento' });
    presentacion = editor.getByLabel('Presentación *');
    expect(await opciones()).toEqual(['JARABE','CONCENTRADO','DOBLE CONCENTRADO','AMITRIPTILINA']);
    await expect(presentacion).toHaveValue('JARABE');
    await expect(editor.getByLabel('Unidad de dosis')).toHaveValue('');
    await expect(editor.getByLabel(/Sector de Banco de Drogas/)).toHaveCount(0);
    await expect(presentacion.locator('option[value="__MED_AGREGAR__"]')).toHaveCount(0);
  });
  test('UI: unidad de stock muestra únicamente Blíster, Ampolla y Caja, sin alta rápida', async ({ page }) => {
    await page.goto('/medicamentos/stock');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    const unidad = editor.getByLabel(/Unidad de stock/);
    await expect(unidad).toHaveValue('CAJA');
    await expect(unidad.locator('option')).toHaveCount(3);
    const valores = await unidad.locator('option').evaluateAll(elements => elements.map(el => el.value));
    expect(valores).toEqual(['BLÍSTER', 'AMPOLLA', 'CAJA']);
    await expect(unidad.locator('option[value="UNIDAD"]')).toHaveCount(0);
    await expect(unidad.locator('option[value="FRASCO"]')).toHaveCount(0);
    await expect(unidad.locator('option[value="__MED_AGREGAR__"]')).toHaveCount(0);
  });

  test('API: unidades fijas, valores antiguos preservados y nuevas opciones rechazadas', async ({ request }) => {
    const opciones = (await apiCall(request, 'medicamentos_opciones')).registros.filter(item => item.tipo === 'UNIDAD_STOCK');
    for (const permitida of ['AMPOLLA','BLÍSTER','CAJA']) {
      const opcion = opciones.find(item => item.nombre === permitida);
      expect(opcion).toBeTruthy();
      expect(Number(opcion.activo)).toBe(1);
    }
    // UNIDAD/FRASCO pueden seguir ACTIVOS en el catálogo compartido.
    // El selector del formulario y el guardián de NUEVAS altas los bloquean.
    const nombre = `PW E2E UNIDAD PROHIBIDA ${uniqueSuffix()}`;
    const result = await apiResult(request, 'medicamentos_opcion_guardar', {
      method: 'POST', data: { tipo: 'UNIDAD_STOCK', nombre },
    });
    expect(result.ok).toBe(false);
    expect(result.body.codigo).toBe('OPTION_FIXED');
    const validacion = await apiResult(request, 'medicamentos_guardar', {
      method: 'POST', data: {
        nombre_comercial: `PW E2E MED ${uniqueSuffix()}`, droga: 'PW E2E DROGA',
        presentacion: 'COMPRIMIDOS', dosis: '500', unidad_dosis: 'MG',
        unidad_stock: 'FRASCO', fecha_vencimiento: '', cadena_frio: 0,
      },
    });
    expect(validacion.ok).toBe(false);
    expect(validacion.body.codigo).toBe('OPTION_FIXED');
  });

  test('UI: donante o proveedor, ambos manuales y sin consultar socios', async ({ page }) => {
    await page.goto('/medicamentos/stock');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const editor = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    await editor.getByLabel('Stock inicial (opcional)').fill('2');
    const origen = editor.getByLabel('Origen *');
    // El catálogo compartido puede llegar ordenado por nombre (COMPRA antes de DONACIÓN).
    // Lo importante es que aparezcan exactamente estas dos alternativas, no su orden.
    await expect(origen.locator('option')).toHaveCount(2);
    expect((await origen.locator('option').evaluateAll(xs => xs.map(x => x.value))).sort()).toEqual(['COMPRA', 'DONACION']);
    await expect(origen).toHaveValue('DONACION');
    await expect(editor.getByLabel('Nombre y apellido del donante (manual)')).toBeVisible();
    await expect(editor.getByLabel('Medio de pago')).toHaveCount(0);
    await origen.selectOption('COMPRA');
    await expect(editor.getByLabel('Datos del proveedor (manual)')).toBeVisible();
    await expect(editor.getByLabel('Costo unitario ($)')).toBeVisible();
    await expect(editor.getByLabel('Medio de pago *')).toBeVisible();
    await expect(origen.locator('option[value="__MED_AGREGAR__"]')).toHaveCount(0);
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

  test('UI: Configuración de unidades queda de solo lectura por ser una lista fija', async ({ page }) => {
    await page.goto('/configuracion/medicamentos');
    const tabs = page.getByRole('tablist', { name: 'Selectores de medicamentos' });
    await expect(tabs.getByRole('tab', { name: 'Presentaciones' })).toBeVisible();
    await tabs.getByRole('tab', { name: 'Unidades de stock' }).click();
    await expect(tabs.getByRole('tab', { name: 'Unidades de stock' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Nueva unidad de stock' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Editar (BLÍSTER|AMPOLLA|CAJA)/ })).toHaveCount(0);
    // El aviso explica el alcance del selector sin alterar las opciones históricas.
    await expect(page.getByText(/En Banco de Drogas se puede elegir solo Blíster, Ampolla y Caja/)).toBeVisible();
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

  test('UI: medicamento vigente ofrece Entrega sin cargo y Ajuste por error de carga (el descarte exige vencido), sin modificar Configuración', async ({ page, request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
    const registro = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row')
      .filter({ hasText: fx.medicine.nombre_comercial });
    await ocultarAlertas(page);
    await registro.getByRole('button', { name: 'Editar' }).click();
    const editor = page.getByRole('dialog', { name: /Editar medicamento/ });
    await editor.getByRole('tab', { name: 'Stock' }).click();
    await editor.getByRole('button', { name: 'Restar stock' }).click();
    const motivo = editor.getByLabel('Motivo de salida *');
    // Vigente: entrega y ajuste; el orden viene del catálogo compartido.
    await expect(motivo.locator('option')).toHaveCount(2);
    expect((await motivo.locator('option').evaluateAll(xs => xs.map(x => x.value))).sort()).toEqual(['AJUSTE_SALIDA', 'ENTREGA_DONACION']);
    await expect(motivo.locator('option[value="ENTREGA_DONACION"]')).toHaveText('ENTREGA SIN CARGO');
    await expect(motivo.locator('option[value="AJUSTE_SALIDA"]')).toHaveText('AJUSTE POR ERROR DE CARGA');
    await expect(motivo.locator('option[value="BAJA_DESCARTE"]')).toHaveCount(0);
    await expect(motivo.locator('option[value="__MED_AGREGAR__"]')).toHaveCount(0);
    await page.goto('/configuracion/medicamentos');
    await page.getByRole('tab', { name: 'Motivos de salida' }).click();
    await expect(page.getByRole('button', { name: 'Nuevo motivo de salida' })).toBeVisible();
  });
});

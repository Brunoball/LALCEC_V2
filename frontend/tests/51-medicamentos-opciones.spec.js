const { test, expect } = require('./fixtures/auth.fixture');
const fs = require('node:fs');
const path = require('node:path');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { uniqueSuffix } = require('./helpers/data.helper');

const frontend = process.cwd();
const backend = path.resolve(frontend, '..', 'backend');
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

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
      expect(['PRESENTACION', 'UNIDAD_STOCK']).toContain(option.tipo);
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

  test('API: alta, edición, baja, reactivación, duplicados y eliminación en ambos selectores', async ({ request }) => {
    for (const tipo of ['PRESENTACION', 'UNIDAD_STOCK']) {
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

});

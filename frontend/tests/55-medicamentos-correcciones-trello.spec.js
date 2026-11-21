// Correcciones posteriores a la revisión de las tarjetas de Trello de Banco de Drogas:
// MG según presentación, donante/proveedor obligatorio, receptor en toda entrega,
// descarte solo vencido, ajuste por error de carga y presentaciones fijas.
const { test, expect } = require('./fixtures/auth.fixture');
const fs = require('node:fs');
const path = require('node:path');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { uniqueSuffix } = require('./helpers/data.helper');
const { futureIso, medFixture, entryFixture, medioPago, createMedicine, stockOf, movementsOf, assertError } = require('./helpers/medicamentos.helper');

const frontend = process.cwd();
const backend = path.resolve(frontend, '..', 'backend');

async function ocultarAlertas(page) {
  const ocultar = page.locator('aside.med-alertas--abiertas').getByRole('button', { name: 'Ocultar alertas de vencimiento', exact: true });
  try {
    await ocultar.first().waitFor({ state: 'visible', timeout: 4000 });
  } catch (_error) {
    return;
  }
  for (const boton of await ocultar.all()) {
    if (await boton.isVisible()) await boton.click();
  }
  await expect(page.locator('aside.med-alertas--abiertas')).toHaveCount(0);
}

async function abrirStock(page, fx) {
  await page.goto('/medicamentos/stock');
  await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
  await ocultarAlertas(page);
  const row = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row')
    .filter({ hasText: fx.medicine.nombre_comercial });
  await row.getByRole('button', { name: 'Editar' }).click();
  const modal = page.getByRole('dialog', { name: /Editar medicamento/ });
  await modal.getByRole('tab', { name: 'Stock' }).click();
  return modal;
}

test.describe('Banco de Drogas: correcciones de revisión Trello', () => {
  test('API: donante y proveedor son obligatorios en ingresos y en el stock inicial', async ({ request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 2 }) });
    const sinDonante = await assertError(request, 'medicamentos_ingresar',
      { id_medicamento: fx.id, ...entryFixture({ cantidad: 1, procedencia: '' }), fecha_vencimiento: futureIso(200) }, /donante/i);
    expect(sinDonante.body.codigo).toBe('PROCEDENCIA_REQUERIDA');
    const medio = await medioPago(request);
    const sinProveedor = await assertError(request, 'medicamentos_ingresar',
      { id_medicamento: fx.id, ...entryFixture({ origen: 'COMPRA', cantidad: 1, costo_unitario: '5.00', id_medio_pago: medio, procedencia: ' ' }),
        fecha_vencimiento: futureIso(200) }, /proveedor/i);
    expect(sinProveedor.body.codigo).toBe('PROCEDENCIA_REQUERIDA');
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(2);

    // Alta con stock inicial sin donante: se rechaza completa (no queda el medicamento a medias).
    const medicine = medFixture();
    await assertError(request, 'medicamentos_guardar', { ...medicine, ingreso_inicial: entryFixture({ cantidad: 1, procedencia: '' }) }, /donante/i);
    const catalogo = (await apiCall(request, 'medicamentos_catalogo')).registros || [];
    expect(catalogo.some(m => m.nombre_comercial === medicine.nombre_comercial)).toBe(false);
  });

  test('API: la entrega sin cargo de Medicamentos exige y guarda quién recibe', async ({ request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 4 }) });
    await assertError(request, 'medicamentos_salida', { id_medicamento: fx.id, tipo: 'ENTREGA_DONACION', cantidad: 1 }, /quien recibe/i);
    const receptor = `PW E2E RECIBE ${uniqueSuffix()}`;
    const entrega = await apiCall(request, 'medicamentos_salida', {
      method: 'POST', data: { id_medicamento: fx.id, tipo: 'ENTREGA_DONACION', cantidad: 1, receptor },
    });
    const mov = (await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(entrega.id_movimiento));
    expect(mov.procedencia).toBe(receptor);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(3);
    // Las entregas de Medicamentos no aparecen en Entregas de Tratamiento del dolor.
    const dolor = await apiCall(request, 'medicamentos_entregas', { params: { buscar: receptor } });
    expect((dolor.registros || []).some(r => Number(r.id_movimiento) === Number(entrega.id_movimiento))).toBe(false);
  });

  test('API: descarte por vencimiento solo con stock vencido; el ajuste exige motivo', async ({ request }) => {
    const vigente = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const descarte = await assertError(request, 'medicamentos_salida',
      { id_medicamento: vigente.id, tipo: 'BAJA_DESCARTE', cantidad: 1, detalle: 'PW E2E DESCARTE INDEBIDO' }, /vencido/i);
    expect(descarte.body.codigo).toBe('DESCARTE_NO_VENCIDO');
    await assertError(request, 'medicamentos_salida',
      { id_medicamento: vigente.id, tipo: 'AJUSTE_SALIDA', cantidad: 1, detalle: 'CORTO' }, /motivo del ajuste/i);
    expect(Number((await stockOf(request, vigente.id)).stock_actual)).toBe(5);
    const ajuste = await apiCall(request, 'medicamentos_salida', {
      method: 'POST', data: { id_medicamento: vigente.id, tipo: 'AJUSTE_SALIDA', cantidad: 2, detalle: 'PW E2E SE CARGARON 2 DE MÁS' },
    });
    const mov = (await movementsOf(request, vigente.id)).find(m => Number(m.id_movimiento) === Number(ajuste.id_movimiento));
    expect(mov).toMatchObject({ tipo: 'AJUSTE_SALIDA' });
    expect(Number((await stockOf(request, vigente.id)).stock_actual)).toBe(3);

    const vencido = await createMedicine(request, {
      medicine: medFixture({ fecha_vencimiento: futureIso(-1) }),
      first: entryFixture({ cantidad: 2, fecha_vencimiento: futureIso(-1) }),
    });
    await apiCall(request, 'medicamentos_salida', {
      method: 'POST', data: { id_medicamento: vencido.id, tipo: 'BAJA_DESCARTE', cantidad: 2, detalle: 'PW E2E DESCARTE DE VENCIDO' },
    });
    expect(Number((await stockOf(request, vencido.id)).stock_actual)).toBe(0);
  });

  test('API: las presentaciones de Banco de Drogas no se renombran ni se dan de baja', async ({ request }) => {
    // Sin eliminar por API: con un backend desactualizado no podría revertirse.
    const gestion = fs.readFileSync(path.join(backend, 'modules', 'medicamentos', 'medicamentos_opciones.php'), 'utf8');
    expect(gestion).toContain("self::exigirPresentacionModificable($antes,'eliminar')");
    const opciones = (await apiCall(request, 'medicamentos_opciones')).registros || [];
    for (const nombre of ['COMPRIMIDOS', 'JARABE']) {
      const opcion = opciones.find(o => o.tipo === 'PRESENTACION' && o.nombre === nombre);
      expect(opcion, `Falta la presentación ${nombre} en medicamentos_opciones`).toBeTruthy();
      const renombrar = await apiResult(request, 'medicamentos_opcion_guardar', {
        method: 'POST', data: { id_opcion: opcion.id_opcion, tipo: 'PRESENTACION', nombre: `${nombre} PW E2E` },
      });
      try {
        expect(renombrar.ok).toBe(false);
        expect(renombrar.body.codigo).toBe('OPTION_FIXED');
      } finally {
        if (renombrar.ok) await apiResult(request, 'medicamentos_opcion_guardar', {
          method: 'POST', data: { id_opcion: opcion.id_opcion, tipo: 'PRESENTACION', nombre },
        });
      }
      if (Number(opcion.activo) === 1) {
        const baja = await apiResult(request, 'medicamentos_opcion_estado', { method: 'POST', data: { id_opcion: opcion.id_opcion, activo: 0 } });
        try {
          expect(baja.ok).toBe(false);
          expect(baja.body.codigo).toBe('OPTION_FIXED');
        } finally {
          if (baja.ok) await apiResult(request, 'medicamentos_opcion_estado', { method: 'POST', data: { id_opcion: opcion.id_opcion, activo: 1 } });
        }
      }
    }
  });

  test('UI: la unidad MG depende de la presentación, también con un filtro activo', async ({ page }) => {
    await page.goto('/medicamentos/stock?presentacion=GOTAS');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    const presentacion = modal.getByLabel(/Presentación/);
    const unidad = modal.getByLabel('Unidad de dosis');
    await expect(presentacion).toHaveValue('GOTAS');
    await expect(unidad).toHaveValue('');
    await presentacion.selectOption('COMPRIMIDOS');
    await expect(unidad).toHaveValue('MG');
    await presentacion.selectOption('CREMAS');
    await expect(unidad).toHaveValue('');
    // Una unidad escrita a mano no se pisa al cambiar entre presentaciones sin MG.
    await unidad.fill('G');
    await presentacion.selectOption('GOTAS');
    await expect(unidad).toHaveValue('G');
    await presentacion.selectOption('INYECTABLES');
    await expect(unidad).toHaveValue('MG');
  });

  test('UI: Agregar stock exige donante y Restar stock exige receptor y motivo del ajuste', async ({ page, request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 4 }) });
    const modal = await abrirStock(page, fx);
    const registrar = modal.getByRole('button', { name: 'Registrar movimiento' });

    await modal.getByLabel('Cantidad *').fill('1');
    const donante = modal.getByLabel('Nombre y apellido del donante (manual) *');
    await expect(donante).toBeVisible();
    await expect(registrar).toBeDisabled();
    await donante.fill('PW E2E DONANTE');
    await expect(registrar).toBeEnabled();

    await modal.getByRole('button', { name: 'Restar stock' }).click();
    const motivo = modal.getByLabel('Motivo de salida *');
    await expect(motivo).toHaveValue('ENTREGA_DONACION');
    await expect(motivo.locator('option[value="BAJA_DESCARTE"]')).toHaveCount(0);
    await modal.getByLabel('Cantidad *').fill('1');
    const receptor = modal.getByLabel('Nombre y apellido de quien recibe *');
    await expect(receptor).toBeVisible();
    await expect(registrar).toBeDisabled();
    await receptor.fill('PW E2E PACIENTE');
    await expect(registrar).toBeEnabled();

    await motivo.selectOption('AJUSTE_SALIDA');
    await expect(receptor).toHaveCount(0);
    const detalle = modal.getByLabel(/Motivo del ajuste/);
    await expect(registrar).toBeDisabled();
    await detalle.fill('PW E2E SE CARGÓ UNA CAJA DE MÁS');
    await expect(registrar).toBeEnabled();
    await modal.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('UI: Configuración no permite editar ni dar de baja las presentaciones fijas', async ({ page }) => {
    await page.goto('/configuracion/medicamentos');
    const tabs = page.getByRole('tablist', { name: 'Selectores de medicamentos' });
    await tabs.getByRole('tab', { name: 'Presentaciones' }).click();
    await expect(page.getByText('COMPRIMIDOS', { exact: true }).first()).toBeVisible();
    for (const nombre of ['COMPRIMIDOS', 'JARABE', 'DOBLE CONCENTRADO']) {
      await expect(page.getByRole('button', { name: `Editar ${nombre}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Dar de baja ${nombre}`, exact: true })).toHaveCount(0);
    }
  });
});

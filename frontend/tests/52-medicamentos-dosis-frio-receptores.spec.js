const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { medFixture, entryFixture, createMedicine, stockOf, medioPago, requireAccountingOptions, assertError } = require('./helpers/medicamentos.helper');
const { uniqueSuffix } = require('./helpers/data.helper');

// Sólo medicamentos PW E2E y receptores PW E2E: el guardián del backend
// impide escrituras sobre información real incluso al correr en Hostinger.
test.describe('Medicamentos: dosis, cadena de frío y personas no socias', () => {
  test('API: unidad de dosis editable, cadena de frío persistida, fechas y compatibilidad', async ({ request }) => {
    const fx = await createMedicine(request, {
      medicine: medFixture({ dosis: '500', unidad_dosis: 'MG', cadena_frio: 1, unidad_stock: 'CAJA' }),
      first: entryFixture({ cantidad: 8 }),
    });
    let m = await stockOf(request, fx.id);
    expect(m.dosis).toBe('500');
    expect(m.unidad_dosis).toBe('MG');
    expect(Number(m.cadena_frio)).toBe(1);
    expect(m.unidad_stock).toBe('CAJA');
    expect(Number(m.stock_actual)).toBe(8);
    await apiCall(request, 'medicamentos_guardar', {
      method: 'POST',
      data: { ...fx.medicine, id_medicamento: fx.id, cadena_frio: 0 },
    });
    m = await stockOf(request, fx.id);
    expect(Number(m.cadena_frio)).toBe(0);
    await assertError(request, 'medicamentos_guardar', {
      ...fx.medicine, id_medicamento: fx.id, unidad_dosis: 'ML', cadena_frio: 0,
    }, /unidad de dosis.*movimientos históricos/i);
  });

  test('API: receptor no socio, préstamo, búsqueda, devolución y seña', async ({ request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
      CATEGORIA_EGRESO: ['DEVOLUCIONES DE SEÑAS'], CONCEPTO_EGRESO: ['DEVOLUCIÓN DE SEÑA'],
    });
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const medio = await medioPago(request);
    const nombre = `PW E2E EXTERNO ${uniqueSuffix()}`;
    const apellido = 'PRUEBA MANUAL';
    const body = { nombre_receptor: nombre, apellido_receptor: apellido,
      items: [{ id_medicamento: fx.id, cantidad: 2 }], sena: '50.00', id_medio_pago: medio };
    // El guardián de Playwright exige un nombre de prueba marcado E2E: si se
    // vacía también ese nombre, se bloquea ANTES de llegar a la validación de negocio.
    // Mantenerlo marcado y omitir el apellido prueba la validación real sin
    // debilitar el bloqueo de mutaciones sobre datos de personas reales.
    await assertError(request, 'medicamentos_prestar', {
      ...body, apellido_receptor: '',
    }, /nombre y apellido/i);
    const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: body });
    expect(Number(loan.id_prestamo)).toBeGreaterThan(0);
    const data = await apiCall(request, 'medicamentos_prestamo_detalle', { params: { id: loan.id_prestamo } });
    expect(data.prestamo.socio).toBe(`${nombre} ${apellido}`);
    expect(data.prestamo.id_socio).toBeNull();
    const lista = await apiCall(request, 'medicamentos_prestamos', { params: { buscar: nombre } });
    expect(lista.registros.some(p => Number(p.id_prestamo) === Number(loan.id_prestamo) && p.socio === `${nombre} ${apellido}`)).toBe(true);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(3);
    const devuelto = await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: {
      id_detalle_prestamo: data.detalle[0].id_detalle_prestamo, cantidad: 1,
    } });
    expect(Number(devuelto.id_devolucion)).toBeGreaterThan(0);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(4);
    const reembolso = await apiCall(request, 'medicamentos_sena', { method: 'POST', data: {
      id_prestamo: loan.id_prestamo, tipo: 'DEVOLUCION_SENA', monto: '10.00', id_medio_pago: medio,
    } });
    expect(Number(reembolso.id_movimiento_sena)).toBeGreaterThan(0);
  });

  test('UI: presentaciones por sector, unidad MG, frío y plural del stock', async ({ request, page }) => {
    const fx = await createMedicine(request, {
      medicine: medFixture({ dosis: '500', unidad_dosis: 'MG', cadena_frio: 1, unidad_stock: 'CAJA' }),
      first: entryFixture({ cantidad: 8 }),
    });
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
    const row = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row').filter({ hasText: fx.medicine.nombre_comercial });
    await expect(row).toContainText('CAJAS');
    await expect(row).toContainText('Dosis: 500 MG');
    await expect(row).toContainText('Cadena de frío');
    await page.getByRole('button', { name: 'Nuevo medicamento' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo medicamento' });
    const presentacion = modal.getByLabel(/Presentación/);
    await expect(presentacion.locator('option')).toHaveCount(5);
    await expect(modal.getByLabel('Unidad de dosis')).toHaveValue('MG');
    await expect(modal.getByLabel(/Sector de Banco de Drogas/)).toHaveCount(0);
    const unidades = modal.getByLabel('Unidad de stock');
    await expect(unidades.locator('option')).toHaveCount(3);
    await expect(unidades.locator('option[value="FRASCO"]')).toHaveCount(0);
    await expect(unidades.locator('option[value="UNIDAD"]')).toHaveCount(0);
    await presentacion.selectOption('INYECTABLES');
    await expect(modal.getByLabel('Unidad de dosis')).toHaveValue('MG');
    await expect(modal.getByLabel('Requiere cadena de frío')).not.toBeChecked();
    await modal.getByLabel('Requiere cadena de frío').check();
    await expect(modal.getByLabel('Requiere cadena de frío')).toBeChecked();
  });

  test('UI: crea un préstamo con nombre y apellido sin buscar socios', async ({ request, page }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 3 }) });
    const nombre = `PW E2E PACIENTE ${uniqueSuffix()}`;
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    const modal = page.getByRole('dialog', { name: 'Registrar préstamo de medicamentos' });
    await expect(modal.getByLabel('Socio que retira')).toHaveCount(0);
    await modal.getByLabel(/Nombre de quien retira/).fill(nombre);
    await modal.getByLabel(/Apellido de quien retira/).fill('PRUEBA');
    await modal.getByRole('tab', { name: 'Medicamentos' }).click();
    await modal.getByLabel('Medicamento 1 *').selectOption(String(fx.id));
    await modal.getByLabel('Cantidad *').fill('1');
    await modal.getByRole('button', { name: 'Registrar préstamo' }).click();
    await expect(modal).not.toBeVisible();
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(nombre);
    const row = page.getByRole('table', { name: 'Préstamos de medicamentos' }).getByRole('row').filter({ hasText: nombre });
    await expect(row).toContainText(`${nombre} PRUEBA`);
    await expect(row).toContainText('Registrado manualmente');
  });
});

const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, entryFixture, medioPago, requireAccountingOptions } = require('./helpers/medicamentos.helper');
const { uniqueSuffix } = require('./helpers/data.helper');

test.describe('Banco de Drogas: selectores locales y medios de seña', () => {
  test('API: EFECTIVO existe sin borrar TRANSFERENCIA; seña y reintegro no aceptan otros medios', async ({ request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
      CATEGORIA_EGRESO: ['DEVOLUCIONES DE SEÑAS'], CONCEPTO_EGRESO: ['DEVOLUCIÓN DE SEÑA'],
    });
    const medios = (await apiCall(request, 'medicamentos_medios')).registros;
    const cash = medios.find(m => String(m.nombre).toUpperCase() === 'EFECTIVO');
    expect(cash).toBeTruthy();
    const other = medios.find(m => Number(m.id_medio_pago) !== Number(cash.id_medio_pago));
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const name = `PW E2E SELECTOR ${uniqueSuffix()}`;
    const body = { nombre_receptor: name, apellido_receptor: 'PRUEBA',
      items: [{ id_medicamento: fx.id, cantidad: 1 }], sena: '100.00' };
    if (other) {
      const forbidden = await apiResult(request, 'medicamentos_prestar', {
        method: 'POST', data: { ...body, id_medio_pago: other.id_medio_pago },
      });
      expect(forbidden.ok).toBe(false);
      expect(String(forbidden.body?.mensaje || '')).toMatch(/efectivo/i);
    }
    const prestamo = await apiCall(request, 'medicamentos_prestar', {
      method: 'POST', data: { ...body, id_medio_pago: cash.id_medio_pago },
    });
    if (other) {
      const forbiddenRefund = await apiResult(request, 'medicamentos_sena', {
        method: 'POST', data: { id_prestamo: prestamo.id_prestamo, tipo: 'DEVOLUCION_SENA',
          monto: '20.00', id_medio_pago: other.id_medio_pago },
      });
      expect(forbiddenRefund.ok).toBe(false);
      expect(String(forbiddenRefund.body?.mensaje || '')).toMatch(/efectivo/i);
    }
  });

  test('UI: seña fija en efectivo y reintegro ofrece Efectivo o Donación', async ({ page, request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
    });
    const cash = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 4 }) });
    const name = `PW E2E REINTEGRO ${uniqueSuffix()}`;
    const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: {
      nombre_receptor: name, apellido_receptor: 'PRUEBA',
      items: [{ id_medicamento: fx.id, cantidad: 1 }], sena: '20.00', id_medio_pago: cash,
    }});
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    const createModal = page.getByRole('dialog', { name: /Registrar préstamo de medicamentos/ });
    const cashSelect = createModal.getByLabel('Medio de pago de seña');
    await expect(cashSelect).toBeDisabled();
    await expect(cashSelect).toHaveValue(String(cash));
    await createModal.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(name);
    const row = page.getByRole('table', { name: /Préstamos de medicamentos/ }).getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Reintegrar seña' }).click();
    const modal = page.getByRole('dialog', { name: 'Reintegrar seña' });
    const destino = modal.getByLabel('Destino de la seña *');
    // Abrir el modal dispara una consulta asíncrona. evaluateAll no espera
    // elementos: primero aguardar el selector y sus dos opciones renderizadas.
    await expect(destino).toBeVisible();
    await expect(destino.locator('option')).toHaveCount(2);
    expect(await destino.locator('option').evaluateAll(xs => xs.map(x => x.value))).toEqual(['EFECTIVO', 'DONACION']);
    await expect(destino).toHaveValue('EFECTIVO');
    await expect(modal.getByLabel('Medio de pago del reintegro')).toBeDisabled();
    await destino.selectOption('DONACION');
    await expect(modal.getByText(/finalizará el préstamo/i)).toBeVisible();
    await expect(modal.getByLabel('Monto a reintegrar')).toHaveCount(0);
  });
});

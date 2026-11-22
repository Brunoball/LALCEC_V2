const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, entryFixture, medioPago, requireAccountingOptions, loanPeople } = require('./helpers/medicamentos.helper');
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
    const body = { ...loanPeople({ nombre_receptor: name }),
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
    // Sin medio informado, el backend asigna EFECTIVO automáticamente.
    const automatico = await apiCall(request, 'medicamentos_prestar', {
      method: 'POST', data: { ...body, ...loanPeople({ nombre_receptor: `${name} AUTO` }), items: [{ id_medicamento: fx.id, cantidad: 1 }] },
    });
    const autoDetalle = await apiCall(request, 'medicamentos_prestamo_detalle', { params: { id: automatico.id_prestamo } });
    const cobro = autoDetalle.senas.find(s => s.tipo === 'COBRO_SENA');
    expect(Number(cobro.id_medio_pago)).toBe(Number(cash.id_medio_pago));
    expect(String(cobro.medio_pago).toUpperCase()).toBe('EFECTIVO');
    if (other) {
      const forbiddenRefund = await apiResult(request, 'medicamentos_sena', {
        method: 'POST', data: { id_prestamo: prestamo.id_prestamo, tipo: 'DEVOLUCION_SENA',
          monto: '20.00', id_medio_pago: other.id_medio_pago },
      });
      expect(forbiddenRefund.ok).toBe(false);
      expect(String(forbiddenRefund.body?.mensaje || '')).toMatch(/efectivo/i);
    }
  });

  test('UI: seña fija en efectivo y el único cierre ofrece Efectivo o Donación, sin candado', async ({ page, request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
    });
    const cash = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 4 }) });
    const name = `PW E2E REINTEGRO ${uniqueSuffix()}`;
    const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: {
      ...loanPeople({ nombre_receptor: name }),
      items: [{ id_medicamento: fx.id, cantidad: 1 }], sena: '20.00', id_medio_pago: cash,
    }});
    expect(Number(loan.id_prestamo)).toBeGreaterThan(0);
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    const createModal = page.getByRole('dialog', { name: /Registrar préstamo de medicamentos/ });
    // Trello: sin selector de medio; solo el aviso de que la seña es en efectivo.
    await expect(createModal.getByLabel(/Medio de pago/)).toHaveCount(0);
    await expect(createModal.getByText('Seña: únicamente en efectivo')).toBeVisible();
    await createModal.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(name);
    const row = page.getByRole('table', { name: /Préstamos de medicamentos/ }).getByRole('row').filter({ hasText: name });
    // Trello: "quitaría lo del candado": un solo botón para resolver la seña y finalizar.
    await expect(row.getByRole('button', { name: 'Reintegrar seña' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Finalizar préstamo' })).toHaveCount(1);
    await row.getByRole('button', { name: 'Finalizar préstamo' }).click();
    const modal = page.getByRole('dialog', { name: /Finalizar préstamo/ });
    const destino = modal.getByLabel('Destino de la seña *');
    // Abrir el modal dispara una consulta asíncrona. evaluateAll no espera
    // elementos: primero aguardar el selector y sus dos opciones renderizadas.
    await expect(destino).toBeVisible();
    await expect(destino.locator('option')).toHaveCount(2);
    expect(await destino.locator('option').evaluateAll(xs => xs.map(x => x.value))).toEqual(['EFECTIVO', 'DONACION']);
    await expect(destino).toHaveValue('EFECTIVO');
    await expect(modal.getByLabel(/Medio de pago/)).toHaveCount(0);
    await expect(modal.getByText('Reintegro: únicamente en efectivo')).toBeVisible();
    // El monto se propone completo: reintegrar todo finaliza el préstamo.
    await expect(modal.getByLabel(/Monto a reintegrar/)).toHaveValue('20.00');
    await expect(modal.getByRole('button', { name: 'Reintegrar y finalizar' })).toBeEnabled();
    await modal.getByLabel(/Monto a reintegrar/).fill('5');
    await expect(modal.getByRole('button', { name: 'Registrar reintegro parcial' })).toBeEnabled();
    await expect(modal.getByText(/el préstamo sigue abierto/i)).toBeVisible();
    await destino.selectOption('DONACION');
    await expect(modal.getByText(/el préstamo se finaliza/i)).toBeVisible();
    await expect(modal.getByLabel(/Monto a reintegrar/)).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Donar seña y finalizar' })).toBeEnabled();
  });
});

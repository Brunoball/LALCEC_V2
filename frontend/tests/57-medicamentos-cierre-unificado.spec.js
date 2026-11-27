const { randomUUID } = require('node:crypto');
const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, entryFixture, stockOf, assertError, requireAccountingOptions, loanPeople } = require('./helpers/medicamentos.helper');

const cents = x => Math.round(Number(x) * 100);
const detalle = (request, id) => apiCall(request, 'medicamentos_prestamo_detalle', { params: { id } });
const listar = (request, estado, buscar) => apiCall(request, 'medicamentos_prestamos', { params: { estado, buscar } });

async function prestamo(request, { sena = '0', cantidad = 3 } = {}) {
  const fx = await createMedicine(request, { first: entryFixture({ cantidad: cantidad + 2 }) });
  const people = loanPeople();
  const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: {
    ...people, items: [{ id_medicamento: fx.id, cantidad }], sena,
  } });
  return { fx, people, id: Number(loan.id_prestamo) };
}

test.describe('Medicamentos: un único flujo para resolver la seña y finalizar el préstamo', () => {
  test.beforeEach(async ({ request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
      CATEGORIA_EGRESO: ['DEVOLUCIONES DE SEÑAS'], CONCEPTO_EGRESO: ['DEVOLUCIÓN DE SEÑA'],
    });
  });

  test('API: reintegro total en efectivo finaliza; pendientes quedan registrados y el stock no vuelve', async ({ request }) => {
    const { fx, people, id } = await prestamo(request, { sena: '80.00' });
    const stockAntes = Number((await stockOf(request, fx.id)).stock_actual);
    // El importe confirmado debe coincidir con la seña pendiente.
    const desactualizado = await apiResult(request, 'medicamentos_cerrar', { method: 'POST', data: { id_prestamo: id, resolucion_sena: 'EFECTIVO', monto_reintegro: '50.00' } });
    expect(desactualizado.status).toBe(409);
    expect(desactualizado.body.codigo).toBe('SENA_DESACTUALIZADA');
    await assertError(request, 'medicamentos_cerrar', { id_prestamo: id, resolucion_sena: 'TRANSFERENCIA' }, /destino de la seña/i);
    expect((await detalle(request, id)).prestamo.estado).toBe('ABIERTO');

    const body = { id_prestamo: id, resolucion_sena: 'EFECTIVO', monto_reintegro: '80.00', _idempotency_key: `med-PWE2E-${randomUUID()}` };
    const cierre = await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: body });
    const reintento = await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: body });
    expect(reintento).toEqual(cierre);
    expect(cierre).toMatchObject({ estado: 'CERRADO', unidades_sin_devolver: 3, sena_donada: '0.00', sena_reintegrada: '80.00' });

    const final = await detalle(request, id);
    expect(final.prestamo.estado).toBe('CERRADO');
    expect(cents(final.prestamo.sena_pendiente)).toBe(0);
    const reintegros = final.senas.filter(s => s.tipo === 'DEVOLUCION_SENA');
    expect(reintegros).toHaveLength(1);
    expect(Number(reintegros[0].id_egreso_contable)).toBeGreaterThan(0);
    expect(String(reintegros[0].medio_pago).toUpperCase()).toBe('EFECTIVO');
    expect(final.senas.filter(s => s.tipo === 'SENA_DONADA')).toHaveLength(0);
    // Historial: entregado, devuelto y sin devolver se conservan.
    expect(Number(final.detalle[0].cantidad_entregada)).toBe(3);
    expect(Number(final.detalle[0].cantidad_recibida)).toBe(0);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(stockAntes);

    // Deja de figurar entre los abiertos y sigue disponible en CERRADOS.
    expect((await listar(request, 'ABIERTO', people.nombre_receptor)).registros.some(p => Number(p.id_prestamo) === id)).toBe(false);
    const cerrado = (await listar(request, 'CERRADO', people.nombre_receptor)).registros.find(p => Number(p.id_prestamo) === id);
    expect(cerrado).toBeTruthy();
    expect(cerrado.paciente_nombre).toBe(people.paciente_nombre);
    expect(cents(cerrado.sena_cobrada)).toBe(8000);
    expect(cents(cerrado.sena_devuelta)).toBe(8000);

    // Un préstamo finalizado no admite más cambios.
    await assertError(request, 'medicamentos_cerrar', { id_prestamo: id }, /no está abierto/i);
    await assertError(request, 'medicamentos_sena', { id_prestamo: id, tipo: 'DEVOLUCION_SENA', monto: '1.00' }, /no abierto/i);
    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [{ id_detalle_prestamo: Number(final.detalle[0].id_detalle_prestamo), cantidad: 1 }] }, /no abierto/i);
  });

  test('API: reintegro parcial deja el préstamo abierto; la donación del resto finaliza una sola vez', async ({ request }) => {
    const { id } = await prestamo(request, { sena: '100.00', cantidad: 1 });
    await apiCall(request, 'medicamentos_sena', { method: 'POST', data: { id_prestamo: id, tipo: 'DEVOLUCION_SENA', monto: '30.00' } });
    let actual = await detalle(request, id);
    expect(actual.prestamo.estado).toBe('ABIERTO');
    expect(cents(actual.prestamo.sena_pendiente)).toBe(7000);
    await assertError(request, 'medicamentos_sena', { id_prestamo: id, tipo: 'DEVOLUCION_SENA', monto: '70.01' }, /supera/i);
    const cierre = await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: { id_prestamo: id, resolucion_sena: 'DONACION' } });
    expect(cierre).toMatchObject({ sena_donada: '70.00', sena_reintegrada: '0.00' });
    actual = await detalle(request, id);
    expect(actual.senas.filter(s => s.tipo === 'SENA_DONADA')).toHaveLength(1);
    expect(actual.senas.filter(s => s.tipo === 'SENA_DONADA')[0].id_egreso_contable ?? null).toBeNull();
    expect(cents(actual.prestamo.sena_pendiente)).toBe(0);
  });

  test('API: préstamo sin seña se finaliza igual, sin movimientos de dinero', async ({ request }) => {
    const { id } = await prestamo(request, { cantidad: 2 });
    const cierre = await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: { id_prestamo: id, resolucion_sena: 'EFECTIVO' } });
    expect(cierre).toMatchObject({ estado: 'CERRADO', unidades_sin_devolver: 2, sena_donada: '0.00', sena_reintegrada: '0.00' });
    expect((await detalle(request, id)).senas).toHaveLength(0);
  });

  test('UI: sin candado, listado de abiertos por defecto y finalización desde el único botón', async ({ page, request }) => {
    const { people, id } = await prestamo(request, { sena: '40.00', cantidad: 1 });
    await page.goto('/medicamentos/prestamos');
    await expect(page.getByRole('combobox', { name: 'Estado' })).toHaveValue('ABIERTO');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(people.nombre_receptor);
    const tabla = page.getByRole('table', { name: 'Préstamos de medicamentos' });
    const row = tabla.getByRole('row').filter({ hasText: people.nombre_receptor });
    const finalizar = row.getByRole('button', { name: 'Finalizar préstamo', exact: true });
    await expect(finalizar).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Reintegrar seña' })).toHaveCount(0);
    await expect(row.getByRole('button')).toHaveCount(3); // Información, devolución y cierre unificado.
    await expect(finalizar.locator('svg[data-icon="money-bill-transfer"]')).toHaveCount(1);
    await finalizar.click();
    const modal = page.getByRole('dialog', { name: /Finalizar préstamo/ });
    await expect(modal).toContainText(`${people.apellido_receptor}, ${people.nombre_receptor}`);
    // El resumen muestra etiqueta y valor en elementos separados, no una frase con dos puntos.
    // El filtro hasText se evalúa dentro de cada tarjeta; no vuelve a buscar el diálogo.
    const pendientes = modal.locator('.med-finalizar-item').filter({ hasText: 'Unidades sin devolver' });
    await expect(pendientes).toHaveCount(1);
    await expect(pendientes).toBeVisible();
    await expect(pendientes.getByText('Unidades sin devolver', { exact: true })).toBeVisible();
    await expect(pendientes.locator('strong')).toHaveText('1');
    await expect(pendientes.getByText('Quedan registradas como no devueltas')).toBeVisible();
    await modal.getByLabel('Destino de la seña *').selectOption('DONACION');
    await modal.getByRole('button', { name: 'Donar seña y finalizar' }).click();
    await expect(modal).not.toBeVisible();
    await expect(tabla.getByRole('row').filter({ hasText: people.nombre_receptor })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('CERRADO');
    const finalizado = tabla.getByRole('row').filter({ hasText: people.nombre_receptor });
    await expect(finalizado).toContainText('CERRADO');
    await expect(finalizado.getByRole('button', { name: 'Finalizar préstamo' })).toHaveCount(0);
    await finalizado.getByRole('button', { name: 'Ver información del préstamo' }).click();
    const info = page.getByRole('dialog', { name: new RegExp(people.nombre_receptor) });
    await expect(info).toContainText(people.paciente_nombre);
    await expect(info.locator('.med-loan-detail-quantity--pending')).toHaveText('Pendiente 1');
    await info.getByRole('tab', { name: 'Seña' }).click();
    await expect(info.getByText('Seña donada', { exact: true })).toBeVisible();
    await expect(info.getByText('Donación', { exact: true })).toBeVisible();
    const cierre = await detalle(request, id);
    expect(cierre.prestamo.estado).toBe('CERRADO');
    expect(cents(cierre.prestamo.sena_pendiente)).toBe(0);
    const donaciones = cierre.senas.filter(s => s.tipo === 'SENA_DONADA');
    expect(donaciones).toHaveLength(1);
    expect(cents(donaciones[0].monto)).toBe(4000);
    expect(donaciones[0].id_egreso_contable ?? null).toBeNull();
    expect(cierre.senas.filter(s => s.tipo === 'DEVOLUCION_SENA')).toHaveLength(0);
  });
});

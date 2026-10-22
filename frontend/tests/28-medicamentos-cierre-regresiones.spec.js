// Regresiones de la auditoría de cierre de Medicamentos (22/10/2026).
// Cada prueba protege un error confirmado o una regla crítica que antes no
// tenía cobertura. Solo usa medicamentos/socios PW E2E (guardia E2E + limpieza).
const { randomUUID } = require('node:crypto');
const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { todayIso } = require('./helpers/data.helper');
const {
  createMedicine, medFixture, entryFixture, futureIso, createBorrower, medioPago,
  requireAccountingOptions, stockOf, movementsOf, assertError,
} = require('./helpers/medicamentos.helper');

const cents = x => Math.round(Number(x) * 100);
const suffixOf = fx => String(fx.medicine.nombre_comercial).split(' ').pop();
const periodo = () => ({ anio: Number(todayIso().slice(0, 4)), mes: Number(todayIso().slice(5, 7)) });
const ingresos = async (request, buscar) =>
  (await apiCall(request, 'contable_ingresos_listar', { params: { ...periodo(), buscar } })).items || [];
const egresos = async (request, buscar) =>
  (await apiCall(request, 'contable_egresos_listar', { params: { ...periodo(), buscar } })).items || [];
const compra = (request, id, medio, overrides = {}) => apiCall(request, 'medicamentos_ingresar', {
  method: 'POST',
  data: { id_medicamento: id, ...entryFixture({ origen: 'COMPRA', costo_unitario: '10.00', id_medio_pago: medio, procedencia: 'PW E2E FARMACIA', ...overrides }) },
});
const anular = (request, id_movimiento, medio, motivo = 'PW E2E ANULACIÓN DE CIERRE CONFIRMADA') =>
  apiResult(request, 'medicamentos_anular', { method: 'POST', data: { id_movimiento, id_medio_pago: medio, motivo, devolucion_confirmada: true } });

const COMPRAS = {
  CATEGORIA_EGRESO: ['COMPRA DE MEDICAMENTOS'], CONCEPTO_EGRESO: ['COMPRA DE MEDICAMENTOS'],
  CATEGORIA_INGRESO: ['REINTEGROS DE COMPRAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['REINTEGRO DE COMPRA DE MEDICAMENTOS'],
};
const VENTAS = {
  CATEGORIA_INGRESO: ['VENTA DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['VENTA DE MEDICAMENTOS'],
  CATEGORIA_EGRESO: ['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'], CONCEPTO_EGRESO: ['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
};

test.describe('Medicamentos: regresiones de cierre', () => {
  test('anular una compra restaura el vencimiento previo, el stock y el último ingreso', async ({ request }) => {
    await requireAccountingOptions(request, COMPRAS);
    const medio = await medioPago(request);
    const previa = futureIso(40);
    const fx = await createMedicine(request, {
      medicine: medFixture({ fecha_vencimiento: previa }),
      first: entryFixture({ cantidad: 5, fecha_vencimiento: previa }),
    });
    const c = await compra(request, fx.id, medio, { cantidad: 10, fecha_vencimiento: futureIso(700) });
    expect((await stockOf(request, fx.id)).fecha_vencimiento).toBe(futureIso(700));
    const a = await anular(request, c.id_movimiento, medio);
    expect(a.ok, JSON.stringify(a.body)).toBe(true);
    expect(a.body.operacion_anulada).toBe('COMPRA');
    expect(Number(a.body.id_contable_compensatorio)).toBeGreaterThan(0);
    const row = await stockOf(request, fx.id);
    expect(Number(row.stock_actual)).toBe(5);
    expect(row.fecha_vencimiento).toBe(previa);
    expect(row.ultimo_origen).toBe('DONACION');
    // Reintegro contable por el total exacto de la compra.
    const reintegro = (await ingresos(request, `Anulación de compra #${(await movementsOf(request, fx.id))
      .find(m => Number(m.id_movimiento) === Number(c.id_movimiento)).id_egreso_contable}`))
      .find(x => Number(x.id_ingreso) === Number(a.body.id_contable_compensatorio));
    expect(reintegro, 'Debe existir el ingreso de reintegro').toBeTruthy();
    expect(cents(reintegro.importe)).toBe(10000);
  });

  test('si hubo ingresos posteriores, anular la compra nunca extiende la vida útil', async ({ request }) => {
    await requireAccountingOptions(request, COMPRAS);
    const medio = await medioPago(request);
    const previa = futureIso(40);
    const fx = await createMedicine(request, {
      medicine: medFixture({ fecha_vencimiento: previa }),
      first: entryFixture({ cantidad: 5, fecha_vencimiento: previa }),
    });
    const c = await compra(request, fx.id, medio, { cantidad: 4, fecha_vencimiento: futureIso(700) });
    await apiCall(request, 'medicamentos_ingresar', { method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ cantidad: 2, fecha_vencimiento: futureIso(700) }) } });
    const a = await anular(request, c.id_movimiento, medio);
    expect(a.ok, JSON.stringify(a.body)).toBe(true);
    expect((await stockOf(request, fx.id)).fecha_vencimiento).toBe(previa);
  });

  test('la fecha de ingreso declarada queda en el movimiento y el último ingreso no retrocede', async ({ request }) => {
    const fx = await createMedicine(request);
    const r = await apiCall(request, 'medicamentos_ingresar', {
      method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ cantidad: 1, fecha_ingreso: futureIso(-7) }) },
    });
    const mov = (await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(r.id_movimiento));
    expect(String(mov.fecha_movimiento).slice(0, 10)).toBe(futureIso(-7));
    expect((await stockOf(request, fx.id)).ultimo_ingreso).toBe(todayIso());
  });

  test('textos largos se rechazan con mensaje claro, nunca con error interno', async ({ request }) => {
    await requireAccountingOptions(request, VENTAS);
    const medio = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 6 }) });
    const venta = await apiCall(request, 'medicamentos_salida', { method: 'POST', data: { id_medicamento: fx.id, tipo: 'SALIDA_VENTA', cantidad: 1, importe: '10.00', id_medio_pago: medio } });
    const largo = await anular(request, venta.id_movimiento, medio, `PW E2E ${'M'.repeat(460)}`);
    expect(largo.status).toBe(422);
    expect(largo.body.mensaje).toMatch(/450/);
    const justo = await anular(request, venta.id_movimiento, medio, `PW E2E ${'M'.repeat(443)}`);
    expect(justo.ok, JSON.stringify(justo.body)).toBe(true);
    const procedencia = await apiResult(request, 'medicamentos_ingresar', {
      method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ origen: 'COMPRA', cantidad: 1, costo_unitario: '1.00', id_medio_pago: medio, procedencia: `PW E2E ${'P'.repeat(170)}` }) },
    });
    expect(procedencia.status).toBe(422);
    expect(procedencia.body.mensaje).toMatch(/160/);
    const socio = await createBorrower(request);
    const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: { id_socio: socio.id, items: [{ id_medicamento: fx.id, cantidad: 1 }], sena: '0' } });
    const det = (await apiCall(request, 'medicamentos_prestamo_detalle', { params: { id: loan.id_prestamo } })).detalle[0];
    const devol = await apiResult(request, 'medicamentos_devolver', { method: 'POST', data: { id_detalle_prestamo: det.id_detalle_prestamo, cantidad: 1, observaciones: 'O'.repeat(480) } });
    expect(devol.status).toBe(422);
    const ok = await apiResult(request, 'medicamentos_devolver', { method: 'POST', data: { id_detalle_prestamo: det.id_detalle_prestamo, cantidad: 1, observaciones: 'O'.repeat(450) } });
    expect(ok.ok, JSON.stringify(ok.body)).toBe(true);
  });

  test('editar con un formulario viejo no pisa la fecha cambiada por otra operación', async ({ request }) => {
    const fx = await createMedicine(request, { medicine: medFixture({ fecha_vencimiento: futureIso(60) }), first: entryFixture({ cantidad: 2, fecha_vencimiento: futureIso(60) }) });
    const base = { ...fx.medicine, id_medicamento: fx.id };
    await apiCall(request, 'medicamentos_ingresar', { method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ cantidad: 1, fecha_vencimiento: futureIso(90) }) } });
    await apiCall(request, 'medicamentos_guardar', { method: 'POST', data: { ...base, laboratorio: 'PW E2E LAB EDITADO', fecha_vencimiento: futureIso(60), fecha_vencimiento_original: futureIso(60) } });
    expect((await stockOf(request, fx.id)).fecha_vencimiento).toBe(futureIso(90));
    const conflicto = await apiResult(request, 'medicamentos_guardar', { method: 'POST', data: { ...base, fecha_vencimiento: futureIso(30), fecha_vencimiento_original: futureIso(60) } });
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.codigo).toBe('VENCIMIENTO_CONCURRENTE');
    expect((await stockOf(request, fx.id)).fecha_vencimiento).toBe(futureIso(90));
  });

  test('venta, entrega y edición respetan vencimiento y fecha obligatoria', async ({ request }) => {
    const medio = await medioPago(request);
    const vencido = await createMedicine(request, { medicine: medFixture({ fecha_vencimiento: futureIso(-2) }), first: entryFixture({ cantidad: 3, fecha_vencimiento: futureIso(-2) }) });
    const venta = await assertError(request, 'medicamentos_salida', { id_medicamento: vencido.id, tipo: 'SALIDA_VENTA', cantidad: 1, importe: '5.00', id_medio_pago: medio }, /venci/i);
    expect(venta.body.codigo).toBe('MEDICAMENTO_VENCIDO');
    const entrega = await assertError(request, 'medicamentos_salida', { id_medicamento: vencido.id, tipo: 'ENTREGA_DONACION', cantidad: 1 }, /venci/i);
    expect(entrega.body.codigo).toBe('MEDICAMENTO_VENCIDO');
    await apiCall(request, 'medicamentos_salida', { method: 'POST', data: { id_medicamento: vencido.id, tipo: 'BAJA_DESCARTE', cantidad: 1, detalle: 'PW E2E DESCARTE DE VENCIDO' } });
    expect(Number((await stockOf(request, vencido.id)).stock_actual)).toBe(2);

    const sinFecha = await apiCall(request, 'medicamentos_guardar', { method: 'POST', data: medFixture({ fecha_vencimiento: '' }) });
    const e = await assertError(request, 'medicamentos_salida', { id_medicamento: sinFecha.id_medicamento, tipo: 'ENTREGA_DONACION', cantidad: 1 }, /vencimiento/i);
    expect(['VENCIMIENTO_FALTANTE', 'VALIDATION_ERROR']).toContain(e.body.codigo);

    const conStock = await createMedicine(request, { first: entryFixture({ cantidad: 2 }) });
    await assertError(request, 'medicamentos_guardar', { ...conStock.medicine, id_medicamento: conStock.id, fecha_vencimiento: '' }, /vencimiento/i);
  });

  test('importes contables exactos y venta fallida sin asiento huérfano', async ({ request }) => {
    await requireAccountingOptions(request, { ...VENTAS, CATEGORIA_EGRESO: ['COMPRA DE MEDICAMENTOS', 'DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'], CONCEPTO_EGRESO: ['COMPRA DE MEDICAMENTOS', 'DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'] });
    const medio = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 4 }) });
    const suffix = suffixOf(fx);

    const antes = (await ingresos(request, suffix)).length;
    await assertError(request, 'medicamentos_salida', { id_medicamento: fx.id, tipo: 'SALIDA_VENTA', cantidad: 9, importe: '50.00', id_medio_pago: medio }, /stock insuficiente/i);
    expect((await ingresos(request, suffix)).length).toBe(antes);

    await compra(request, fx.id, medio, { cantidad: 3, costo_unitario: '85.50' });
    const egresoCompra = (await egresos(request, suffix)).find(x => x.categoria === 'COMPRA DE MEDICAMENTOS');
    expect(cents(egresoCompra.importe)).toBe(25650);
    expect(egresoCompra.es_medicamentos).toBe(true);

    const venta = await apiCall(request, 'medicamentos_salida', { method: 'POST', data: { id_medicamento: fx.id, tipo: 'SALIDA_VENTA', cantidad: 2, importe: '200.50', id_medio_pago: medio } });
    const ingresoVenta = (await ingresos(request, suffix)).find(x => x.categoria === 'VENTA DE MEDICAMENTOS');
    expect(cents(ingresoVenta.importe)).toBe(20050);
    const a = await anular(request, venta.id_movimiento, medio);
    expect(a.ok, JSON.stringify(a.body)).toBe(true);
    const compensatorio = (await egresos(request, `Anulación de venta #${ingresoVenta.id_ingreso}`))
      .find(x => Number(x.id_egreso) === Number(a.body.id_contable_compensatorio));
    expect(cents(compensatorio.importe)).toBe(20050);
    // El asiento original se conserva.
    expect((await ingresos(request, suffix)).some(x => Number(x.id_ingreso) === Number(ingresoVenta.id_ingreso))).toBe(true);
  });

  test('Contabilidad no puede editar ni borrar asientos generados por Medicamentos', async ({ request }) => {
    await requireAccountingOptions(request, { CATEGORIA_EGRESO: ['COMPRA DE MEDICAMENTOS'], CONCEPTO_EGRESO: ['COMPRA DE MEDICAMENTOS'] });
    const medio = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 1 }) });
    await compra(request, fx.id, medio, { cantidad: 2 });
    const egreso = (await egresos(request, suffixOf(fx))).find(x => x.categoria === 'COMPRA DE MEDICAMENTOS');
    expect(egreso).toBeTruthy();
    const borrar = await apiResult(request, 'contable_egreso_eliminar', { method: 'POST', data: { id_egreso: egreso.id_egreso } });
    expect(borrar.status).toBe(409);
    expect(borrar.body.codigo).toBe('MOVIMIENTO_MEDICAMENTOS_PROTEGIDO');
    expect((await egresos(request, suffixOf(fx))).some(x => Number(x.id_egreso) === Number(egreso.id_egreso))).toBe(true);
  });

  test('misma clave con otro contenido no ejecuta una segunda operación', async ({ request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const key = `med-PWE2E-${randomUUID()}`;
    await apiCall(request, 'medicamentos_salida', { method: 'POST', data: { id_medicamento: fx.id, tipo: 'ENTREGA_DONACION', cantidad: 1, _idempotency_key: key } });
    const otra = await apiResult(request, 'medicamentos_salida', { method: 'POST', data: { id_medicamento: fx.id, tipo: 'ENTREGA_DONACION', cantidad: 2, _idempotency_key: key } });
    expect(otra.status).toBe(409);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(4);
  });
});

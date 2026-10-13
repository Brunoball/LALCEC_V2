const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const {
  futureIso, medFixture, entryFixture, createMedicine, stockOf, lotOf,
  movementsOf, assertError,
} = require('./helpers/medicamentos.helper');

test.describe('Medicamentos: stock, lotes, FEFO e integridad API', () => {
  test('alta atómica, edición permitida, cambio de estado y rechazo de cambios históricos', async ({ request }) => {
    const fx = await createMedicine(request);
    const original = await stockOf(request, fx.id);
    expect(Number(original.stock_utilizable)).toBe(fx.first.cantidad);
    expect(Number(original.lotes)).toBe(1);

    const updatedName = `${fx.medicine.nombre_comercial} EDITADO`;
    await apiCall(request, 'medicamentos_guardar', { method:'POST', data: {
      ...fx.medicine, id_medicamento: fx.id, nombre_comercial: updatedName,
      laboratorio: 'LAB EDITADO PLAYWRIGHT',
    }});
    expect((await stockOf(request,fx.id)).nombre_comercial).toBe(updatedName);
    await assertError(request,'medicamentos_guardar', {
      ...fx.medicine, id_medicamento: fx.id, nombre_comercial: updatedName,
      dosis: '1000 MG',
    }, /lotes hist[oó]ricos|presentaci[oó]n/i);
    expect((await stockOf(request,fx.id)).dosis).toBe('500 MG');

    await apiCall(request,'medicamentos_cambiar_estado',{method:'POST',data:{id_medicamento:fx.id,activo:0}});
    expect(Number((await stockOf(request,fx.id)).activo)).toBe(0);
    await assertError(request,'medicamentos_ingresar',{
      id_medicamento:fx.id, ...entryFixture(),
    },/inactivo|inexistente/i);
    await apiCall(request,'medicamentos_cambiar_estado',{method:'POST',data:{id_medicamento:fx.id,activo:1}});
    expect(Number((await stockOf(request,fx.id)).activo)).toBe(1);
  });

  test('lotes separados, priorización FEFO, salida multi-lote y rechazo atómico de excedente', async ({ request }) => {
    const first = entryFixture({cantidad:3,fecha_vencimiento:futureIso(90)});
    const fx = await createMedicine(request,{first});
    const second = entryFixture({cantidad:5,fecha_vencimiento:futureIso(240)});
    await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...second}});
    const lots = (await apiCall(request,'medicamentos_lotes',{params:{id_medicamento:fx.id}})).registros;
    expect(lots).toHaveLength(2);
    const lot2 = lots.find(l=>l.numero_lote===second.numero_lote);
    expect(lot2).toBeTruthy();

    await assertError(request,'medicamentos_salida',{
      id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:9,detalle:'PW E2E STOCK INSUFICIENTE',
    },/stock insuficiente/i);
    expect(Number((await stockOf(request,fx.id)).stock_utilizable)).toBe(8);

    const output = await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:6,detalle:'PW E2E FEFO DOS LOTES',
    }});
    expect(output.id_movimientos).toHaveLength(2);
    expect(output.lotes_utilizados).toBe(2);
    expect(Number((await lotOf(request,fx.lotId)).cantidad_disponible)).toBe(0);
    expect(Number((await lotOf(request,lot2.id_lote)).cantidad_disponible)).toBe(2);
    expect(Number((await stockOf(request,fx.id)).stock_utilizable)).toBe(2);
    const hist = await movementsOf(request,fx.id);
    expect(hist.filter(m=>m.tipo==='ENTREGA_DONACION').map(m=>Number(m.cantidad)).sort())
      .toEqual([3,3]);
  });

  test('bloqueo de lotes, baja de medicamento y descarte no reactivable', async ({ request }) => {
    const fx = await createMedicine(request,{first:entryFixture({cantidad:4})});
    await apiCall(request,'medicamentos_revisar_lote',{method:'POST',data:{id_lote:fx.lotId,estado:'BLOQUEADO'}});
    expect((await lotOf(request,fx.lotId)).estado).toBe('BLOQUEADO');
    await assertError(request,'medicamentos_salida',{
      id_medicamento:fx.id,tipo:'SALIDA_VENTA',cantidad:1,importe:'30.00',id_medio_pago:1,
    },/stock insuficiente/i);
    await apiCall(request,'medicamentos_revisar_lote',{method:'POST',data:{id_lote:fx.lotId,estado:'ACTIVO'}});
    const salida = await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_medicamento:fx.id,tipo:'BAJA_DESCARTE',cantidad:4,detalle:'PW E2E DESCARTE CONTROLADO',
    }});
    expect(salida.id_movimientos).toHaveLength(1);
    expect((await lotOf(request,fx.lotId)).estado).toBe('DESCARTADO');
    await assertError(request,'medicamentos_revisar_lote',{
      id_lote:fx.lotId,estado:'ACTIVO',
    },/descartado/i);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(0);
  });

  test('reglas de fechas, cantidades enteras, origen INICIAL y validaciones sin datos huérfanos', async ({ request }) => {
    const original = medFixture();
    const before = (await apiCall(request,'medicamentos_catalogo')).registros
      .filter(x=>x.nombre_comercial===original.nombre_comercial).length;
    await assertError(request,'medicamentos_guardar',{
      ...original,ingreso_inicial:entryFixture({cantidad:0}),
    },/cantidad|entero/i);
    await assertError(request,'medicamentos_guardar',{
      ...original,ingreso_inicial:entryFixture({fecha_vencimiento:'2020-01-01'}),
    },/vencim|fecha/i);
    expect((await apiCall(request,'medicamentos_catalogo')).registros
      .filter(x=>x.nombre_comercial===original.nombre_comercial)).toHaveLength(before);
    const fx = await createMedicine(request,{first:entryFixture({origen:'INICIAL',cantidad:2})});
    await assertError(request,'medicamentos_ingresar',{
      id_medicamento:fx.id,...entryFixture({origen:'INICIAL'}),
    },/INICIAL|inicial/i);
    await assertError(request,'medicamentos_salida',{
      id_medicamento:fx.id,id_lote:fx.lotId,tipo:'AJUSTE_SALIDA',cantidad:1,
    },/medicamento o un lote/i);
    await assertError(request,'medicamentos_salida',{
      id_medicamento:fx.id,tipo:'AJUSTE_ENTRADA',cantidad:1,
    },/lote expl[ií]cito/i);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(2);
  });

  test('sin tabla auxiliar: dos ingresos explícitos se registran como operaciones independientes', async ({ request }) => {
    // Tras retirar la idempotencia, dos POST confirmados representan DOS ingresos.
    // Este test usa únicamente un medicamento E2E; no reintenta automáticamente en la UI.
    const fx = await createMedicine(request);
    const payload = { id_medicamento: fx.id, ...entryFixture({ cantidad: 7 }) };
    const before = await movementsOf(request, fx.id);

    const first = await apiCall(request, 'medicamentos_ingresar', { method: 'POST', data: payload });
    const second = await apiCall(request, 'medicamentos_ingresar', { method: 'POST', data: payload });

    expect(Number(first.id_lote)).toBeGreaterThan(0);
    expect(Number(second.id_lote)).toBeGreaterThan(0);
    expect(Number(second.id_lote)).not.toBe(Number(first.id_lote));
    expect(Number((await stockOf(request, fx.id)).stock_total)).toBe(fx.first.cantidad + 14);
    expect(Number((await lotOf(request, first.id_lote)).cantidad_disponible)).toBe(7);
    expect(Number((await lotOf(request, second.id_lote)).cantidad_disponible)).toBe(7);

    const after = await movementsOf(request, fx.id);
    expect(after.length - before.length).toBe(2);
  });
});

const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { medFixture, entryFixture, createMedicine, stockOf, movementsOf, assertError } = require('./helpers/medicamentos.helper');

test.describe('Medicamentos sin lotes: stock y bajas', () => {
  test('alta con stock, edición y campos con historial protegidos', async ({request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const item=await stockOf(request,fx.id);
    expect(Number(item.stock_actual)).toBe(4);
    expect(Number(item.tiene_movimientos)).toBe(1);
    expect(item).not.toHaveProperty('lotes');
    const name=`${fx.medicine.nombre_comercial} ACTUALIZADO`;
    await apiCall(request,'medicamentos_guardar',{method:'POST',data:{...fx.medicine,id_medicamento:fx.id,nombre_comercial:name}});
    expect((await stockOf(request,fx.id)).nombre_comercial).toBe(name);
    await assertError(request,'medicamentos_guardar',{...fx.medicine,id_medicamento:fx.id,dosis:'1000 MG'},/movimientos hist[oó]ricos/i);
  });

  test('ingresos acumulados, salidas y prohibición de saldo negativo', async ({request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:3})});
    const entrada=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...entryFixture({cantidad:5})}});
    expect(Number(entrada.id_movimiento)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(8);
    await assertError(request,'medicamentos_salida',{id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:9},/stock insuficiente/i);
    const salida=await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:6,detalle:'PW E2E ENTREGA'}});
    expect(Number(salida.id_movimiento)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(2);
    const hist=await movementsOf(request,fx.id);
    expect(hist.filter(m=>m.tipo==='INGRESO_DONACION')).toHaveLength(2);
    expect(hist.filter(m=>m.tipo==='ENTREGA_DONACION')).toHaveLength(1);
  });

  test('motivo de baja obligatorio, visible y limpieza al reactivar', async ({request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2})});
    await assertError(request,'medicamentos_cambiar_estado',{id_medicamento:fx.id,activo:0},/motivo/i);
    // Un medicamento con stock no puede darse de baja: primero se descarta.
    const conStock=await assertError(request,'medicamentos_cambiar_estado',{id_medicamento:fx.id,activo:0,motivo_baja:'PW E2E SUSPENDIDO POR DECISIÓN ADMINISTRATIVA'},/stock/i);
    expect(conStock.body.codigo).toBe('BAJA_CON_STOCK');
    expect(Number((await stockOf(request,fx.id)).activo)).toBe(1);
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'BAJA_DESCARTE',cantidad:2,detalle:'PW E2E DESCARTE PREVIO A LA BAJA'}});
    await apiCall(request,'medicamentos_cambiar_estado',{method:'POST',data:{id_medicamento:fx.id,activo:0,motivo_baja:'PW E2E SUSPENDIDO POR DECISIÓN ADMINISTRATIVA'}});
    const low=await stockOf(request,fx.id);
    expect(Number(low.activo)).toBe(0);
    expect(low.motivo_baja).toContain('SUSPENDIDO');
    expect(low.fecha_baja).toBeTruthy();
    await assertError(request,'medicamentos_ingresar',{id_medicamento:fx.id,...entryFixture({cantidad:1})},/baja/i);
    await apiCall(request,'medicamentos_cambiar_estado',{method:'POST',data:{id_medicamento:fx.id,activo:1}});
    const reactivated=await stockOf(request,fx.id);
    expect(Number(reactivated.activo)).toBe(1);
    expect(reactivated.motivo_baja).toBeNull();
  });

  test('stock inicial es opcional; una operación INICIAL posterior se rechaza', async ({request}) => {
    const med=medFixture();
    const created=await apiCall(request,'medicamentos_guardar',{method:'POST',data:med});
    expect(Number((await stockOf(request,created.id_medicamento)).stock_actual)).toBe(0);
    await assertError(request,'medicamentos_ingresar',{id_medicamento:created.id_medicamento,...entryFixture({origen:'INICIAL'})},/inicial/i);
    expect(await movementsOf(request,created.id_medicamento)).toHaveLength(0);
  });
});

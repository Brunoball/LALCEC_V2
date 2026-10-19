const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { createMedicine, entryFixture, medioPago, requireAccountingOptions, stockOf, movementsOf, assertError } = require('./helpers/medicamentos.helper');

test.describe('Medicamentos: ingresos, ventas y anulaciones contables', () => {
  test('compra conserva origen, procedencia, costo y asiento de egreso', async ({request}) => {
    await requireAccountingOptions(request,{CATEGORIA_EGRESO:['COMPRA DE MEDICAMENTOS'],CONCEPTO_EGRESO:['COMPRA DE MEDICAMENTOS']});
    const medio=await medioPago(request);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2})});
    const alta=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...entryFixture({origen:'COMPRA',cantidad:3,costo_unitario:'85.50',id_medio_pago:medio,procedencia:'PW E2E FARMACIA'})}});
    const hist=await movementsOf(request,fx.id);
    const compra=hist.find(m=>Number(m.id_movimiento)===Number(alta.id_movimiento));
    expect(compra.tipo).toBe('INGRESO_COMPRA');
    expect(Number(compra.id_egreso_contable)).toBeGreaterThan(0);
    expect(compra.procedencia).toBe('PW E2E FARMACIA');
    expect(Number(compra.costo_unitario)).toBe(85.5);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(5);
  });

  test('venta con asiento, anulación y reingreso compensatorio único', async ({request}) => {
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['VENTA DE MEDICAMENTOS'],CONCEPTO_INGRESO:['VENTA DE MEDICAMENTOS'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],CONCEPTO_EGRESO:['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
    });
    const medio=await medioPago(request);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:7})});
    const result=await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'SALIDA_VENTA',cantidad:3,importe:'200.50',id_medio_pago:medio,detalle:'PW E2E VENTA'}});
    const before=(await movementsOf(request,fx.id)).find(m=>Number(m.id_movimiento)===Number(result.id_movimiento));
    expect(Number(before.id_ingreso_contable)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(4);
    const anulacion=await apiCall(request,'medicamentos_anular',{method:'POST',data:{id_movimiento:result.id_movimiento,id_medio_pago:medio,motivo:'PW E2E REINTEGRO CONFIRMADO A CLIENTE',devolucion_confirmada:true}});
    expect(anulacion.operacion_anulada).toBe('VENTA');
    expect(Number(anulacion.id_contable_compensatorio)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(7);
    expect((await movementsOf(request,fx.id)).find(m=>Number(m.id_movimiento)===Number(anulacion.id_movimiento)).id_movimiento_anulado).toBeTruthy();
    await assertError(request,'medicamentos_anular',{id_movimiento:result.id_movimiento,id_medio_pago:medio,motivo:'PW E2E SEGUNDA ANULACION NO PERMITIDA',devolucion_confirmada:true},/anulada/i);
  });

  test('compra con consumo posterior rechaza anulación potencialmente incorrecta', async ({request}) => {
    await requireAccountingOptions(request,{CATEGORIA_EGRESO:['COMPRA DE MEDICAMENTOS'],CONCEPTO_EGRESO:['COMPRA DE MEDICAMENTOS']});
    const medio=await medioPago(request);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:1})});
    const compra=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...entryFixture({origen:'COMPRA',cantidad:3,costo_unitario:'10.00',id_medio_pago:medio})}});
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'AJUSTE_SALIDA',cantidad:1,detalle:'PW E2E CONSUMO POSTERIOR'}});
    await assertError(request,'medicamentos_anular',{id_movimiento:compra.id_movimiento,id_medio_pago:medio,motivo:'PW E2E ANULACIÓN NO PERMITIDA POR CONSUMO',devolucion_confirmada:true},/consumo/i);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(3);
  });
});

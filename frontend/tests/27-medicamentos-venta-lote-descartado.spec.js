// Nombre heredado: preservado para reemplazar el spec anterior al descomprimir.
const {test,expect}=require('./fixtures/auth.fixture');
const {apiCall,apiResult}=require('./helpers/api.helper');
const {createMedicine,entryFixture,medioPago,requireAccountingOptions,stockOf,movementsOf}=require('./helpers/medicamentos.helper');

test.describe('Medicamentos: venta, descarte y anulación sin lotes',()=>{
  test('anular venta devuelve unidades sin revertir un descarte posterior',async({request})=>{
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['VENTA DE MEDICAMENTOS'],CONCEPTO_INGRESO:['VENTA DE MEDICAMENTOS'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],CONCEPTO_EGRESO:['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
    });
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const medio=await medioPago(request);
    const venta=await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'SALIDA_VENTA',cantidad:2,importe:'40.00',id_medio_pago:medio}});
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{id_medicamento:fx.id,tipo:'BAJA_DESCARTE',cantidad:2,detalle:'PW E2E DESCARTE'}});
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(0);
    const annul=await apiCall(request,'medicamentos_anular',{method:'POST',data:{id_movimiento:venta.id_movimiento,id_medio_pago:medio,motivo:'PW E2E REINTEGRO TOTAL DE VENTA',devolucion_confirmada:true}});
    expect(annul.operacion_anulada).toBe('VENTA');
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(2);
    const moves=await movementsOf(request,fx.id);
    expect(moves.filter(m=>m.tipo==='BAJA_DESCARTE')).toHaveLength(1);
    expect(moves.find(m=>Number(m.id_movimiento)===Number(annul.id_movimiento)).id_movimiento_anulado).toBeTruthy();
    const second=await apiResult(request,'medicamentos_anular',{method:'POST',data:{id_movimiento:venta.id_movimiento,id_medio_pago:medio,motivo:'PW E2E SEGUNDA ANULACION',devolucion_confirmada:true}});
    expect(second.ok).toBe(false);
  });
});

const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { createMedicine, entryFixture, medioPago, requireAccountingOptions,
  stockOf, lotOf, movementsOf } = require('./helpers/medicamentos.helper');

const centavos=n=>Math.round(Number(n)*100);

test.describe('Medicamentos: regresión de anulación con lote original descartado', () => {
  test('venta facturada de lote que después se descartó admite anulación, conserva el descarte y genera un solo egreso', async ({request}) => {
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['VENTA DE MEDICAMENTOS'],
      CONCEPTO_INGRESO:['VENTA DE MEDICAMENTOS'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],
      CONCEPTO_EGRESO:['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
    });
    const medio=await medioPago(request);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const venta=await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_lote:fx.lotId,tipo:'SALIDA_VENTA',cantidad:2,importe:'40.00',
      id_medio_pago:medio,detalle:'PW E2E VENTA CON LOTE DESCARTADO POSTERIORMENTE',
    }});
    expect(venta.id_movimientos).toHaveLength(1);
    const original=(await movementsOf(request,fx.id)).find(m=>Number(m.id_movimiento)===Number(venta.id_movimiento));
    expect(Number(original.id_ingreso_contable)).toBeGreaterThan(0);
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_lote:fx.lotId,tipo:'BAJA_DESCARTE',cantidad:2,
      detalle:'PW E2E DESCARTE DE RESTO DEL LOTE ORIGINAL',
    }});
    expect((await lotOf(request,fx.lotId)).estado).toBe('DESCARTADO');
    const annul=await apiCall(request,'medicamentos_anular',{method:'POST',data:{
      id_movimiento:venta.id_movimiento,id_medio_pago:medio,
      motivo:'PW E2E CLIENTE DEVUELVE MEDICAMENTO, REINTEGRO CONFIRMADO',devolucion_confirmada:true,
    }});
    expect(annul.operacion_anulada).toBe('VENTA');
    expect(annul.movimientos_inversos).toHaveLength(1);
    expect(Number(annul.id_contable_compensatorio)).toBeGreaterThan(0);
    // Un nuevo lote bloqueado recibe lo devuelto, sin reactivar el antiguo.
    expect((await lotOf(request,fx.lotId)).estado).toBe('DESCARTADO');
    const lotes=(await apiCall(request,'medicamentos_lotes',{params:{id_medicamento:fx.id}})).registros;
    const devueltos=lotes.filter(l=>String(l.procedencia||'').includes(`ANULACION VENTA #${original.id_ingreso_contable}`));
    expect(devueltos).toHaveLength(1);
    expect(devueltos[0].estado).toBe('BLOQUEADO');
    expect(Number(devueltos[0].cantidad_disponible)).toBe(2);
    expect(Number((await stockOf(request,fx.id)).stock_utilizable)).toBe(0);
    const asiento=await apiCall(request,'contable_egresos_listar',{
      params:{anio:new Date().getFullYear(),mes:new Date().getMonth()+1},
    });
    const egreso=(asiento.items||[]).find(e=>Number(e.id_egreso)===Number(annul.id_contable_compensatorio));
    expect(egreso).toBeTruthy();
    expect(centavos(egreso.importe)).toBe(4000);
    // Una segunda anulación con otra clave sigue prohibida.
    const { apiResult }=require('./helpers/api.helper');
    const again=await apiResult(request,'medicamentos_anular',{method:'POST',data:{
      id_movimiento:venta.id_movimiento,id_medio_pago:medio,
      motivo:'PW E2E SEGUNDA ANULACION QUE DEBE RECHAZARSE',devolucion_confirmada:true,
    }});
    expect(again.ok).toBe(false);
    expect(again.status).toBeGreaterThanOrEqual(400);
  });
});

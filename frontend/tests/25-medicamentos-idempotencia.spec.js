const { randomUUID } = require('node:crypto');
const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, entryFixture, createBorrower, medioPago, requireAccountingOptions,
  stockOf, movementsOf } = require('./helpers/medicamentos.helper');

const key = () => `med-PWE2E-${randomUUID()}`;

// Las claves son distintas para operaciones independientes. Solo se repite
// expresamente la clave al simular pérdida de respuesta o concurrencia.
test.describe('Medicamentos: idempotencia transaccional y protección de caja/stock', () => {
  test('rechaza POST sin clave y no crea ingreso, lote ni movimiento', async ({ request }) => {
    const fx = await createMedicine(request);
    const before = (await movementsOf(request, fx.id)).length;
    const response = await apiResult(request, 'medicamentos_ingresar', {
      method:'POST', autoIdempotency:false,
      data:{ id_medicamento:fx.id, ...entryFixture({ cantidad:3 }) },
    });
    expect(response.status).toBe(422);
    expect(response.body.codigo).toBe('IDEMPOTENCY_REQUIRED');
    expect((await movementsOf(request, fx.id)).length).toBe(before);
  });

  test('reintento mismo payload/clave no duplica stock y clave con otro payload da conflicto', async ({ request }) => {
    const fx=await createMedicine(request);
    const before=Number((await stockOf(request,fx.id)).stock_total);
    const original={id_medicamento:fx.id,...entryFixture({cantidad:3}),_idempotency_key:key()};
    const a=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:original});
    const b=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{...original}});
    expect(b.id_lote).toBe(a.id_lote);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(before+3);
    expect((await movementsOf(request,fx.id)).filter(m=>Number(m.id_lote)===Number(a.id_lote))).toHaveLength(1);
    const conflict=await apiResult(request,'medicamentos_ingresar',{method:'POST',data:{...original,cantidad:4}});
    expect(conflict.status).toBe(409);
    expect(conflict.body.codigo).toBe('IDEMPOTENCY_CONFLICT');
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(before+3);
  });

  test('dos POST simultáneos con la misma clave ejecutan una sola salida de stock', async ({ request }) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const payload={id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:4,
      detalle:'PW E2E CONCURRENCIA CON MISMA CLAVE',_idempotency_key:key()};
    const [a,b]=await Promise.all([
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
    ]);
    expect(a.ok,JSON.stringify(a.body)).toBe(true);
    expect(b.ok,JSON.stringify(b.body)).toBe(true);
    expect(a.body.id_movimiento).toBe(b.body.id_movimiento);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(2);
    expect((await movementsOf(request,fx.id)).filter(m=>m.tipo==='ENTREGA_DONACION')).toHaveLength(1);
  });

  test('préstamo y cierre reintentados devuelven el mismo resultado, sin duplicar seña ni donación', async ({ request }) => {
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['SEÑAS DE MEDICAMENTOS'],CONCEPTO_INGRESO:['COBRO DE SEÑA'],
    });
    const fx=await createMedicine(request,{first:entryFixture({cantidad:5})});
    const socio=await createBorrower(request);
    const medio=await medioPago(request);
    const body={id_socio:socio.id,items:[{id_lote:fx.lotId,cantidad:2}],
      sena:'40.00',id_medio_pago:medio,observaciones:'PW E2E PRESTAMO IDEMPOTENTE',
      _idempotency_key:key()};
    const first=await apiCall(request,'medicamentos_prestar',{method:'POST',data:body});
    const retry=await apiCall(request,'medicamentos_prestar',{method:'POST',data:body});
    expect(retry.id_prestamo).toBe(first.id_prestamo);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(3);
    const detailBefore=await apiCall(request,'medicamentos_prestamo_detalle',{params:{id:first.id_prestamo}});
    expect(detailBefore.senas.filter(x=>x.tipo==='COBRO_SENA')).toHaveLength(1);
    const closing={id_prestamo:first.id_prestamo,_idempotency_key:key()};
    const closed=await apiCall(request,'medicamentos_cerrar',{method:'POST',data:closing});
    const closedAgain=await apiCall(request,'medicamentos_cerrar',{method:'POST',data:closing});
    expect(closedAgain).toMatchObject({estado:'CERRADO',sena_donada:closed.sena_donada});
    const details=await apiCall(request,'medicamentos_prestamo_detalle',{params:{id:first.id_prestamo}});
    expect(details.senas.filter(x=>x.tipo==='COBRO_SENA')).toHaveLength(1);
    expect(details.senas.filter(x=>x.tipo==='SENA_DONADA')).toHaveLength(1);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(3);
  });
});

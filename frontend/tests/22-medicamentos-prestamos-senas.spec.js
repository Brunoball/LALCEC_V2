const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { createMedicine, entryFixture, createBorrower, medioPago, requireAccountingOptions, stockOf, assertError } = require('./helpers/medicamentos.helper');
const cents=x=>Math.round(Number(x)*100);
const loanDetail=(request,id)=>apiCall(request,'medicamentos_prestamo_detalle',{params:{id}});

test.describe('Medicamentos: préstamos y señas sin lotes',()=>{
  test('préstamo, devolución parcial, reintegro y cierre',async ({request})=>{
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['SEÑAS DE MEDICAMENTOS'],CONCEPTO_INGRESO:['COBRO DE SEÑA'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE SEÑAS'],CONCEPTO_EGRESO:['DEVOLUCIÓN DE SEÑA'],
    });
    const fx=await createMedicine(request,{first:entryFixture({cantidad:9})});
    const borrower=await createBorrower(request);
    const medio=await medioPago(request);
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{id_socio:borrower.id,items:[{id_medicamento:fx.id,cantidad:4}],sena:'80.00',id_medio_pago:medio,observaciones:'PW E2E PRESTAMO'}});
    expect(Number(loan.id_prestamo)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(5);
    let detail=await loanDetail(request,loan.id_prestamo);
    expect(detail.detalle).toHaveLength(1);
    expect(detail.senas.filter(x=>x.tipo==='COBRO_SENA')).toHaveLength(1);
    const id=detail.detalle[0].id_detalle_prestamo;
    await assertError(request,'medicamentos_devolver',{id_detalle_prestamo:id,cantidad:5},/supera/i);
    const returned=await apiCall(request,'medicamentos_devolver',{method:'POST',data:{id_detalle_prestamo:id,cantidad:2,observaciones:'PW E2E DEVOLUCIÓN PARCIAL'}});
    expect(Number(returned.id_devolucion)).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(7);
    detail=await loanDetail(request,loan.id_prestamo);
    expect(Number(detail.detalle[0].cantidad_recibida)).toBe(2);
    await apiCall(request,'medicamentos_sena',{method:'POST',data:{id_prestamo:loan.id_prestamo,tipo:'DEVOLUCION_SENA',monto:'25.00',id_medio_pago:medio}});
    await assertError(request,'medicamentos_sena',{id_prestamo:loan.id_prestamo,tipo:'DEVOLUCION_SENA',monto:'55.01',id_medio_pago:medio},/supera/i);
    const closed=await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:loan.id_prestamo}});
    expect(closed.estado).toBe('CERRADO');
    expect(Number(closed.unidades_sin_devolver)).toBe(2);
    expect(cents(closed.sena_donada)).toBe(5500);
    detail=await loanDetail(request,loan.id_prestamo);
    expect(detail.senas.filter(s=>s.tipo==='SENA_DONADA')).toHaveLength(1);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(7);
  });

  test('préstamo de varios medicamentos y rechazo de repetidos',async ({request})=>{
    const a=await createMedicine(request,{first:entryFixture({cantidad:5})});
    const b=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const socio=await createBorrower(request);
    await assertError(request,'medicamentos_prestar',{id_socio:socio.id,items:[{id_medicamento:a.id,cantidad:1},{id_medicamento:a.id,cantidad:1}],sena:'0'},/repetid/i);
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{id_socio:socio.id,items:[{id_medicamento:a.id,cantidad:2},{id_medicamento:b.id,cantidad:1}],sena:'0'}});
    expect((await loanDetail(request,loan.id_prestamo)).detalle).toHaveLength(2);
    expect(Number((await stockOf(request,a.id)).stock_actual)).toBe(3);
    expect(Number((await stockOf(request,b.id)).stock_actual)).toBe(3);
  });

  test('no permite prestar más stock del disponible',async ({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2})});
    const borrower=await createBorrower(request);
    await assertError(request,'medicamentos_prestar',{id_socio:borrower.id,items:[{id_medicamento:fx.id,cantidad:3}],sena:'0'},/stock insuficiente/i);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(2);
  });
});

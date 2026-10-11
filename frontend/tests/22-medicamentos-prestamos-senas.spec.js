const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const {
  entryFixture, futureIso, medioPago, requireAccountingOptions, createMedicine,
  createBorrower, stockOf, lotOf, assertError,
} = require('./helpers/medicamentos.helper');
const cents = x => Math.round(Number(x)*100);

async function loanDetail(request, id) {
  return apiCall(request,'medicamentos_prestamo_detalle',{params:{id}});
}

test.describe('Medicamentos: préstamos, devoluciones y señas contables', () => {
  test('préstamo con seña, devolución parcial, reintegro y cierre que dona saldo restante sin duplicar caja', async ({ request, page }) => {
    await requireAccountingOptions(request,{
      CATEGORIA_INGRESO:['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO:['COBRO DE SEÑA'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE SEÑAS'], CONCEPTO_EGRESO:['DEVOLUCIÓN DE SEÑA'],
    });
    const medio=await medioPago(request);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:9})});
    const person=await createBorrower(request);
    const created=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{
      id_socio:person.id, items:[{id_lote:fx.lotId,cantidad:4}],
      sena:'80.00',id_medio_pago:medio,observaciones:'PW E2E PRESTAMO CONTROLADO',
    }});
    const id=Number(created.id_prestamo);
    expect(id).toBeGreaterThan(0);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(5);
    let detail=await loanDetail(request,id);
    expect(detail.prestamo.estado).toBe('ABIERTO');
    expect(detail.detalle).toHaveLength(1);
    expect(detail.senas.filter(s=>s.tipo==='COBRO_SENA')).toHaveLength(1);
    expect(cents(detail.senas[0].monto)).toBe(8000);
    const originalIncome=Number(detail.senas[0].id_ingreso_contable);
    expect(originalIncome).toBeGreaterThan(0);
    const detailId=Number(detail.detalle[0].id_detalle_prestamo);
    await assertError(request,'medicamentos_devolver',{
      id_detalle_prestamo:detailId,cantidad:5,fecha_vencimiento:futureIso(200),
    },/supera|pendiente/i);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(5);

    const returned=await apiCall(request,'medicamentos_devolver',{method:'POST',data:{
      id_detalle_prestamo:detailId,cantidad:2,fecha_vencimiento:futureIso(200),
      numero_lote:'PW E2E DEVOLUCION',observaciones:'REINGRESO PARCIAL CONTROLADO',
    }});
    expect(Number(returned.id_lote_recibido)).toBeGreaterThan(0);
    expect(Number((await lotOf(request,returned.id_lote_recibido)).cantidad_disponible)).toBe(2);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(7);
    detail=await loanDetail(request,id);
    expect(Number(detail.detalle[0].cantidad_recibida)).toBe(2);
    await assertError(request,'medicamentos_devolver',{
      id_detalle_prestamo:detailId,cantidad:3,fecha_vencimiento:futureIso(200),
    },/supera|pendiente/i);

    // Además del contrato API, recorrer de punta a punta las dos acciones
    // económicas de la UI y comprobar su persistencia en el detalle.
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(person.person.dni);
    const loansTable=page.getByRole('table',{name:'Préstamos de medicamentos'});
    // El locator `has` es relativo a cada fila; no debe empezar otra vez en la tabla.
    const loanRow=loansTable.getByRole('row').filter({has:page.getByRole('cell',{name:`#${id}`,exact:true})});
    await expect(loanRow).toBeVisible();
    await loanRow.getByRole('button',{name:'Reintegrar seña'}).click();
    const refundModal=page.getByRole('dialog',{name:'Reintegrar seña'});
    await expect(refundModal).toBeVisible();
    await refundModal.getByLabel('Monto a reintegrar ($)').fill('25.00');
    await refundModal.getByLabel('Medio de pago del reintegro').selectOption(String(medio));
    await refundModal.getByRole('button',{name:'Confirmar reintegro'}).click();
    await expect(refundModal).toHaveCount(0);
    expect((await loanDetail(request,id)).senas.filter(x=>x.tipo==='DEVOLUCION_SENA')).toHaveLength(1);

    await expect(loanRow.getByRole('button',{name:'Donar seña a LALCEC'})).toBeVisible();
    await loanRow.getByRole('button',{name:'Donar seña a LALCEC'}).click();
    const donationModal=page.getByRole('dialog',{name:'Registrar donación de seña'});
    await expect(donationModal).toBeVisible();
    await donationModal.getByLabel('Monto que queda como donación ($)').fill('15.00');
    await donationModal.getByLabel('Observaciones').fill('PW E2E DONACION PARCIAL');
    await donationModal.getByRole('button',{name:'Confirmar donación'}).click();
    await expect(donationModal).toHaveCount(0);
    expect((await loanDetail(request,id)).senas.filter(x=>x.tipo==='SENA_DONADA')).toHaveLength(1);
    await assertError(request,'medicamentos_sena',{
      id_prestamo:id,tipo:'DEVOLUCION_SENA',monto:'41.00',id_medio_pago:medio,
    },/supera|pendiente/i);

    const closed=await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:id}});
    expect(closed.estado).toBe('CERRADO');
    expect(Number(closed.unidades_sin_devolver)).toBe(2);
    expect(cents(closed.sena_donada)).toBe(4000);
    detail=await loanDetail(request,id);
    expect(detail.prestamo.estado).toBe('CERRADO');
    expect(detail.senas.filter(s=>s.tipo==='COBRO_SENA')).toHaveLength(1);
    expect(detail.senas.filter(s=>s.tipo==='DEVOLUCION_SENA')).toHaveLength(1);
    expect(detail.senas.filter(s=>s.tipo==='SENA_DONADA')).toHaveLength(2);
    expect(detail.senas.filter(s=>s.tipo==='COBRO_SENA').map(s=>Number(s.id_ingreso_contable)))
      .toEqual([originalIncome]);
    expect(detail.senas.filter(s=>s.tipo==='SENA_DONADA').every(s=>s.id_ingreso_contable===null)).toBe(true);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(7);
    await assertError(request,'medicamentos_cerrar',{id_prestamo:id},/abierto/i);
    await assertError(request,'medicamentos_sena',{id_prestamo:id,tipo:'SENA_DONADA',monto:1},/abierto/i);
    await assertError(request,'medicamentos_devolver',{
      id_detalle_prestamo:detailId,cantidad:1,fecha_vencimiento:futureIso(200),
    },/abierto/i);
  });

  test('préstamo sin seña con varios lotes, rechazo de lote duplicado y cierre sin reingreso artificial', async ({ request }) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:5})});
    const other=entryFixture({cantidad:3});
    await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...other}});
    const lots=(await apiCall(request,'medicamentos_lotes',{params:{id_medicamento:fx.id}})).registros;
    const second=lots.find(l=>l.numero_lote===other.numero_lote);
    const person=await createBorrower(request);
    await assertError(request,'medicamentos_prestar',{
      id_socio:person.id,items:[{id_lote:fx.lotId,cantidad:1},{id_lote:fx.lotId,cantidad:1}],sena:'0',
    },/repit|lote/i);
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{
      id_socio:person.id,sena:'0',items:[{id_lote:fx.lotId,cantidad:2},{id_lote:second.id_lote,cantidad:1}],
    }});
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(5);
    const detail=await loanDetail(request,loan.id_prestamo);
    expect(detail.detalle).toHaveLength(2);
    expect(detail.senas).toHaveLength(0);
    const final=await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:loan.id_prestamo}});
    expect(Number(final.unidades_sin_devolver)).toBe(3);
    expect(cents(final.sena_donada)).toBe(0);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(5);
  });

  test('solo socios E2E pueden recibir préstamos en una corrida protegida', async ({ request }) => {
    const fx=await createMedicine(request);
    const people=await apiCall(request,'medicamentos_socios',{params:{buscar:''}});
    const nonTest=(people.registros||[]).find(x => !String(x.denominacion||'').startsWith('PW E2E') && !String(x.denominacion||'').startsWith('PW EE'));
    if (nonTest) {
      const err=await assertError(request,'medicamentos_prestar',{
        id_socio:nonTest.id_socio,items:[{id_lote:fx.lotId,cantidad:1}],sena:'0',
      },null);
      expect(err.body.codigo).toBe('E2E_SCOPE_BLOCKED');
    }
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(fx.first.cantidad);
  });
});

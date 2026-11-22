const {test,expect}=require('./fixtures/auth.fixture');
const {apiCall,apiResult}=require('./helpers/api.helper');
const {createMedicine,createBorrower,medFixture,entryFixture,futureIso,loanPeople,monthsAgoIso,backdateLoan}=require('./helpers/medicamentos.helper');
const findAlert=async(request,id)=>{
  const response=await apiCall(request,'medicamentos_alertas',{params:{tipo:'PRESTAMO'}});
  return(response.registros||[]).find(x=>Number(x.id_referencia)===Number(id));
};

test.describe('Medicamentos: alertas de vencimiento y devolución de préstamos',()=>{
  test('medicamento con stock próximo a vencer genera alerta y puede descartarse sin modificarlo', async ({ request }) => {
    const due = futureIso(5);
    const outOfWindow = futureIso(35);
    const fx = await createMedicine(request, {
      medicine: medFixture({ fecha_vencimiento: due }),
      first: entryFixture({ cantidad: 2, fecha_vencimiento: due }),
    });
    const distant = await createMedicine(request, {
      medicine: medFixture({ fecha_vencimiento: outOfWindow }),
      first: entryFixture({ cantidad: 2, fecha_vencimiento: outOfWindow }),
    });
    const list = async () => apiCall(request, 'medicamentos_alertas', { params: { tipo: 'MEDICAMENTO' } });
    const all = await list();
    expect(Number(all.umbral_dias)).toBe(30);
    const alert = (all.registros || []).find(a => Number(a.id_referencia) === fx.id);
    expect(alert).toMatchObject({ tipo: 'MEDICAMENTO', fecha_objetivo: due });
    expect(Number(alert.dias_restantes)).toBeGreaterThanOrEqual(4);
    expect(Number(alert.dias_restantes)).toBeLessThanOrEqual(6);
    expect((all.registros || []).some(a => Number(a.id_referencia) === distant.id)).toBe(false);

    const invalid = await apiResult(request, 'medicamentos_descartar_alerta', {
      method: 'POST', data: { tipo: 'MEDICAMENTO', id_referencia: fx.id, fecha_objetivo: futureIso(6) },
    });
    expect(invalid.ok).toBe(false);
    await apiCall(request, 'medicamentos_descartar_alerta', {
      method: 'POST', data: { tipo: 'MEDICAMENTO', id_referencia: fx.id, fecha_objetivo: due },
    });
    expect((await list()).registros.some(a => Number(a.id_referencia) === fx.id)).toBe(false);
    // Descartar una alerta es únicamente visual: no altera stock ni vencimiento.
    const catalog = await apiCall(request, 'medicamentos_catalogo');
    const row = catalog.registros.find(m => Number(m.id_medicamento) === fx.id);
    expect(Number(row.stock_actual)).toBe(2);
    expect(String(row.fecha_vencimiento)).toBe(due);
  });

  test('préstamo con devolución prevista genera aviso, permite descartar por fecha',async({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const socio=await createBorrower(request);
    const due=futureIso(5);
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{id_socio:socio.id,items:[{id_medicamento:fx.id,cantidad:2}],sena:'0',fecha_devolucion_prevista:due}});
    expect(await findAlert(request,loan.id_prestamo)).toMatchObject({tipo:'PRESTAMO',fecha_objetivo:due});
    const stale=await apiResult(request,'medicamentos_descartar_alerta',{method:'POST',data:{tipo:'PRESTAMO',id_referencia:loan.id_prestamo,fecha_objetivo:futureIso(6)}});
    expect(stale.ok).toBe(false);
    await apiCall(request,'medicamentos_descartar_alerta',{method:'POST',data:{tipo:'PRESTAMO',id_referencia:loan.id_prestamo,fecha_objetivo:due}});
    expect(await findAlert(request,loan.id_prestamo)).toBeUndefined();
  });
  test('préstamo sin fecha no muestra alerta y al cerrar desaparece',async({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4})});
    const socio=await createBorrower(request);
    const withoutDate=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{id_socio:socio.id,items:[{id_medicamento:fx.id,cantidad:1}],sena:'0'}});
    expect(await findAlert(request,withoutDate.id_prestamo)).toBeUndefined();
    const due=futureIso(5);
    const withDate=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{id_socio:socio.id,items:[{id_medicamento:fx.id,cantidad:1}],sena:'0',fecha_devolucion_prevista:due}});
    expect(await findAlert(request,withDate.id_prestamo)).toBeTruthy();
    await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:withDate.id_prestamo}});
    expect(await findAlert(request,withDate.id_prestamo)).toBeUndefined();
  });
  test('antigüedad del préstamo: normal antes del mes, amarilla al mes, roja a los 3 meses; descartar amarilla no oculta la roja',async({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const people=loanPeople();
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{...people,items:[{id_medicamento:fx.id,cantidad:3}],sena:'0'}});
    const id=loan.id_prestamo;
    const fila=async()=>(await apiCall(request,'medicamentos_prestamos',{params:{buscar:people.nombre_receptor}})).registros.find(p=>Number(p.id_prestamo)===Number(id));

    // Menos de un mes: sin alerta.
    await backdateLoan(request,id,monthsAgoIso(1,1));
    expect(await findAlert(request,id)).toBeUndefined();
    expect((await fila()).alerta_devolucion).toBeNull();

    // Al cumplir un mes calendario: AMARILLA, una sola alerta para el préstamo.
    // Entrega hace 1 mes y 10 días: la fecha objetivo de la amarilla (entrega + 1 mes)
    // queda en el pasado y nunca coincide con la de la roja que se prueba después.
    // (En uso real la entrega no cambia, así que entrega+1 mes y entrega+3 meses son siempre distintas.)
    const unMes=monthsAgoIso(1,-10);
    await backdateLoan(request,id,unMes);
    let alerta=await findAlert(request,id);
    expect(alerta).toMatchObject({tipo:'PRESTAMO',nivel:'AMARILLA',fecha_entrega:unMes});
    expect(Number(alerta.unidades_pendientes)).toBe(3);
    expect((await fila()).alerta_devolucion).toBe('AMARILLA');
    await apiCall(request,'medicamentos_descartar_alerta',{method:'POST',data:{tipo:'PRESTAMO',id_referencia:id,fecha_objetivo:alerta.fecha_objetivo}});
    expect(await findAlert(request,id)).toBeUndefined();

    // A los tres meses aparece la ROJA aunque la amarilla se haya descartado; nunca ambas.
    await backdateLoan(request,id,monthsAgoIso(3));
    const todas=(await apiCall(request,'medicamentos_alertas',{params:{tipo:'PRESTAMO'}})).registros.filter(x=>Number(x.id_referencia)===Number(id));
    expect(todas).toHaveLength(1);
    expect(todas[0].nivel).toBe('ROJA');
    expect((await fila()).alerta_devolucion).toBe('ROJA');
    // La fecha de la amarilla ya no es vigente para descartar.
    const stale=await apiResult(request,'medicamentos_descartar_alerta',{method:'POST',data:{tipo:'PRESTAMO',id_referencia:id,fecha_objetivo:alerta.fecha_objetivo}});
    expect(stale.ok).toBe(false);

    // Devuelto todo, la alerta desaparece aunque el préstamo siga abierto.
    const det=(await apiCall(request,'medicamentos_prestamo_detalle',{params:{id}})).detalle[0];
    await apiCall(request,'medicamentos_devolver',{method:'POST',data:{id_prestamo:id,items:[{id_detalle_prestamo:det.id_detalle_prestamo,cantidad:3}]}});
    expect(await findAlert(request,id)).toBeUndefined();
    expect((await fila()).alerta_devolucion).toBeNull();
  });

  test('préstamo antiguo sin fecha prevista también alerta y al cerrarlo desaparece',async({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2})});
    const loan=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{...loanPeople(),items:[{id_medicamento:fx.id,cantidad:1}],sena:'0'}});
    await backdateLoan(request,loan.id_prestamo,monthsAgoIso(4));
    expect(await findAlert(request,loan.id_prestamo)).toMatchObject({nivel:'ROJA'});
    await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:loan.id_prestamo}});
    expect(await findAlert(request,loan.id_prestamo)).toBeUndefined();
  });
});

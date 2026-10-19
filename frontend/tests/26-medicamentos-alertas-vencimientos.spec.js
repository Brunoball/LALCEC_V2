const {test,expect}=require('./fixtures/auth.fixture');
const {apiCall,apiResult}=require('./helpers/api.helper');
const {createMedicine,createBorrower,entryFixture,futureIso}=require('./helpers/medicamentos.helper');
const findAlert=async(request,id)=>{
  const response=await apiCall(request,'medicamentos_alertas',{params:{tipo:'PRESTAMO'}});
  return(response.registros||[]).find(x=>Number(x.id_referencia)===Number(id));
};

test.describe('Medicamentos: alertas exclusivamente de devolución de préstamos',()=>{
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
});

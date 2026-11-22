const fs=require('node:fs');
const path=require('node:path');
const { test, expect }=require('./fixtures/auth.fixture');
const { apiCall, apiResult }=require('./helpers/api.helper');
const { createMedicine, createBorrower, entryFixture, stockOf, assertError }=require('./helpers/medicamentos.helper');
const root=path.resolve(__dirname,'..');
const backend=path.resolve(root,'..','backend');

test.describe('Medicamentos: seguridad y protección de datos',()=>{
  test('solicitudes concurrentes no dejan inventario negativo',async ({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const payload={id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:4,detalle:'PW E2E SALIDA EN PARALELO',receptor:'PW E2E RECEPTOR'};
    const [a,b]=await Promise.all([
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
    ]);
    expect([a,b].filter(x=>x.ok)).toHaveLength(1);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(2);
  });
  test('préstamo inválido no afecta stock',async ({request})=>{
    const fx=await createMedicine(request,{first:entryFixture({cantidad:3})});
    const person=await createBorrower(request);
    await assertError(request,'medicamentos_prestar',{id_socio:person.id,items:[{id_medicamento:fx.id,cantidad:4}],sena:'0'},/stock insuficiente/i);
    await assertError(request,'medicamentos_prestar',{id_socio:person.id,items:[{id_medicamento:fx.id,cantidad:0}],sena:'0'},/cantidad|entero/i);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(3);
  });
  test('todas las escrituras de Medicamentos generan claves E2E por API y por UI',()=>{
    // Si se agrega una operación transaccional, ambos adaptadores deben reconocerla:
    // de lo contrario el backend rechaza el POST o quedan solicitudes no limpiables.
    const client=fs.readFileSync(path.join(root,'src/components/Medicamentos/api/medicamentosApi.js'),'utf8');
    const apiHelper=fs.readFileSync(path.join(root,'tests/helpers/api.helper.js'),'utf8');
    const pageFixture=fs.readFileSync(path.join(root,'tests/fixtures/auth.fixture.js'),'utf8');
    const actions=[...client.matchAll(/\bescritura\('(medicamentos_[a-z_]+)'/g)].map(m=>m[1]).sort();
    const apiList=apiHelper.match(/const transactionalMedicationActions = new Set\(\[([\s\S]*?)\]\);/);
    const pageList=pageFixture.match(/new Set\(\[([\s\S]*?)\]\)\.has\(action\)/);
    expect(apiList,'El helper API debe declarar las escrituras con idempotencia').toBeTruthy();
    expect(pageList,'El interceptor UI debe declarar las escrituras con idempotencia').toBeTruthy();
    const fromList=match=>[...match[1].matchAll(/'(medicamentos_[a-z_]+)'/g)].map(m=>m[1]).sort();
    expect(actions).toHaveLength(10);
    expect(fromList(apiList)).toEqual(actions);
    expect(fromList(pageList)).toEqual(actions);
  });
  test('la marca E2E protege operaciones y la limpieza incluye todas las tablas vigentes',()=>{
    const routes=fs.readFileSync(path.join(backend,'modules/medicamentos/routes.php'),'utf8');
    const guard=fs.readFileSync(path.join(backend,'core/e2e_guard.php'),'utf8');
    const cleanup=fs.readFileSync(path.join(backend,'modules/testing_cleanup/testing_cleanup.php'),'utf8');
    // Hay rutas registradas directamente (opciones) y rutas declaradas en los dos foreach.
    // Revisar ambas evita ignorar endpoints nuevos al verificar la protección E2E.
    const direct=[...routes.matchAll(/\$router->register\(\s*'(medicamentos_[^']+)'\s*,/g)].map(x=>x[1]);
    const mapped=[...routes.matchAll(/'([^']+)'\s*=>\s*'[^']+'/g)].map(x=>`medicamentos_${x[1]}`);
    const actions=[...new Set([...direct,...mapped])];
    expect(actions).toHaveLength(24); // 4 rutas de opciones + 20 del módulo (incluye Entregas cobradas de Dolor).
    expect(actions).toContain('medicamentos_entregar');
    expect(direct).toEqual(expect.arrayContaining([
      'medicamentos_opciones', 'medicamentos_opcion_guardar',
      'medicamentos_opcion_estado', 'medicamentos_opcion_eliminar',
    ]));
    const reads=['medicamentos_opciones','medicamentos_alertas','medicamentos_catalogo','medicamentos_historial','medicamentos_entregas','medicamentos_prestamos','medicamentos_prestamo_detalle','medicamentos_socios','medicamentos_procedencias','medicamentos_medios'];
    expect(actions).toContain('medicamentos_entregas');
    for(const action of actions.filter(a=>!reads.includes(a)))expect(guard).toContain(`case '${action}'`);
    for(const table of ['medicamentos','medicamentos_movimientos','medicamentos_prestamos','medicamentos_prestamos_detalle','medicamentos_prestamos_devoluciones','medicamentos_prestamos_senas_movimientos','medicamentos_solicitudes','medicamentos_alertas_descartadas'])expect(cleanup).toContain(`'${table}'`);
    expect(cleanup).not.toContain("'medicamentos_lotes'");
  });
});

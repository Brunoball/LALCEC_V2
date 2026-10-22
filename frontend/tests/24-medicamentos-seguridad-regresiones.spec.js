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
    const payload={id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:4,detalle:'PW E2E SALIDA EN PARALELO'};
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
  test('la marca E2E protege operaciones y la limpieza incluye todas las tablas vigentes',()=>{
    const routes=fs.readFileSync(path.join(backend,'modules/medicamentos/routes.php'),'utf8');
    const guard=fs.readFileSync(path.join(backend,'core/e2e_guard.php'),'utf8');
    const cleanup=fs.readFileSync(path.join(backend,'modules/testing_cleanup/testing_cleanup.php'),'utf8');
    // Hay rutas registradas directamente (opciones) y rutas declaradas en los dos foreach.
    // Revisar ambas evita ignorar endpoints nuevos al verificar la protección E2E.
    const direct=[...routes.matchAll(/\$router->register\(\s*'(medicamentos_[^']+)'\s*,/g)].map(x=>x[1]);
    const mapped=[...routes.matchAll(/'([^']+)'\s*=>\s*'[^']+'/g)].map(x=>`medicamentos_${x[1]}`);
    const actions=[...new Set([...direct,...mapped])];
    expect(actions).toHaveLength(22); // 4 rutas de opciones y 18 rutas del módulo principal.
    expect(direct).toEqual(expect.arrayContaining([
      'medicamentos_opciones', 'medicamentos_opcion_guardar',
      'medicamentos_opcion_estado', 'medicamentos_opcion_eliminar',
    ]));
    const reads=['medicamentos_opciones','medicamentos_alertas','medicamentos_catalogo','medicamentos_historial','medicamentos_prestamos','medicamentos_prestamo_detalle','medicamentos_socios','medicamentos_procedencias','medicamentos_medios'];
    for(const action of actions.filter(a=>!reads.includes(a)))expect(guard).toContain(`case '${action}'`);
    for(const table of ['medicamentos','medicamentos_movimientos','medicamentos_prestamos','medicamentos_prestamos_detalle','medicamentos_prestamos_devoluciones','medicamentos_prestamos_senas_movimientos','medicamentos_solicitudes','medicamentos_alertas_descartadas'])expect(cleanup).toContain(`'${table}'`);
    expect(cleanup).not.toContain("'medicamentos_lotes'");
  });
});

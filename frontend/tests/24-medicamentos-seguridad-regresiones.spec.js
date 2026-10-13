const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const {
  entryFixture, createMedicine, createBorrower, stockOf, lotOf, assertError,
} = require('./helpers/medicamentos.helper');

const root = path.resolve(__dirname, '..');
const backend = path.resolve(root, '..','backend');
const medFolder = path.join(backend,'modules','medicamentos');

// Estas pruebas en vivo son adicionales a la suite general de Socios/Cuotas.
test.describe('Medicamentos: seguridad E2E y regresiones', () => {
  test('dos solicitudes por más stock del disponible no dejan saldo negativo ni ambas escrituras confirmadas', async ({ request }) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const payload={id_medicamento:fx.id,tipo:'ENTREGA_DONACION',cantidad:4,detalle:'PW E2E DOBLE SOLICITUD'};
    const [a,b]=await Promise.all([
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
      apiResult(request,'medicamentos_salida',{method:'POST',data:payload}),
    ]);
    expect([a,b].filter(r=>r.ok)).toHaveLength(1);
    expect([a,b].filter(r=>!r.ok)).toHaveLength(1);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(2);
    expect(Number((await lotOf(request,fx.lotId)).cantidad_disponible)).toBe(2);
  });

  test('saldos/estados no se alteran ante error de devolución o préstamo mal formado', async ({request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const borrower=await createBorrower(request);
    const stock=Number((await stockOf(request,fx.id)).stock_total);
    await assertError(request,'medicamentos_prestar',{
      id_socio:borrower.id,items:[{id_lote:fx.lotId,cantidad:7}],sena:'0',
    },/stock insuficiente/i);
    await assertError(request,'medicamentos_prestar',{
      id_socio:borrower.id,items:[{id_lote:fx.lotId,cantidad:0}],sena:'0',
    },/cantidad|entero/i);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(stock);
    const loans=await apiCall(request,'medicamentos_prestamos',{params:{buscar:borrower.person.dni}});
    expect(loans.registros).toHaveLength(0);
  });

  test('bloquea escritura E2E sin marca en alta de medicamento, sin dejar residuos', async ({request}) => {
    const before=(await apiCall(request,'medicamentos_catalogo')).registros.length;
    const fixture = require('./helpers/medicamentos.helper').medFixture();
    const res=await apiResult(request,'medicamentos_guardar',{method:'POST',data:{
      ...fixture,nombre_comercial:'MEDICAMENTO SIN MARCA DE TEST',ingreso_inicial:entryFixture(),
    }});
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('E2E_SCOPE_BLOCKED');
    const after=(await apiCall(request,'medicamentos_catalogo')).registros.length;
    expect(after).toBe(before);
  });

  test('registro de acciones y limpieza global incluyen explícitamente el módulo sin SQL directo', () => {
    const routes=fs.readFileSync(path.join(medFolder,'routes.php'),'utf8');
    const guard=fs.readFileSync(path.join(backend,'core','e2e_guard.php'),'utf8');
    const cleanup=fs.readFileSync(path.join(backend,'modules','testing_cleanup','testing_cleanup.php'),'utf8');
    const direct=fs.readFileSync(path.join(__dirname,'helpers','db-cleanup.php'),'utf8');
    const actions=[...routes.matchAll(/'([^']+)'=>'[^']+'/g)].map(x=>`medicamentos_${x[1]}`);
    expect(actions).toHaveLength(18);
    for(const action of actions.filter(x=>!['medicamentos_catalogo','medicamentos_lotes',
      'medicamentos_historial','medicamentos_prestamos','medicamentos_prestamo_detalle',
      'medicamentos_socios','medicamentos_procedencias','medicamentos_medios'].includes(x))){
      expect(guard).toContain(`case '${action}'`);
    }
    for(const table of ['medicamentos','medicamentos_lotes','medicamentos_movimientos',
      'medicamentos_prestamos','medicamentos_prestamos_detalle',
      'medicamentos_prestamos_devoluciones','medicamentos_prestamos_senas_movimientos']) {
      expect(cleanup).toContain(`'${table}'`);
    }
    expect(direct).toContain('Limpieza SQL directa deshabilitada');
  });
});

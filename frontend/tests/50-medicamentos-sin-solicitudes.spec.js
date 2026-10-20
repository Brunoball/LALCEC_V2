// Test estático que acompaña al rediseño de Medicamentos sin lotes.
const { test,expect }=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const frontend=process.cwd();
const backend=path.resolve(frontend,'..','backend');
const read=(base,p)=>fs.readFileSync(path.join(base,p),'utf8');

test.describe('Medicamentos: invariantes del módulo simplificado',()=>{
  test('nueve operaciones transaccionales de medicamentos con idempotencia',()=>{
    const gestion=read(backend,'modules/medicamentos/medicamentos_gestion.php');
    const soporte=read(backend,'modules/medicamentos/medicamentos_soporte.php');
    expect((gestion.match(/self::transaccionMed\(/g)||[]).length).toBe(9);
    for(const fragment of ['medicamentos_solicitudes','_idempotency_key','hash_solicitud','respuesta_json','FOR UPDATE','IDEMPOTENCY_CONFLICT'])expect(soporte).toContain(fragment);
    expect(soporte).not.toContain('id_lote');
  });
  test('frontend usa Editar para los movimientos y motivo de baja',()=>{
    const stock=read(frontend,'src/components/Medicamentos/secciones/Stock.jsx');
    const prestamos=read(frontend,'src/components/Medicamentos/secciones/Prestamos.jsx');
    for(const fragment of ['Agregar stock','Restar stock','Guardar medicamento','Motivo de baja','motivo_baja','api.ingresar','api.salida','api.cambiarEstado'])expect(stock).toContain(fragment);
    expect(stock).not.toContain('medicamentos_lotes');
    expect(prestamos).toContain('id_medicamento');
    expect(prestamos).not.toContain('id_lote');
  });
  test('API no expone rutas de lotes y no usa tablas de lotes',()=>{
    const routes=read(backend,'modules/medicamentos/routes.php');
    const consultas=read(backend,'modules/medicamentos/medicamentos_consultas.php');
    const guard=read(backend,'core/e2e_guard.php');
    const cleanup=read(backend,'modules/testing_cleanup/testing_cleanup.php');
    expect(routes).not.toContain("'lotes'");
    for(const file of [routes,consultas,guard,cleanup])expect(file).not.toContain('medicamentos_lotes');
  });
  test('los préstamos conservan señas y alertas por devolución prevista',()=>{
    const gestion=read(backend,'modules/medicamentos/medicamentos_gestion.php');
    const alertas=read(backend,'modules/medicamentos/medicamentos_alertas.php');
    expect(gestion).toContain("'SENA_DONADA'");
    expect(gestion).toContain("['DEVOLUCION_SENA']");
    expect(alertas).toContain("'PRESTAMO'");
    expect(alertas).not.toContain("'LOTE'");
  });
});

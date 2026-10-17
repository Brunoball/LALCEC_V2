// Nombre histórico conservado para sobreescribir el spec obsoleto al instalar el ZIP.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const frontend = process.cwd();
const backend = path.resolve(frontend, '..', 'backend');
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');

test.describe('Medicamentos: contratos de cierre funcional / regresiones de estructura', () => {
  test('las diez escrituras utilizan transacción e idempotencia persistente', () => {
    const gestion = read(backend, 'modules/medicamentos/medicamentos_gestion.php');
    const soporte = read(backend, 'modules/medicamentos/medicamentos_soporte.php');
    expect((gestion.match(/self::transaccionMed\(/g) || []).length).toBe(10);
    for (const marker of ['medicamentos_solicitudes', '_idempotency_key', 'hash_solicitud',
      'respuesta_json', 'FOR UPDATE', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_REQUIRED']) {
      expect(soporte, `Falta protección ${marker}`).toContain(marker);
    }
    expect(soporte).toContain('transaction($db,static function()');
  });

  test('frontend conserva claves al reintentar compras, ventas y préstamos', () => {
    const api = read(frontend, 'src/components/Medicamentos/api/medicamentosApi.js');
    const operacion = read(frontend, 'src/components/Medicamentos/utils/medicamentosOperacion.js');
    for (const marker of ['pendientes = new Map()', '_idempotency_key', 'anterior?.huella',
      'guardar:', 'ingresar:', 'salida:', 'anular:', 'prestar:', 'devolver:', 'cerrar:', 'sena:']) {
      expect(api).toContain(marker);
    }
    expect(operacion).toContain('_idempotency_key');
  });

  test('UI de préstamos tiene cuatro acciones útiles y no ofrece donación manual', () => {
    const prestamos = read(frontend, 'src/components/Medicamentos/secciones/Prestamos.jsx');
    for (const label of ['Información del préstamo', 'Registrar devolución de medicamentos',
      'Reintegrar seña', 'Finalizar préstamo', 'Seña por resolver', 'med-loan-units']) {
      expect(prestamos).toContain(label);
    }
    expect(prestamos).not.toContain('Donar seña a LALCEC');
    expect(prestamos).not.toContain('Registrar donación de seña');
    expect(prestamos).not.toContain("{ label: 'N.º'");
    const gestion = read(backend, 'modules/medicamentos/medicamentos_gestion.php');
    expect(gestion).toContain("['DEVOLUCION_SENA']");
    expect(gestion).toContain("'SENA_DONADA'");
  });

  test('alertas y semáforo están vinculados a las dos secciones', () => {
    const stock=read(frontend,'src/components/Medicamentos/secciones/Stock.jsx');
    const prestamos=read(frontend,'src/components/Medicamentos/secciones/Prestamos.jsx');
    const alerts=read(frontend,'src/components/Medicamentos/alertas/AlertasVencimientos.jsx');
    const css=read(frontend,'src/components/Medicamentos/Medicamentos.css');
    expect(stock).toContain('Referencias de vencimiento');
    expect(stock).toContain('med-expiry-row');
    for (const cssClass of ['is-danger','is-warning','is-safe','is-neutral']) expect(css).toContain(cssClass);
    expect(stock).toContain('tipo="LOTE"');
    expect(prestamos).toContain('tipo="PRESTAMO"');
    for (const phrase of ['Ocultar tarjetas de alertas temporalmente',
      'Descartar alerta definitivamente','api.descartarAlerta']) expect(alerts).toContain(phrase);
    const guard=read(backend,'core/e2e_guard.php');
    const cleanup=read(backend,'modules/testing_cleanup/testing_cleanup.php');
    expect(guard).toContain("case 'medicamentos_descartar_alerta'");
    for (const name of ['medicamentos_alertas_descartadas','medicamentos_solicitudes']) expect(cleanup).toContain(name);
  });
});

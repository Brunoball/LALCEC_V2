const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Ejecutar desde LALCEC_V2/frontend (el backend debe estar en ../backend).
const frontend = process.cwd();
const backend = path.resolve(frontend, '..', 'backend');
function read(base, name) { return fs.readFileSync(path.join(base, name), 'utf8'); }

test.describe('Medicamentos sin tabla auxiliar de solicitudes (código local)', () => {
  test('backend no consulta la tabla ni recibe claves de solicitud', () => {
    const archivos = [
      'modules/medicamentos/medicamentos.php',
      'modules/medicamentos/medicamentos_gestion.php',
      'modules/medicamentos/medicamentos_soporte.php',
      'modules/testing_cleanup/testing_cleanup.php',
    ];
    for (const archivo of archivos) {
      const contenido = read(backend, archivo);
      expect(contenido).not.toContain('medicamentos_solicitudes');
      expect(contenido).not.toContain('_idempotency_key');
    }
  });

  test('los diez movimientos de escritura conservan transacciones', () => {
    const gestion = read(backend, 'modules/medicamentos/medicamentos_gestion.php');
    expect((gestion.match(/self::transaccionMed\(/g) || []).length).toBe(10);
    const soporte = read(backend, 'modules/medicamentos/medicamentos_soporte.php');
    expect(soporte).toContain('transaction($db,static fn(): array => $work($db))');
    expect(soporte).toContain('FOR UPDATE');
  });

  test('frontend no agrega claves de idempotencia al enviar formularios', () => {
    for (const archivo of [
      'src/components/Medicamentos/secciones/Stock.jsx',
      'src/components/Medicamentos/secciones/Prestamos.jsx',
    ]) {
      const contenido = read(frontend, archivo);
      expect(contenido).not.toContain('operacionConClave');
      expect(contenido).not.toContain('_idempotency_key');
      expect(contenido).toContain('guardandoRef.current');
    }
    expect(fs.existsSync(path.join(frontend, 'src/components/Medicamentos/utils/medicamentosOperacion.js'))).toBe(false);
  });
});

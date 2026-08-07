const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(FRONTEND_ROOT, 'src');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'backend');

function walk(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walk(fullPath, predicate));
    else if (predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function testSources() {
  return walk(__dirname, (file) => file.endsWith('.js') && path.basename(file) !== path.basename(__filename))
    .map(read)
    .join('\n');
}

function backendActions() {
  const modulesRoot = path.join(BACKEND_ROOT, 'modules');
  const routeFiles = walk(
    modulesRoot,
    (file) => file.endsWith(`${path.sep}routes.php`) && !file.includes(`${path.sep}whatsapp${path.sep}`),
  );
  return [...new Set(routeFiles.flatMap((file) =>
    [...read(file).matchAll(/register\('([^']+)'/g)].map((match) => match[1]),
  ))].sort();
}

function frontendApiActions() {
  const apiFiles = walk(
    path.join(SRC_ROOT, 'components'),
    (file) => /Api\.js$/i.test(file) && !file.includes(`${path.sep}BotPanel${path.sep}`),
  );
  const backend = new Set(backendActions());
  return [...new Set(apiFiles.flatMap((file) =>
    [...read(file).matchAll(/["']([a-z][a-z0-9_]+)["']/g)]
      .map((match) => match[1])
      .filter((action) => backend.has(action)),
  ))].sort();
}

function applicationRoutes() {
  const appSource = read(path.join(SRC_ROOT, 'App.js'));
  return [...new Set(
    [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((route) => route !== '*' && route !== '/panel-bot'),
  )].sort();
}

const REQUIRED_UI_ACTION_MARKERS = [
  'Abrir menú',
  'Un clic para desplegar; doble clic para ingresar',
  'Abrir configuración',
  'Limpiar búsqueda',
  'Anterior',
  'Siguiente',
  'Exportar',
  'Excel',
  'PDF',
  'Nuevo socio',
  'Nueva empresa',
  'Nueva familia',
  'Ver ficha e historial',
  'Ver integrantes e historial',
  'Editar',
  'Dar de baja',
  'Reactivar',
  'Eliminar definitivamente',
  'Nueva categoría',
  'Nuevo descuento',
  'Ver historial de precios',
  'Nuevo usuario',
  'Registrar ingreso',
  'Registrar egreso',
  'Agregar opción',
  'Anular',
  'Elegir archivo',
  'Quitar comprobante',
  'Ver comprobante',
  'Selección múltiple',
  'Registrar pago',
  'Registrar 2 pagos',
  'Aplicar pago a todo el grupo familiar',
  'Ver integrantes',
  'Hay cuotas ya pagadas en la selección.',
  'Monto personalizado',
  '+ Agregar',
  'Imprimir',
  'Comprobante',
  'PDF',
  'Eliminar pago',
];

test.describe('Contrato de cobertura total fuera del panel del bot', () => {
  test('el arranque del frontend no vuelve a envolver la aplicación en React.StrictMode', () => {
    const indexSource = read(path.join(SRC_ROOT, 'index.js'));
    expect(indexSource).not.toContain('<React.StrictMode>');
    expect(indexSource).not.toContain('</React.StrictMode>');
  });

  test('conserva las optimizaciones de respuesta de modales y Cuotas', () => {
    const modalSizeHook = read(
      path.join(SRC_ROOT, 'components', 'Global', 'Modales', 'useAnimatedModalSize.js'),
    );
    const cuotasSource = read(path.join(SRC_ROOT, 'components', 'Cuotas', 'Cuotas.jsx'));
    const cuotasApiSource = read(
      path.join(SRC_ROOT, 'components', 'Cuotas', 'api', 'cuotasApi.js'),
    );
    const cuotasModalCss = read(
      path.join(SRC_ROOT, 'components', 'Cuotas', 'modales', 'CuotasModal.css'),
    );

    expect(modalSizeHook).not.toContain('.animate(');
    expect(cuotasSource).toContain('React.memo(function CuotasTableRows');
    expect(cuotasSource).toContain('cuotasApi.contextosPago');
    expect(cuotasApiSource).toContain('cuotas_contextos_pago');
    expect(cuotasModalCss).toContain('width: min(100%, 190px)');
  });

  test('cada acción registrada por el backend aparece cubierta por la suite', () => {
    expect(fs.existsSync(BACKEND_ROOT), `No se encontró el backend en ${BACKEND_ROOT}`).toBe(true);
    const source = testSources();
    const missing = backendActions().filter((action) => !source.includes(action));
    expect(missing, `Acciones backend sin cobertura declarada: ${missing.join(', ')}`).toEqual([]);
  });

  test('cada acción usada por el frontend existe en el backend y está cubierta', () => {
    const backend = backendActions();
    const frontend = frontendApiActions();
    const source = testSources();
    expect(frontend.filter((action) => !backend.includes(action))).toEqual([]);
    expect(frontend.filter((action) => !source.includes(action))).toEqual([]);
  });

  test('todas las rutas de la aplicación, excepto el panel del bot, están recorridas', () => {
    const source = testSources();
    const missing = applicationRoutes().filter((route) => !source.includes(route));
    expect(missing, `Rutas sin prueba: ${missing.join(', ')}`).toEqual([]);
  });

  test('las acciones visibles principales tienen un recorrido E2E declarado', () => {
    const source = testSources();
    const missing = REQUIRED_UI_ACTION_MARKERS.filter((marker) => !source.includes(marker));
    expect(missing, `Acciones visuales sin prueba: ${missing.join(', ')}`).toEqual([]);
  });
});

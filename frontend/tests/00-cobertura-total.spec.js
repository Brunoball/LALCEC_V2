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

function scenarioSources() {
  return walk(__dirname, (file) => {
    const name = path.basename(file);
    return (
      name !== path.basename(__filename) &&
      (name.endsWith('.spec.js') || name === 'auth.setup.js' || name === 'auth.teardown.js')
    );
  })
    .map(read)
    .join('\n');
}

function specFiles() {
  return walk(__dirname, (file) => file.endsWith('.spec.js'));
}

function declaredTestCount() {
  return specFiles().reduce(
    (total, file) => total + [...read(file).matchAll(/\btest\s*\(\s*['"`]/g)].length,
    0,
  );
}

function backendActions() {
  const modulesRoot = path.join(BACKEND_ROOT, 'modules');
  const routeFiles = walk(
    modulesRoot,
    (file) => file.endsWith(`${path.sep}routes.php`) && !file.includes(`${path.sep}whatsapp${path.sep}`),
  );
  const moduleActions = routeFiles.flatMap((file) =>
    [...read(file).matchAll(/register\('([^']+)'/g)].map((match) => match[1]),
  );
  const rootApiFile = path.join(BACKEND_ROOT, 'routes', 'api.php');
  const rootActions = fs.existsSync(rootApiFile)
    ? [...read(rootApiFile).matchAll(/register\('([^']+)'/g)].map((match) => match[1])
    : [];
  return [...new Set([...moduleActions, ...rootActions])].sort();
}

function frontendApiActions() {
  const frontendFiles = walk(
    SRC_ROOT,
    (file) => /\.(?:js|jsx)$/i.test(file) && !file.includes(`${path.sep}BotPanel${path.sep}`),
  );
  const backend = new Set(backendActions());
  return [...new Set(frontendFiles.flatMap((file) =>
    [...read(file).matchAll(/["']([a-z][a-z0-9_]+)["']/g)]
      .map((match) => match[1])
      .filter((action) => backend.has(action)),
  ))].sort();
}


function hasExecutableActionReference(source, action) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    // Llamadas API directas de los escenarios y helpers de contrato.
    new RegExp(`(?:apiCall|apiResult|expectApiError)\\s*\\([^\\n]{0,220}["']${escaped}["']`),
    // Acciones incluidas en matrices/tuplas que luego se recorren y ejecutan.
    new RegExp(`[\\[, ]\\s*["']${escaped}["']\\s*,`),
    // Esperas/intercepciones de requests reales desde la UI.
    new RegExp(`action=${escaped}(?:&|["'\`?/])`),
    new RegExp(`(?:===|==)\\s*["']${escaped}["']`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}


function hasExecutableRouteReference(source, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`page\\.goto\\(\\s*["']${escaped}["']`),
    new RegExp(`[\\[,\\n]\\s*["']${escaped}["']\\s*,`),
    new RegExp(`toHaveURL\\([^\\n]{0,140}${escaped}`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}


function botFrontendEndpoints() {
  // El contador verde/rojo del botón del bot vive en Principal, fuera de BotPanel.
  // Escanear todo src evita que panel_unread_total (u otro uso futuro del API del bot)
  // quede invisible para el contrato de cobertura.
  const botFiles = walk(SRC_ROOT, (file) => /\.(?:js|jsx)$/i.test(file));
  const source = botFiles.map(read).join('\n');
  return [...new Set(
    [...source.matchAll(/bot(?:Panel|Management)(?:Get|Post|FormPost)\s*\(\s*["']([^"']+)/g)]
      .map((match) => match[1]),
  )].sort();
}

function applicationRoutes() {
  const appSource = read(path.join(SRC_ROOT, 'App.js'));
  const routes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((route) => route !== '*');

  // El Panel Bot usa una constante en App.js, por eso no entra en el regex literal.
  // Resolverla desde config evita que /panel-bot quede fuera de la cobertura de navegación.
  if (appSource.includes('path={BOT_PANEL_ROUTE}')) {
    const configPath = path.join(SRC_ROOT, 'config', 'config.jsx');
    if (fs.existsSync(configPath)) {
      const configSource = read(configPath);
      const match = configSource.match(/export const BOT_PANEL_ROUTE\s*=\s*["']([^"']+)/);
      if (match?.[1]) routes.push(match[1]);
    }
  }

  return [...new Set(routes)].sort();
}


const E2E_INFRA_ACTIONS = new Set([
  'e2e_auditoria',
  'e2e_cleanup',
  'e2e_cleanup_scope',
  'e2e_saldo_favor_fixture',
  'e2e_guard_probe',
  'e2e_snapshot',
  'e2e_status',
]);

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
  'Medio de pago',
  'Estado de cuotas',
  'Avisos',
  'AL DÍA',
  'DEBE 1-2 MESES',
  'DEBE 3 MESES O MÁS',
  'CON AVISO',
  'SIN AVISO',
  'Referencia de estado de pago',
  'Nueva familia',
  'Ver ficha e historial',
  'Ver integrantes e historial',
  'Ver motivo completo',
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
  'Seleccionando todos los registros filtrados',
  'Registrar pago',
  'Condonar cuota',
  'Condonados',
  'Saldos a favor',
  'Agregar saldo',
  'Editar saldo a favor',
  'Eliminar saldo a favor',
  'Saldo a favor disponible',
  'Usar saldo a favor en este pago',
  'Saldo aplicado',
  'A cobrar ahora',
  'Eliminar condonación',
  'Registrar 2 pagos',
  'Aplicar pago a todo el grupo familiar',
  'Ver integrantes',
  'Hay cuotas ya pagadas en la selección.',
  'Monto personalizado',
  'Desc. familiar',
  'Secciones del pago',
  'Datos del pago',
  '+ Agregar',
  'Imprimir',
  'Comprobante',
  'ArrowRight',
  'is-size-transitioning',
  'mov-row--skeleton',
  'No se pudo conectar con el servidor. Intentá nuevamente.',
  'PDF',
  'Eliminar pago',
  // Cabecera/perfil.
  'Abrir perfil',
  'Cerrar perfil',
  'Perfil de usuario',
  'Ir al inicio de sesión',
  // Cobertura de ramas que antes quedaban fuera del recorrido E2E.
  'Quitar integrante',
  'Motivo de desvinculación',
  'Exportar cuotas',
  'Exportar página actual',
  'Exportar todos los resultados',
  'Imprimir todos',
  'Seleccionar meses',
  'Deseleccionar todos',
  'Paginación de ingresos',
  'Paginación de egresos',
  'Detalle mensual contable',
  'health',
  // Panel Bot WhatsApp.
  'Panel Bot WhatsApp',
  'Buscar por nombre, número, mensaje…',
  'Abrir reportes del bot',
  'Reportes del Bot',
  'Período del reporte',
  'Resumen',
  'Actividad',
  'Pagos',
  'Costos WhatsApp',
  'Filtrar por etiqueta',
  'Sin etiqueta',
  'Modo Bot',
  'Modo Manual',
  'Opciones del chat',
  'Editar nombre',
  'Cambiar etiqueta',
  'Crear etiqueta',
  'Eliminar etiqueta',
  'Ver galería',
  'Ver imagen',
  'Marcar como no leído',
  'Marcar como leído',
  'Vaciar chat',
  'Eliminar contacto',
  'Cambiar tema',
  'Adjuntar imagen/PDF',
  'quitar',
  'Emojis',
  'Enviar',
  'Mensajes de prioridad alta',
  'Consultas atendidas',
  'Notificaciones normales:',
  'Notificaciones urgentes:',
  'Ventana 24 horas',
];

const REQUIRED_BOT_MUTATION_ASSERTIONS = [
  'panel_mark_seen',
  'panel_mark_unread',
  'panel_set_modo',
  'panel_send',
  'panel_send_media',
  'editar_nombre',
  'etiquetas_set',
  'etiquetas_create',
  'etiquetas_update',
  'etiquetas_delete',
  'vaciar_chat',
  'eliminar_contacto',
];

// Alcance intencional: sistema administrativo completo + Panel Bot.
// La lógica conversacional interna del chatbot se valida manualmente fuera de Playwright.
test.describe('Contrato de cobertura total del sistema y del Panel Bot', () => {
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
    const cuotasHookSource = read(
      path.join(SRC_ROOT, 'components', 'Cuotas', 'hooks', 'useCuotas.js'),
    );
    const cuotasModalCss = read(
      path.join(SRC_ROOT, 'components', 'Cuotas', 'modales', 'CuotasModal.css'),
    );
    const cuotasPaymentModal = read(
      path.join(SRC_ROOT, 'components', 'Cuotas', 'modales', 'ModalPagoCuota.jsx'),
    );
    const comprobantePagoSource = read(
      path.join(SRC_ROOT, 'components', '_shared', 'utils', 'comprobantePago.js'),
    );
    const apiHelperSource = read(path.join(__dirname, 'helpers', 'api.helper.js'));
    const authFixtureSource = read(path.join(__dirname, 'fixtures', 'auth.fixture.js'));

    expect(modalSizeHook).not.toContain('.animate(');
    expect(cuotasSource).toContain('React.memo(function CuotasTableRows');
    expect(cuotasSource).toContain('cuotasApi.contextosPago');
    expect(cuotasSource).toContain('cargarTotalesEstado');
    expect(cuotasSource).toContain('toggleAllFilteredPayments');
    expect(cuotasSource).toContain('id_medio_pago');
    expect(cuotasApiSource).toContain('cuotas_contextos_pago');
    expect(cuotasApiSource).toContain('cuotas_saldos_favor');
    expect(cuotasApiSource).toContain('cuotas_ajustar_saldo_favor');
    expect(cuotasHookSource).toContain('incluir_catalogos: 0');
    expect(cuotasHookSource).toContain('cuotasApi.catalogos');
    expect(cuotasModalCss).toContain('.cuotas-modal--payment.entity-modal');
    expect(cuotasModalCss).toContain('width: min(920px, 100%)');
    expect(cuotasSource).not.toContain('handlePrintRegister');
    expect(cuotasSource).not.toContain('cuotas-register-action');

    // Todo camino de impresión/comprobante de Cuotas debe delegar al util compartido.
    // Así evitamos que vuelva a existir un HTML/CSS alternativo dentro de Cuotas.jsx.
    expect(cuotasSource).toContain('from "../_shared/utils/comprobantePago"');
    expect(cuotasSource).toContain('printPaymentReceiptsBatch');
    expect(cuotasSource).toContain('openPaymentReceipt');
    expect(cuotasSource).toContain('downloadPaymentReceiptPdf');
    expect(cuotasSource).not.toContain('LEGACY_RECEIPT_STYLES');
    expect(cuotasSource).not.toContain('gcuotas-talon-socio');
    expect(cuotasSource).not.toContain('gcuotas-talon-cobrador');

    // El formato visual y el HTML de ambos talones viven en un único archivo.
    expect(comprobantePagoSource).toContain('const LEGACY_RECEIPT_STYLES');
    expect(comprobantePagoSource).toContain('const legacyReceiptBodyHtml');
    expect(comprobantePagoSource).toContain('const legacyReceiptDocumentHtml');
    expect(comprobantePagoSource).toContain('gcuotas-talon-socio');
    expect(comprobantePagoSource).toContain('gcuotas-talon-cobrador');
    expect(comprobantePagoSource).toContain('export const printPaymentReceiptsBatch');
    expect(comprobantePagoSource).toContain('export const openPaymentReceipt');
    expect(comprobantePagoSource).toContain('export const downloadPaymentReceiptPdf');
    expect(comprobantePagoSource).toContain('legacyReceiptDocumentHtml({');
    expect(comprobantePagoSource).toContain('Categoría / Monto abonado:');
    expect(comprobantePagoSource).toContain('Saldo a favor aplicado:');
    expect(comprobantePagoSource).toContain('Total de cuotas:');
    expect(comprobantePagoSource).toContain('data.periods.join(", ")');

    expect(cuotasPaymentModal).toContain('unavailable && !paid');
    expect(cuotasModalCss).toContain('border: 1px solid #16a34a !important');
    expect(apiHelperSource).toContain('async function ensureAuthSession');
    expect(apiHelperSource).toContain('await ensureAuthSession(requestContext)');
    expect(authFixtureSource).toContain('await ensureAuthSession(request)');
  });

  test('la huella E2E de sesiones ignora solamente el heartbeat ultimo_uso y conserva los campos sensibles', () => {
    const cleanupSource = read(
      path.join(BACKEND_ROOT, 'modules', 'testing_cleanup', 'testing_cleanup.php'),
    );
    const sessionSnapshot = cleanupSource.match(
      /'sis_sesiones'\s*=>\s*"([^"]+)"/,
    );

    expect(sessionSnapshot, 'No se encontró la consulta de huella para sis_sesiones.').not.toBeNull();
    const sql = sessionSnapshot[1];

    // El heartbeat cambia por uso legítimo del sistema y no debe producir falsos positivos.
    expect(sql).not.toContain('ultimo_uso');
    expect(sql).not.toContain('SELECT s.*');

    // Todo lo que sí puede afectar seguridad/autenticación permanece dentro de la huella.
    for (const field of [
      's.idSesion',
      's.session_key',
      's.idUsuario',
      's.expira_en',
      's.ip',
      's.user_agent',
      's.activo',
    ]) {
      expect(sql, `La huella de sis_sesiones dejó de proteger ${field}.`).toContain(field);
    }
  });

  test('cada acción funcional registrada por el backend administrativo, incluido health, aparece cubierta por la suite', () => {
    expect(fs.existsSync(BACKEND_ROOT), `No se encontró el backend en ${BACKEND_ROOT}`).toBe(true);
    const source = scenarioSources();
    const missing = backendActions()
      .filter((action) => !E2E_INFRA_ACTIONS.has(action))
      .filter((action) => !hasExecutableActionReference(source, action));
    expect(missing, `Acciones backend sin cobertura declarada: ${missing.join(', ')}`).toEqual([]);
  });

  test('la infraestructura E2E registrada por el backend está ejercitada por setup, teardown o helpers', () => {
    const backend = new Set(backendActions());
    const source = testSources();
    const registered = [...E2E_INFRA_ACTIONS].filter((action) => backend.has(action));
    const missing = registered.filter((action) => !source.includes(action));
    expect(missing, `Infraestructura E2E sin uso declarado: ${missing.join(', ')}`).toEqual([]);
  });

  test('la suite conserva su piso de escenarios y no permite pruebas deshabilitadas o exclusivas', () => {
    const disabled = specFiles().flatMap((file) => {
      const source = read(file);
      return /\btest(?:\.describe)?\.(?:only|skip|fixme)\s*\(/.test(source)
        ? [path.relative(__dirname, file)]
        : [];
    });

    expect(disabled, `Specs deshabilitados o exclusivos: ${disabled.join(', ')}`).toEqual([]);
    expect(declaredTestCount(), 'La suite perdió escenarios E2E declarados.').toBeGreaterThanOrEqual(135);
  });


  test('los cambios recientes de pagos, concurrencia y socios eliminados conservan cobertura de regresión explícita', () => {
    const sociosGestion = read(
      path.join(BACKEND_ROOT, 'modules', 'socios', 'socios_gestion.php'),
    );
    const sociosConsultas = read(
      path.join(BACKEND_ROOT, 'modules', 'socios', 'socios_consultas.php'),
    );
    const familiasConsultas = read(
      path.join(BACKEND_ROOT, 'modules', 'socios', 'familias_consultas.php'),
    );
    const cuotasBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'cuotas', 'cuotas.php'),
    );
    const contableBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'contable', 'contable_consultas.php'),
    );
    const discountsBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'categorias', 'descuentos_familiares.php'),
    );
    const categoriasBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'categorias', 'categorias_consultas.php'),
    );
    const dashboardBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'dashboard', 'dashboard.php'),
    );
    const cleanupBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'testing_cleanup', 'testing_cleanup.php'),
    );

    for (const marker of [
      'INSERT INTO socios_eliminados',
      'UPDATE socios_personas SET dni = NULL',
      'UPDATE socios_empresas SET cuit = NULL',
      'vinculos_familiares_cerrados',
      'auditoria_registrada',
      'Pagos e historial fueron preservados',
    ]) {
      expect(sociosGestion, `Falta blindaje de eliminación histórica: ${marker}`).toContain(marker);
    }
    expect(sociosGestion).not.toContain('DELETE FROM pagos WHERE id_socio');
    expect(sociosGestion).not.toContain('DELETE FROM socios_historial_estados WHERE id_socio');

    for (const marker of [
      'impacto_eliminacion',
      'pagos_inscripciones',
      'vinculos_familiares',
      'total_relaciones',
    ]) {
      expect(sociosConsultas, `Falta impacto histórico de socios: ${marker}`).toContain(marker);
    }

    for (const marker of [
      'LEFT JOIN socios_eliminados sdel',
      'socio_eliminado',
      'historial_integrantes',
    ]) {
      expect(familiasConsultas, `Falta trazabilidad familiar histórica: ${marker}`).toContain(marker);
    }

    for (const marker of [
      'tipo_pago',
      'porcentaje_descuento_familiar',
      "MONTO_PERSONALIZADO",
      "DESCUENTO_FAMILIAR",
      'PAGO_SOCIO_ELIMINADO_PROTEGIDO',
      'COTIZACION_MODIFICADA',
      'FAMILIA_MODIFICADA',
      'monto_saldo_favor_aplicado',
      'APLICACION_PAGO',
      'REVERSO',
      'SALDO_FAVOR_PAGO_FAMILIAR',
      'SALDO_FAVOR_MULTIPLES_SOCIOS',
      'FOR UPDATE',
    ]) {
      expect(cuotasBackend, `Falta blindaje reciente de Cuotas: ${marker}`).toContain(marker);
    }

    for (const marker of [
      'LEFT JOIN socios_eliminados sdel',
      'p.tipo_pago',
      'p.porcentaje_descuento_familiar',
      'p.monto_saldo_favor_aplicado',
      "sf.tipo = 'SOBRANTE'",
      'SALDO_FAVOR_SOBRANTE',
      'sdel.documento',
    ]) {
      expect(contableBackend, `Falta trazabilidad contable reciente: ${marker}`).toContain(marker);
    }

    expect(discountsBackend).toContain('bloquearCatalogoDescuentosFamiliares');
    expect(discountsBackend).toContain('FOR UPDATE');
    expect(categoriasBackend).toContain('filtro_socios_no_eliminados');
    expect(dashboardBackend).toContain('filtro_socios_no_eliminados');
    expect(cleanupBackend).toContain("'socios_eliminados'");
    expect(cleanupBackend).toContain("'saldos_favor_movimientos'");
    expect(cleanupBackend).toContain('saldoFavorFixture');

    const archiveSpec = read(path.join(__dirname, '17-socios-eliminacion-trazabilidad.spec.js'));
    for (const marker of [
      'archiva PERSONA, preserva varios pagos normales, libera DNI',
      'archiva EMPRESA con MONTO_PERSONALIZADO',
      'serializa la carrera eliminar socio vs eliminar pago',
      'preserva DESCUENTO_FAMILIAR al eliminar un integrante',
      'SOCIO_INVALIDO',
      'socios_historial',
      'e2eStatus',
      'auditoria_registrada',
      'PAGO_SOCIO_ELIMINADO_PROTEGIDO',
      'categorias_obtener',
      'familias_obtener',
      'contable_ingresos_socios',
    ]) {
      expect(archiveSpec, `La regresión de socios eliminados dejó de cubrir: ${marker}`).toContain(marker);
    }

    const cuotasSpec = read(path.join(__dirname, '09-cuotas.spec.js'));
    for (const marker of [
      'serializa dos cobros concurrentes del mismo período',
      'monto personalizado familiar se aplica a cada integrante',
      'DESCUENTO_FAMILIAR',
      'MONTO_PERSONALIZADO',
      'conserva montos históricos por vigencia real',
    ]) {
      expect(cuotasSpec, `La regresión de pagos dejó de cubrir: ${marker}`).toContain(marker);
    }

    const discountSpec = read(path.join(__dirname, '08-categorias.spec.js'));
    expect(discountSpec).toContain('serializa altas concurrentes de descuentos');
    expect(discountSpec).toContain('DESCUENTO_FAMILIAR_DUPLICADO');

    const cuotasUiSpec = read(path.join(__dirname, '13-cuotas-ui-completa.spec.js'));
    expect(cuotasUiSpec).toContain('monto personalizado mantiene seleccionado el pago familiar');

    const balanceSpec = read(path.join(__dirname, '18-saldos-favor.spec.js'));
    for (const marker of [
      'acredita un SOBRANTE, lo aplica parcialmente y Contable no cuenta la plata dos veces',
      'si el saldo cubre toda la cuota no registra dinero nuevo y conserva el remanente',
      'serializa dos cobros concurrentes y nunca permite gastar más saldo del disponible',
      'la eliminación definitiva preserva el saldo y lo mantiene trazable en Saldos a favor',
      'SALDO_FAVOR_PAGO_FAMILIAR',
      'SALDO_FAVOR_MULTIPLES_SOCIOS',
      'Saldo a favor disponible',
      'Saldos a favor de socios',
    ]) {
      expect(balanceSpec, `La regresión de saldos a favor dejó de cubrir: ${marker}`).toContain(marker);
    }

    const contableUiSpec = read(path.join(__dirname, '12-contabilidad-ui-completa.spec.js'));
    expect(contableUiSpec).toContain('Monto personalizado');
    expect(contableUiSpec).toContain('Desc. familiar 12,5%');

    const complementarySpec = read(path.join(__dirname, '19-cobertura-complementaria.spec.js'));
    for (const marker of [
      'ciclo completo de categoría',
      'DESCUENTO_FAMILIAR_HISTORICO',
      'RANGO_INTEGRANTES_INVALIDO',
      'VIGENCIA_DESCUENTO_INVALIDA',
      'condona una cuota por API',
      'PAGO_YA_REGISTRADO',
      'Cuotas mantiene filtros separados con sidebar expandido',
      'Motivo opcional del ajuste...',
    ]) {
      expect(complementarySpec, `La cobertura complementaria dejó de cubrir: ${marker}`).toContain(marker);
    }
  });

  test('los filtros y el semáforo de deuda de Socios/Empresas conservan su contrato frontend-backend', () => {
    const sociosSource = read(path.join(SRC_ROOT, 'components', 'Socios', 'Socios.jsx'));
    const sociosCss = read(path.join(SRC_ROOT, 'components', 'Socios', 'Socios.css'));
    const sociosBackend = read(
      path.join(BACKEND_ROOT, 'modules', 'socios', 'socios_consultas.php'),
    );

    for (const marker of [
      'key: "medio_pago"',
      'key: "estado_cuota"',
      'key: "recordatorio"',
      'AL DÍA',
      'DEBE 1-2 MESES',
      'DEBE 3 MESES O MÁS',
      'CON AVISO',
      'SIN AVISO',
      'data-payment-status',
      'Referencia de estado de pago',
    ]) {
      expect(sociosSource, `Falta contrato UI de Socios/Empresas: ${marker}`).toContain(marker);
    }

    for (const marker of [
      '.socios-payment-health-row.is-paid-up::before',
      '.socios-payment-health-row.is-warning::before',
      '.socios-payment-health-row.is-danger::before',
      '.socios-payment-health-legend',
      '.socios-payment-health-legend i.is-paid-up',
      '.socios-payment-health-legend i.is-warning',
      '.socios-payment-health-legend i.is-danger',
    ]) {
      expect(sociosCss, `Falta estilo del semáforo de deuda: ${marker}`).toContain(marker);
    }

    for (const marker of [
      "$filters['medio_pago']",
      "$filters['recordatorio']",
      "$filters['estado_cuota']",
      "s.enviar_recordatorio = 1",
      "s.enviar_recordatorio = 0",
      'BETWEEN 1 AND 2',
      '>= 3',
      'cuotas_pendientes',
      "estado_cuota_label'] = 'AL DÍA'",
      "estado_cuota_label'] = 'DEBE 1-2 MESES'",
      "estado_cuota_label'] = 'DEBE 3 MESES O MÁS'",
    ]) {
      expect(sociosBackend, `Falta contrato backend del filtro de deuda/avisos: ${marker}`).toContain(marker);
    }
  });

  test('cada acción usada por el frontend administrativo existe en el backend y está cubierta', () => {
    const backend = backendActions();
    const frontend = frontendApiActions();
    const source = scenarioSources();
    expect(frontend.filter((action) => !backend.includes(action))).toEqual([]);
    expect(frontend.filter((action) => !hasExecutableActionReference(source, action))).toEqual([]);
  });

  test('cada endpoint usado por el Panel Bot tiene cobertura declarada', () => {
    const source = testSources();
    const missing = botFrontendEndpoints().filter((endpoint) => !source.includes(endpoint));
    expect(missing, `Endpoints del Panel Bot sin cobertura declarada: ${missing.join(', ')}`).toEqual([]);
  });

  test('cada mutación del Panel Bot se verifica dentro de un escenario y no sólo en los mocks', () => {
    const botSpec = read(path.join(__dirname, '14-panel-bot.spec.js'));
    const scenarioStart = botSpec.indexOf("test.describe('Panel Bot WhatsApp'");
    expect(scenarioStart, 'No se encontró el bloque de escenarios del Panel Bot.').toBeGreaterThan(-1);

    const scenarioSource = botSpec.slice(scenarioStart);
    const missing = REQUIRED_BOT_MUTATION_ASSERTIONS.filter((endpoint) => {
      const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const asserted = new RegExp(
        `(?:hasRequest\\([\\s\\S]{0,120}['"]${escaped}['"]|` +
          `item\\.endpoint\\s*===\\s*['"]${escaped}['"])`,
      );
      return !asserted.test(scenarioSource);
    });
    expect(
      missing,
      `Mutaciones del Panel Bot presentes sólo en mocks/helpers: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('todas las rutas de la aplicación, incluido el Panel Bot, están recorridas', () => {
    const source = scenarioSources();
    const missing = applicationRoutes().filter((route) => !hasExecutableRouteReference(source, route));
    expect(missing, `Rutas sin prueba: ${missing.join(', ')}`).toEqual([]);
  });

  test('las acciones visibles principales tienen un recorrido E2E declarado', () => {
    const source = scenarioSources();
    const missing = REQUIRED_UI_ACTION_MARKERS.filter((marker) => !source.includes(marker));
    expect(missing, `Acciones visuales sin prueba: ${missing.join(', ')}`).toEqual([]);
  });
});

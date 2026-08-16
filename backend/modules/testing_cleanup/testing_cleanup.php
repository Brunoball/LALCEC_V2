<?php
declare(strict_types=1);

final class TestingCleanup
{
    private const CONFIRMATION = 'LIMPIAR_PLAYWRIGHT';

    private static function requireE2EAdmin(): array
    {
        if (!e2e_request_enabled()) {
            api_error(
                'Las herramientas de Playwright requieren X-LALCEC-E2E=PLAYWRIGHT.',
                'E2E_HEADER_REQUIRED',
                403
            );
        }
        return require_admin();
    }

    private static function requireConfirmation(array $body): void
    {
        $confirmation = strtoupper(trim((string)($body['confirmacion'] ?? '')));
        if ($confirmation !== self::CONFIRMATION) {
            api_error(
                'Confirmación de limpieza E2E inválida.',
                'E2E_CLEANUP_CONFIRMACION_INVALIDA',
                422
            );
        }
    }

    public static function run(): never
    {
        $auth = self::requireE2EAdmin();
        self::requireConfirmation(request_body());

        $result = self::cleanup($auth['db'], (int)$auth['id_sesion']);
        api_success($result, 'Limpieza final de Playwright completada.');
    }

    public static function cleanupScope(): never
    {
        $auth = self::requireE2EAdmin();
        $body = request_body();
        self::requireConfirmation($body);

        $scope = strtolower(trim((string)($body['scope'] ?? '')));
        $value = $body['value'] ?? null;
        $result = self::cleanupScoped($auth['db'], $scope, $value);
        api_success($result, 'Limpieza E2E acotada completada.');
    }

    public static function audit(): never
    {
        $auth = self::requireE2EAdmin();
        $table = trim((string)($_GET['tabla'] ?? ''));
        $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false || !in_array($table, ['categorias', 'descuentos_familiares'], true)) {
            api_error('Consulta de auditoría E2E inválida.', 'E2E_AUDITORIA_INVALIDA', 422);
        }

        $allowed = $table === 'categorias'
            ? e2e_category($auth['db'], (int)$id)
            : e2e_discount($auth['db'], (int)$id);
        if (!$allowed) {
            api_error('La auditoría solicitada no pertenece a un registro E2E.', 'E2E_SCOPE_BLOCKED', 409);
        }

        $statement = $auth['db']->prepare(
            'SELECT accion, descripcion, creado_en
             FROM auditoria
             WHERE tabla_afectada = ? AND id_registro = ?
             ORDER BY id_auditoria ASC'
        );
        $statement->execute([$table, (string)$id]);
        api_success(['items' => $statement->fetchAll()], 'Auditoría E2E obtenida.');
    }

    /**
     * Esta acción existe únicamente para que el globalSetup verifique que el
     * Router está ejecutando e2e_guard_mutation(). En una corrida E2E normal
     * NUNCA debe alcanzarse: el guard fail-closed la intercepta antes y devuelve
     * E2E_SCOPE_BLOCKED.
     */
    public static function guardProbe(): never
    {
        self::requireE2EAdmin();
        api_error(
            'El probe E2E alcanzó el handler: el escudo del Router no está activo.',
            'E2E_GUARD_NOT_ACTIVE',
            500
        );
    }

    public static function status(): never
    {
        $auth = self::requireE2EAdmin();
        api_success([
            'residuos' => self::residueCounts($auth['db'], (int)$auth['id_sesion']),
        ], 'Estado E2E obtenido.');
    }

    public static function snapshot(): never
    {
        $auth = self::requireE2EAdmin();
        api_success([
            'snapshot' => self::realDataSnapshot($auth['db']),
        ], 'Huella de datos reales obtenida.');
    }

    private static function cleanup(PDO $db, int $currentSessionId): array
    {
        $filesToDelete = [];
        $counts = [
            'contable_ingresos' => 0,
            'contable_egresos' => 0,
            'contable_opciones' => 0,
            'familias' => 0,
            'socios' => 0,
            'pagos' => 0,
            'pagos_inscripciones' => 0,
            'categorias' => 0,
            'descuentos_familiares' => 0,
            'medios_pago' => 0,
            'condiciones_iva' => 0,
            'usuarios' => 0,
            'sesiones' => 0,
            'login_auditoria' => 0,
            'auditoria' => 0,
            'archivos' => 0,
        ];
        $skipped = [];

        $db->beginTransaction();
        try {
            $testSocios = self::testSocioIds($db);
            $testFamilies = self::ids($db,
                "SELECT id_familia FROM familias
                 WHERE nombre LIKE 'PW E2E FAM %' OR nombre LIKE 'PW EE FAM %'"
            );
            $testCategories = self::ids($db,
                "SELECT id_categoria FROM categorias
                 WHERE nombre LIKE 'PW E2E CAT %' OR nombre LIKE 'PW EE CAT %'"
            );
            $testDiscounts = self::ids($db,
                "SELECT id_descuento_familiar FROM descuentos_familiares
                 WHERE descripcion LIKE 'PW E2E %' OR descripcion LIKE 'PW EE %'"
            );
            $testUsers = self::ids($db,
                "SELECT idUsuario FROM sis_usuarios WHERE usuario LIKE 'pw_e2e_%' OR email LIKE '%@example.test'"
            );
            $testMeans = self::ids($db,
                "SELECT id_medio_pago FROM medios_pago
                 WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"
            );
            $testIva = self::ids($db,
                "SELECT id_condicion_iva FROM condiciones_iva
                 WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"
            );
            $testOptions = self::ids($db,
                "SELECT id_opcion FROM contable_opciones
                 WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"
            );

            $testIncomeIds = self::ids($db,
                "SELECT id_ingreso FROM contable_ingresos
                 WHERE detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %'
                    OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %'
                    OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %'
                    OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %'"
            );
            $testExpenseIds = self::ids($db,
                "SELECT id_egreso FROM contable_egresos
                 WHERE detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %'
                    OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %'
                    OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %'
                    OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %'
                    OR numero_comprobante LIKE 'E2E-%'"
            );

            if ($testExpenseIds !== []) {
                $filesToDelete = self::columnForIds($db, 'contable_egresos', 'id_egreso', 'archivo_path', $testExpenseIds);
            }

            $testPaymentIds = $testSocios === []
                ? []
                : self::columnForIds($db, 'pagos', 'id_socio', 'id_pago', $testSocios);
            $testRegistrationPaymentIds = self::tableExists($db, 'pagos_inscripciones') && $testSocios !== []
                ? self::columnForIds($db, 'pagos_inscripciones', 'id_socio', 'id_pago_inscripcion', $testSocios)
                : [];

            $counts['contable_ingresos'] += self::deleteByIds($db, 'contable_ingresos', 'id_ingreso', $testIncomeIds);
            $counts['contable_egresos'] += self::deleteByIds($db, 'contable_egresos', 'id_egreso', $testExpenseIds);

            if ($testFamilies !== []) {
                self::deleteByIds($db, 'familias_socios', 'id_familia', $testFamilies);
            }
            if ($testSocios !== []) {
                self::deleteByIds($db, 'familias_socios', 'id_socio', $testSocios);
                $counts['pagos'] += self::deleteByIds($db, 'pagos', 'id_socio', $testSocios);
                if (self::tableExists($db, 'pagos_inscripciones')) {
                    $counts['pagos_inscripciones'] += self::deleteByIds($db, 'pagos_inscripciones', 'id_socio', $testSocios);
                }
                self::deleteByIds($db, 'socios_historial_estados', 'id_socio', $testSocios);
                $counts['socios'] += self::deleteByIds($db, 'socios', 'id_socio', $testSocios);
            }
            $counts['familias'] += self::deleteByIds($db, 'familias', 'id_familia', $testFamilies);

            $counts['contable_opciones'] += self::deleteByIds($db, 'contable_opciones', 'id_opcion', $testOptions);

            if ($testCategories !== []) {
                $blocked = self::ids($db,
                    'SELECT DISTINCT id_categoria FROM socios WHERE id_categoria IN ('
                    . self::placeholders(count($testCategories)) . ')',
                    $testCategories
                );
                $safeCategories = array_values(array_diff($testCategories, $blocked));
                if ($blocked !== []) $skipped['categorias_en_uso'] = $blocked;
                self::deleteByIds($db, 'categorias_historial_precios', 'id_categoria', $safeCategories);
                $counts['categorias'] += self::deleteByIds($db, 'categorias', 'id_categoria', $safeCategories);
            }

            $counts['descuentos_familiares'] += self::deleteByIds(
                $db,
                'descuentos_familiares',
                'id_descuento_familiar',
                $testDiscounts
            );

            if ($testMeans !== []) {
                $safeMeans = [];
                foreach ($testMeans as $id) {
                    $uses = self::scalar($db,
                        'SELECT (SELECT COUNT(*) FROM pagos WHERE id_medio_pago = ?)'
                        . ' + (SELECT COUNT(*) FROM socios WHERE id_medio_pago = ?)'
                        . ' + (SELECT COUNT(*) FROM contable_ingresos WHERE id_medio_pago = ?)'
                        . ' + (SELECT COUNT(*) FROM contable_egresos WHERE id_medio_pago = ?)',
                        [$id, $id, $id, $id]
                    );
                    if ($uses === 0) $safeMeans[] = $id;
                    else $skipped['medios_pago_en_uso'][] = $id;
                }
                $counts['medios_pago'] += self::deleteByIds($db, 'medios_pago', 'id_medio_pago', $safeMeans);
            }

            if ($testIva !== []) {
                $safeIva = [];
                foreach ($testIva as $id) {
                    $uses = self::scalar($db, 'SELECT COUNT(*) FROM socios_empresas WHERE id_condicion_iva = ?', [$id]);
                    if ($uses === 0) $safeIva[] = $id;
                    else $skipped['condiciones_iva_en_uso'][] = $id;
                }
                $counts['condiciones_iva'] += self::deleteByIds($db, 'condiciones_iva', 'id_condicion_iva', $safeIva);
            }

            // Sesiones E2E viejas o abiertas por tests individuales. La sesión
            // global actual se conserva hasta el logout del teardown.
            $sessionStatement = $db->prepare(
                "DELETE FROM sis_sesiones
                 WHERE idSesion <> ?
                   AND (user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'"
                 . ($testUsers !== []
                    ? ' OR idUsuario IN (' . self::placeholders(count($testUsers)) . ')'
                    : '')
                 . ')'
            );
            $sessionStatement->execute(array_merge([$currentSessionId], $testUsers));
            $counts['sesiones'] += $sessionStatement->rowCount();

            if ($testUsers !== []) {
                $counts['login_auditoria'] += self::deleteByIds($db, 'sis_login_auditoria', 'idUsuario', $testUsers);
            }
            $statement = $db->prepare(
                "DELETE FROM sis_login_auditoria
                 WHERE usuario LIKE 'pw_e2e_%'
                    OR user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'"
            );
            $statement->execute();
            $counts['login_auditoria'] += $statement->rowCount();
            $counts['usuarios'] += self::deleteByIds($db, 'sis_usuarios', 'idUsuario', $testUsers);

            $auditReferences = [
                'socios' => $testSocios,
                'familias' => $testFamilies,
                'categorias' => $testCategories,
                'descuentos_familiares' => $testDiscounts,
                'pagos' => $testPaymentIds,
                'pagos_inscripciones' => $testRegistrationPaymentIds,
                'contable_ingresos' => $testIncomeIds,
                'contable_egresos' => $testExpenseIds,
                'contable_opciones' => $testOptions,
                'medios_pago' => $testMeans,
                'condiciones_iva' => $testIva,
                'sis_usuarios' => $testUsers,
            ];
            foreach ($auditReferences as $table => $ids) {
                if ($ids === []) continue;
                $params = array_merge([$table], array_map('strval', $ids));
                $statement = $db->prepare(
                    'DELETE FROM auditoria WHERE tabla_afectada = ? AND id_registro IN ('
                    . self::placeholders(count($ids)) . ')'
                );
                $statement->execute($params);
                $counts['auditoria'] += $statement->rowCount();
            }

            $statement = $db->prepare(
                "DELETE FROM auditoria
                 WHERE descripcion LIKE '%PW E2E%'
                    OR descripcion LIKE '%PW EE%'
                    OR datos_anteriores LIKE '%PW E2E%'
                    OR datos_anteriores LIKE '%PW EE%'
                    OR datos_anteriores LIKE '%pw_e2e_%'
                    OR datos_nuevos LIKE '%PW E2E%'
                    OR datos_nuevos LIKE '%PW EE%'
                    OR datos_nuevos LIKE '%pw_e2e_%'
                    OR datos_anteriores LIKE '%@example.test%'
                    OR datos_nuevos LIKE '%@example.test%'
                    OR user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'"
            );
            $statement->execute();
            $counts['auditoria'] += $statement->rowCount();

            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        foreach ($filesToDelete as $relativePath) {
            if (self::deleteContableFile((string)$relativePath)) {
                $counts['archivos']++;
            }
        }

        return [
            'eliminados' => $counts,
            'omitidos_por_seguridad' => $skipped,
        ];
    }

    private static function cleanupScoped(PDO $db, string $scope, mixed $value): array
    {
        $deleted = 0;
        $skipped = [];

        if ($scope === 'login_prefijo') {
            $prefix = trim((string)$value);
            if (!str_starts_with($prefix, 'pw_e2e_')) {
                api_error('Prefijo E2E de login inválido.', 'E2E_SCOPE_INVALIDO', 422);
            }
            $statement = $db->prepare('DELETE FROM sis_login_auditoria WHERE usuario LIKE ?');
            $statement->execute([$prefix . '%']);
            return ['eliminados' => $statement->rowCount(), 'omitidos_por_seguridad' => []];
        }

        $db->beginTransaction();
        try {
            if ($scope === 'familia_prefijo') {
                $prefix = trim((string)$value);
                if (!str_starts_with($prefix, 'PW E2E FAM ') && !str_starts_with($prefix, 'PW EE FAM ')) {
                    api_error('Prefijo E2E de familia inválido.', 'E2E_SCOPE_INVALIDO', 422);
                }
                $ids = self::ids($db, 'SELECT id_familia FROM familias WHERE nombre LIKE ?', [$prefix . '%']);
                foreach ($ids as $id) {
                    $realMembers = self::scalar(
                        $db,
                        'SELECT COUNT(*) FROM familias_socios fs WHERE fs.id_familia = ? AND NOT EXISTS ('
                        . self::e2eSocioExistsSql('fs.id_socio') . ')',
                        [$id]
                    );
                    if ($realMembers > 0) {
                        $skipped['familias_con_socios_no_e2e'][] = $id;
                        continue;
                    }
                    self::deleteByIds($db, 'familias_socios', 'id_familia', [$id]);
                    $deleted += self::deleteByIds($db, 'familias', 'id_familia', [$id]);
                }
            } elseif ($scope === 'categoria_prefijo') {
                $prefix = trim((string)$value);
                if (!str_starts_with($prefix, 'PW E2E CAT ') && !str_starts_with($prefix, 'PW EE CAT ')) {
                    api_error('Prefijo E2E de categoría inválido.', 'E2E_SCOPE_INVALIDO', 422);
                }
                $ids = self::ids($db, 'SELECT id_categoria FROM categorias WHERE nombre LIKE ?', [$prefix . '%']);
                foreach ($ids as $id) {
                    if (self::scalar($db, 'SELECT COUNT(*) FROM socios WHERE id_categoria = ?', [$id]) > 0) {
                        $skipped['categorias_en_uso'][] = $id;
                        continue;
                    }
                    self::deleteByIds($db, 'categorias_historial_precios', 'id_categoria', [$id]);
                    $deleted += self::deleteByIds($db, 'categorias', 'id_categoria', [$id]);
                }
            } elseif ($scope === 'descuentos_umbrales') {
                $values = is_array($value) ? $value : explode(',', (string)$value);
                $thresholds = array_values(array_unique(array_filter(
                    array_map('intval', $values),
                    static fn(int $item): bool => $item >= 2 && $item <= 50
                )));
                if ($thresholds === []) api_error('Umbrales E2E inválidos.', 'E2E_SCOPE_INVALIDO', 422);
                $placeholders = self::placeholders(count($thresholds));
                $statement = $db->prepare(
                    "DELETE FROM descuentos_familiares
                     WHERE cantidad_integrantes_desde IN ({$placeholders})
                       AND (descripcion LIKE 'PW E2E %' OR descripcion LIKE 'PW EE %')"
                );
                $statement->execute($thresholds);
                $deleted += $statement->rowCount();
            } elseif ($scope === 'usuario_prefijo') {
                $prefix = trim((string)$value);
                if (!str_starts_with($prefix, 'pw_e2e_')) {
                    api_error('Prefijo E2E de usuario inválido.', 'E2E_SCOPE_INVALIDO', 422);
                }
                $ids = self::ids($db, 'SELECT idUsuario FROM sis_usuarios WHERE usuario LIKE ?', [$prefix . '%']);
                if ($ids !== []) {
                    self::deleteByIds($db, 'sis_sesiones', 'idUsuario', $ids);
                    self::deleteByIds($db, 'sis_login_auditoria', 'idUsuario', $ids);
                    foreach ($ids as $id) {
                        $statement = $db->prepare("DELETE FROM auditoria WHERE tabla_afectada = 'sis_usuarios' AND id_registro = ?");
                        $statement->execute([(string)$id]);
                    }
                    $deleted += self::deleteByIds($db, 'sis_usuarios', 'idUsuario', $ids);
                }
                $statement = $db->prepare('DELETE FROM sis_login_auditoria WHERE usuario LIKE ?');
                $statement->execute([$prefix . '%']);
            } else {
                api_error('Scope de limpieza E2E no permitido.', 'E2E_SCOPE_INVALIDO', 422);
            }

            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        return ['eliminados' => $deleted, 'omitidos_por_seguridad' => $skipped];
    }

    private static function residueCounts(PDO $db, int $currentSessionId): array
    {
        $counts = [
            'socios' => count(self::testSocioIds($db)),
            'familias' => self::scalar($db, "SELECT COUNT(*) FROM familias WHERE nombre LIKE 'PW E2E FAM %' OR nombre LIKE 'PW EE FAM %'"),
            'categorias' => self::scalar($db, "SELECT COUNT(*) FROM categorias WHERE nombre LIKE 'PW E2E CAT %' OR nombre LIKE 'PW EE CAT %'"),
            'descuentos_familiares' => self::scalar($db, "SELECT COUNT(*) FROM descuentos_familiares WHERE descripcion LIKE 'PW E2E %' OR descripcion LIKE 'PW EE %'"),
            'medios_pago' => self::scalar($db, "SELECT COUNT(*) FROM medios_pago WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"),
            'condiciones_iva' => self::scalar($db, "SELECT COUNT(*) FROM condiciones_iva WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"),
            'usuarios' => self::scalar($db, "SELECT COUNT(*) FROM sis_usuarios WHERE usuario LIKE 'pw_e2e_%' OR email LIKE '%@example.test'"),
            'contable_opciones' => self::scalar($db, "SELECT COUNT(*) FROM contable_opciones WHERE nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %'"),
            'contable_ingresos' => self::scalar($db, "SELECT COUNT(*) FROM contable_ingresos WHERE detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %' OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %' OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %' OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %'"),
            'contable_egresos' => self::scalar($db, "SELECT COUNT(*) FROM contable_egresos WHERE detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %' OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %' OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %' OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %' OR numero_comprobante LIKE 'E2E-%'"),
            'sesiones' => self::scalar($db, "SELECT COUNT(*) FROM sis_sesiones WHERE idSesion <> ? AND user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'", [$currentSessionId]),
            'login_auditoria' => self::scalar($db, "SELECT COUNT(*) FROM sis_login_auditoria WHERE usuario LIKE 'pw_e2e_%' OR user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'"),
            'auditoria' => self::scalar($db, "SELECT COUNT(*) FROM auditoria WHERE descripcion LIKE '%PW E2E%' OR descripcion LIKE '%PW EE%' OR datos_anteriores LIKE '%PW E2E%' OR datos_anteriores LIKE '%PW EE%' OR datos_anteriores LIKE '%pw_e2e_%' OR datos_nuevos LIKE '%PW E2E%' OR datos_nuevos LIKE '%PW EE%' OR datos_nuevos LIKE '%pw_e2e_%' OR datos_anteriores LIKE '%@example.test%' OR datos_nuevos LIKE '%@example.test%' OR user_agent LIKE 'LALCEC-PLAYWRIGHT-E2E%'"),
        ];

        $testSocios = self::testSocioIds($db);
        $counts['pagos'] = $testSocios === [] ? 0 : self::scalar(
            $db,
            'SELECT COUNT(*) FROM pagos WHERE id_socio IN (' . self::placeholders(count($testSocios)) . ')',
            $testSocios
        );
        $counts['pagos_inscripciones'] = self::tableExists($db, 'pagos_inscripciones') && $testSocios !== []
            ? self::scalar(
                $db,
                'SELECT COUNT(*) FROM pagos_inscripciones WHERE id_socio IN (' . self::placeholders(count($testSocios)) . ')',
                $testSocios
            )
            : 0;

        return $counts;
    }

    private static function realDataSnapshot(PDO $db): array
    {
        $e2eSocio = self::e2eSocioExistsSql('s.id_socio');
        $e2eSocioFs = self::e2eSocioExistsSql('fs.id_socio');
        $queries = [
            'socios' => "SELECT s.* FROM socios s WHERE NOT EXISTS ({$e2eSocio}) ORDER BY s.id_socio",
            'socios_personas' => "SELECT p.* FROM socios_personas p WHERE NOT (p.apellido LIKE 'PW EE APELLIDO %' OR p.apellido LIKE 'PW E2E %' OR p.email LIKE '%@example.test') ORDER BY p.id_socio",
            'socios_empresas' => "SELECT e.* FROM socios_empresas e WHERE NOT (e.razon_social LIKE 'PW E2E %' OR e.razon_social LIKE 'PW EE %' OR e.email LIKE '%@example.test') ORDER BY e.id_socio",
            'socios_historial_estados' => "SELECT h.* FROM socios_historial_estados h WHERE NOT EXISTS (" . self::e2eSocioExistsSql('h.id_socio') . ") ORDER BY h.id_historial_estado",
            'familias' => "SELECT f.* FROM familias f WHERE NOT (f.nombre LIKE 'PW E2E FAM %' OR f.nombre LIKE 'PW EE FAM %') ORDER BY f.id_familia",
            'familias_socios' => "SELECT fs.* FROM familias_socios fs WHERE NOT EXISTS (SELECT 1 FROM familias f WHERE f.id_familia = fs.id_familia AND (f.nombre LIKE 'PW E2E FAM %' OR f.nombre LIKE 'PW EE FAM %')) AND NOT EXISTS ({$e2eSocioFs}) ORDER BY fs.id_familia, fs.id_socio",
            'categorias' => "SELECT c.* FROM categorias c WHERE NOT (c.nombre LIKE 'PW E2E CAT %' OR c.nombre LIKE 'PW EE CAT %') ORDER BY c.id_categoria",
            'categorias_historial_precios' => "SELECT h.* FROM categorias_historial_precios h WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.id_categoria = h.id_categoria AND (c.nombre LIKE 'PW E2E CAT %' OR c.nombre LIKE 'PW EE CAT %')) ORDER BY h.id_historial_precio",
            'descuentos_familiares' => "SELECT d.* FROM descuentos_familiares d WHERE NOT (d.descripcion LIKE 'PW E2E %' OR d.descripcion LIKE 'PW EE %') ORDER BY d.id_descuento_familiar",
            'pagos' => "SELECT p.* FROM pagos p WHERE NOT EXISTS (" . self::e2eSocioExistsSql('p.id_socio') . ") ORDER BY p.id_pago",
            'medios_pago' => "SELECT m.* FROM medios_pago m WHERE NOT (m.nombre LIKE 'PW E2E %' OR m.nombre LIKE 'PW EE %') ORDER BY m.id_medio_pago",
            'condiciones_iva' => "SELECT c.* FROM condiciones_iva c WHERE NOT (c.nombre LIKE 'PW E2E %' OR c.nombre LIKE 'PW EE %') ORDER BY c.id_condicion_iva",
            'contable_opciones' => "SELECT o.* FROM contable_opciones o WHERE NOT (o.nombre LIKE 'PW E2E %' OR o.nombre LIKE 'PW EE %') ORDER BY o.id_opcion",
            'contable_ingresos' => "SELECT i.* FROM contable_ingresos i WHERE NOT (i.detalle LIKE 'PW E2E %' OR i.detalle LIKE 'PW EE %' OR i.proveedor LIKE 'PW E2E %' OR i.proveedor LIKE 'PW EE %' OR i.categoria LIKE 'PW E2E %' OR i.categoria LIKE 'PW EE %' OR i.concepto LIKE 'PW E2E %' OR i.concepto LIKE 'PW EE %') ORDER BY i.id_ingreso",
            'contable_egresos' => "SELECT e.* FROM contable_egresos e WHERE NOT (e.detalle LIKE 'PW E2E %' OR e.detalle LIKE 'PW EE %' OR e.proveedor LIKE 'PW E2E %' OR e.proveedor LIKE 'PW EE %' OR e.categoria LIKE 'PW E2E %' OR e.categoria LIKE 'PW EE %' OR e.concepto LIKE 'PW E2E %' OR e.concepto LIKE 'PW EE %' OR e.numero_comprobante LIKE 'E2E-%') ORDER BY e.id_egreso",
            'sis_usuarios' => "SELECT u.* FROM sis_usuarios u WHERE u.usuario NOT LIKE 'pw_e2e_%' AND COALESCE(u.email,'') NOT LIKE '%@example.test' ORDER BY u.idUsuario",
            'sis_sesiones' => "SELECT s.* FROM sis_sesiones s WHERE COALESCE(s.user_agent,'') NOT LIKE 'LALCEC-PLAYWRIGHT-E2E%' AND NOT EXISTS (SELECT 1 FROM sis_usuarios u WHERE u.idUsuario = s.idUsuario AND (u.usuario LIKE 'pw_e2e_%' OR COALESCE(u.email,'') LIKE '%@example.test')) ORDER BY s.idSesion",
            'sis_login_auditoria' => "SELECT l.* FROM sis_login_auditoria l WHERE l.usuario NOT LIKE 'pw_e2e_%' AND COALESCE(l.user_agent,'') NOT LIKE 'LALCEC-PLAYWRIGHT-E2E%' ORDER BY l.idLog",
            'auditoria' => "SELECT a.* FROM auditoria a WHERE COALESCE(a.user_agent,'') NOT LIKE 'LALCEC-PLAYWRIGHT-E2E%' AND COALESCE(a.descripcion,'') NOT LIKE '%PW E2E%' AND COALESCE(a.descripcion,'') NOT LIKE '%PW EE%' AND COALESCE(a.datos_anteriores,'') NOT LIKE '%PW E2E%' AND COALESCE(a.datos_anteriores,'') NOT LIKE '%PW EE%' AND COALESCE(a.datos_anteriores,'') NOT LIKE '%pw_e2e_%' AND COALESCE(a.datos_nuevos,'') NOT LIKE '%PW E2E%' AND COALESCE(a.datos_nuevos,'') NOT LIKE '%PW EE%' AND COALESCE(a.datos_nuevos,'') NOT LIKE '%pw_e2e_%' AND COALESCE(a.datos_anteriores,'') NOT LIKE '%@example.test%' AND COALESCE(a.datos_nuevos,'') NOT LIKE '%@example.test%' ORDER BY a.id_auditoria",
        ];
        if (self::tableExists($db, 'pagos_inscripciones')) {
            $queries['pagos_inscripciones'] = "SELECT p.* FROM pagos_inscripciones p WHERE NOT EXISTS (" . self::e2eSocioExistsSql('p.id_socio') . ") ORDER BY p.id_pago_inscripcion";
        }

        ksort($queries);
        $tables = [];
        $global = hash_init('sha256');
        foreach ($queries as $name => $sql) {
            $fingerprint = self::fingerprintQuery($db, $sql);
            $tables[$name] = $fingerprint;
            hash_update($global, $name . ':' . $fingerprint['count'] . ':' . $fingerprint['sha256'] . "\n");
        }

        return [
            'sha256' => hash_final($global),
            'tablas' => $tables,
        ];
    }

    private static function fingerprintQuery(PDO $db, string $sql): array
    {
        $statement = $db->query($sql);
        $hash = hash_init('sha256');
        $count = 0;
        while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
            $json = json_encode(
                $row,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION
            );
            hash_update($hash, (string)$json . "\n");
            $count++;
        }
        return ['count' => $count, 'sha256' => hash_final($hash)];
    }

    private static function testSocioIds(PDO $db): array
    {
        return self::ids($db,
            "SELECT DISTINCT s.id_socio
             FROM socios s
             LEFT JOIN socios_personas p ON p.id_socio = s.id_socio
             LEFT JOIN socios_empresas e ON e.id_socio = s.id_socio
             WHERE p.apellido LIKE 'PW EE APELLIDO %'
                OR p.apellido LIKE 'PW E2E %'
                OR p.email LIKE '%@example.test'
                OR e.razon_social LIKE 'PW E2E %'
                OR e.razon_social LIKE 'PW EE %'
                OR e.email LIKE '%@example.test'"
        );
    }

    private static function e2eSocioExistsSql(string $idExpression): string
    {
        return "SELECT 1
                FROM socios s2
                LEFT JOIN socios_personas sp2 ON sp2.id_socio = s2.id_socio
                LEFT JOIN socios_empresas se2 ON se2.id_socio = s2.id_socio
                WHERE s2.id_socio = {$idExpression}
                  AND (
                       sp2.apellido LIKE 'PW EE APELLIDO %'
                       OR sp2.apellido LIKE 'PW E2E %'
                       OR sp2.email LIKE '%@example.test'
                       OR se2.razon_social LIKE 'PW E2E %'
                       OR se2.razon_social LIKE 'PW EE %'
                       OR se2.email LIKE '%@example.test'
                  )";
    }

    private static function tableExists(PDO $db, string $table): bool
    {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
        );
        $statement->execute([$table]);
        return (int)$statement->fetchColumn() > 0;
    }

    private static function ids(PDO $db, string $sql, array $params = []): array
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        $ids = [];
        while (($value = $statement->fetchColumn()) !== false) {
            $id = (int)$value;
            if ($id > 0) $ids[$id] = $id;
        }
        return array_values($ids);
    }

    private static function scalar(PDO $db, string $sql, array $params = []): int
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return (int)$statement->fetchColumn();
    }

    private static function placeholders(int $count): string
    {
        return implode(',', array_fill(0, max(1, $count), '?'));
    }

    private static function deleteByIds(PDO $db, string $table, string $column, array $ids): int
    {
        if ($ids === []) return 0;
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table) || !preg_match('/^[a-zA-Z0-9_]+$/', $column)) {
            throw new RuntimeException('Nombre de tabla o columna inválido en limpieza E2E.');
        }
        $statement = $db->prepare(
            "DELETE FROM `{$table}` WHERE `{$column}` IN (" . self::placeholders(count($ids)) . ')'
        );
        $statement->execute(array_values($ids));
        return $statement->rowCount();
    }

    private static function columnForIds(
        PDO $db,
        string $table,
        string $idColumn,
        string $valueColumn,
        array $ids
    ): array {
        if ($ids === []) return [];
        foreach ([$table, $idColumn, $valueColumn] as $identifier) {
            if (!preg_match('/^[a-zA-Z0-9_]+$/', $identifier)) {
                throw new RuntimeException('Identificador inválido en limpieza E2E.');
            }
        }
        $statement = $db->prepare(
            "SELECT `{$valueColumn}` FROM `{$table}` WHERE `{$idColumn}` IN ("
            . self::placeholders(count($ids)) . ')'
        );
        $statement->execute(array_values($ids));
        return array_values(array_filter(
            array_column($statement->fetchAll(), $valueColumn),
            static fn(mixed $value): bool => $value !== null && $value !== ''
        ));
    }

    private static function deleteContableFile(string $relativePath): bool
    {
        $path = trim($relativePath);
        if ($path === '' || !preg_match('#^egresos/[A-Za-z0-9._-]+$#', $path)) return false;

        $root = dirname(__DIR__, 2) . '/uploads/contable';
        $candidate = $root . '/' . ltrim($path, '/\\');
        $realRoot = realpath($root);
        $realFile = realpath($candidate);
        if (!$realRoot || !$realFile) return false;
        if (!str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR) || !is_file($realFile)) return false;
        return @unlink($realFile);
    }
}

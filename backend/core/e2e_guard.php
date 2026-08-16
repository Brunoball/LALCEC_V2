<?php
declare(strict_types=1);

/**
 * Escudo de seguridad para ejecuciones Playwright contra producción.
 *
 * IMPORTANTE: este encabezado NO concede permisos. Solamente vuelve más
 * restrictivas las mutaciones de una sesión ya autenticada: cuando
 * X-LALCEC-E2E=PLAYWRIGHT está presente, cualquier POST funcional debe crear
 * o modificar exclusivamente registros identificados como E2E.
 */
function e2e_request_enabled(): bool
{
    return strtoupper(trim((string)($_SERVER['HTTP_X_LALCEC_E2E'] ?? ''))) === 'PLAYWRIGHT';
}

function e2e_marker_text(mixed $value): bool
{
    $text = trim((string)$value);
    if ($text === '') return false;

    return preg_match('/^(PW E2E|PW EE)\b/i', $text) === 1
        || preg_match('/^pw_e2e_/i', $text) === 1
        || str_contains(strtolower($text), '@example.test');
}

function e2e_body_has_marker(array $body): bool
{
    $walk = static function (mixed $value) use (&$walk): bool {
        if (is_array($value)) {
            foreach ($value as $item) {
                if ($walk($item)) return true;
            }
            return false;
        }
        return is_scalar($value) && e2e_marker_text($value);
    };

    return $walk($body);
}

function e2e_scope_error(string $action, string $detail): never
{
    api_error(
        'Playwright bloqueó una mutación que podría alcanzar datos reales.',
        'E2E_SCOPE_BLOCKED',
        409,
        ['accion' => $action, 'detalle' => $detail]
    );
}

function e2e_exists(PDO $db, string $sql, array $params): bool
{
    $statement = $db->prepare($sql);
    $statement->execute($params);
    return (bool)$statement->fetchColumn();
}

function e2e_socio(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1
         FROM socios s
         LEFT JOIN socios_personas p ON p.id_socio = s.id_socio
         LEFT JOIN socios_empresas e ON e.id_socio = s.id_socio
         WHERE s.id_socio = ?
           AND (
                p.apellido LIKE 'PW EE APELLIDO %'
                OR p.apellido LIKE 'PW E2E %'
                OR p.email LIKE '%@example.test'
                OR e.razon_social LIKE 'PW E2E %'
                OR e.razon_social LIKE 'PW EE %'
                OR e.email LIKE '%@example.test'
           )
         LIMIT 1",
        [$id]
    );
}

function e2e_family(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM familias
         WHERE id_familia = ?
           AND (nombre LIKE 'PW E2E FAM %' OR nombre LIKE 'PW EE FAM %')
         LIMIT 1",
        [$id]
    );
}

function e2e_category(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM categorias
         WHERE id_categoria = ?
           AND (nombre LIKE 'PW E2E CAT %' OR nombre LIKE 'PW EE CAT %')
         LIMIT 1",
        [$id]
    );
}

function e2e_discount(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM descuentos_familiares
         WHERE id_descuento_familiar = ?
           AND (descripcion LIKE 'PW E2E %' OR descripcion LIKE 'PW EE %')
         LIMIT 1",
        [$id]
    );
}

function e2e_catalog(PDO $db, string $list, int $id): bool
{
    $definitions = [
        'medios_pago' => ['table' => 'medios_pago', 'id' => 'id_medio_pago'],
        'condiciones_iva' => ['table' => 'condiciones_iva', 'id' => 'id_condicion_iva'],
    ];
    if (!isset($definitions[$list])) return false;
    $def = $definitions[$list];
    return e2e_exists(
        $db,
        "SELECT 1 FROM `{$def['table']}`
         WHERE `{$def['id']}` = ?
           AND (nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %')
         LIMIT 1",
        [$id]
    );
}

function e2e_user(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM sis_usuarios WHERE idUsuario = ? AND (usuario LIKE 'pw_e2e_%' OR email LIKE '%@example.test') LIMIT 1",
        [$id]
    );
}

function e2e_contable_option(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM contable_opciones
         WHERE id_opcion = ? AND (nombre LIKE 'PW E2E %' OR nombre LIKE 'PW EE %')
         LIMIT 1",
        [$id]
    );
}

function e2e_income(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM contable_ingresos
         WHERE id_ingreso = ?
           AND (
                detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %'
                OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %'
                OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %'
                OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %'
           )
         LIMIT 1",
        [$id]
    );
}

function e2e_expense(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM contable_egresos
         WHERE id_egreso = ?
           AND (
                detalle LIKE 'PW E2E %' OR detalle LIKE 'PW EE %'
                OR proveedor LIKE 'PW E2E %' OR proveedor LIKE 'PW EE %'
                OR categoria LIKE 'PW E2E %' OR categoria LIKE 'PW EE %'
                OR concepto LIKE 'PW E2E %' OR concepto LIKE 'PW EE %'
                OR numero_comprobante LIKE 'E2E-%'
           )
         LIMIT 1",
        [$id]
    );
}

function e2e_payment(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM pagos p
         WHERE p.id_pago = ?
           AND EXISTS (
             SELECT 1
             FROM socios s
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             WHERE s.id_socio = p.id_socio
               AND (
                    sp.apellido LIKE 'PW EE APELLIDO %'
                    OR sp.apellido LIKE 'PW E2E %'
                    OR sp.email LIKE '%@example.test'
                    OR se.razon_social LIKE 'PW E2E %'
                    OR se.razon_social LIKE 'PW EE %'
                    OR se.email LIKE '%@example.test'
               )
           )
         LIMIT 1",
        [$id]
    );
}

function e2e_registration_payment(PDO $db, int $id): bool
{
    return e2e_exists(
        $db,
        "SELECT 1 FROM pagos_inscripciones p
         WHERE p.id_pago_inscripcion = ?
           AND EXISTS (
             SELECT 1
             FROM socios s
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             WHERE s.id_socio = p.id_socio
               AND (
                    sp.apellido LIKE 'PW EE APELLIDO %'
                    OR sp.apellido LIKE 'PW E2E %'
                    OR sp.email LIKE '%@example.test'
                    OR se.razon_social LIKE 'PW E2E %'
                    OR se.razon_social LIKE 'PW EE %'
                    OR se.email LIKE '%@example.test'
               )
           )
         LIMIT 1",
        [$id]
    );
}

function e2e_positive_int(mixed $value): ?int
{
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $id === false ? null : (int)$id;
}

function e2e_require_target_or_missing(
    PDO $db,
    string $action,
    mixed $value,
    callable $isE2E,
    string $table,
    string $column
): void {
    $id = e2e_positive_int($value);
    if ($id === null) return; // La validación funcional devolverá el 422 correspondiente.
    if ($isE2E($db, $id)) return;

    // Un ID inexistente se permite para conservar las pruebas de 404 sin tocar nada.
    if (!e2e_exists($db, "SELECT 1 FROM `{$table}` WHERE `{$column}` = ? LIMIT 1", [$id])) return;
    e2e_scope_error($action, "El ID {$id} pertenece a un registro que no es E2E.");
}

function e2e_require_socio_ids(PDO $db, string $action, array $body): void
{
    $ids = [];
    $topId = e2e_positive_int($body['id_socio'] ?? null);
    if ($topId !== null) $ids[$topId] = $topId;

    foreach (['pagos', 'obligaciones'] as $key) {
        if (!is_array($body[$key] ?? null)) continue;
        foreach ($body[$key] as $row) {
            if (!is_array($row)) continue;
            $id = e2e_positive_int($row['id_socio'] ?? null);
            if ($id !== null) $ids[$id] = $id;
        }
    }

    foreach ($ids as $id) {
        if (!e2e_socio($db, $id)) {
            if (!e2e_exists($db, 'SELECT 1 FROM socios WHERE id_socio = ? LIMIT 1', [$id])) continue;
            e2e_scope_error($action, "El socio {$id} no pertenece al conjunto E2E.");
        }
    }
}

function e2e_guard_mutation(string $action, ?array $auth = null): void
{
    if (!e2e_request_enabled()) return;

    // Login/logout crean/eliminan exclusivamente sesiones de testing. El login
    // omite además cualquier rehash del usuario real cuando el header E2E está activo.
    if (in_array($action, ['auth_login', 'auth_logout'], true)) return;

    // El Panel Bot se prueba con mocks de navegador; su proxy conserva sus
    // propias validaciones de origen y no forma parte de las mutaciones LALCEC.
    if ($action === 'bot_panel_proxy') return;

    if (!is_array($auth) || !($auth['db'] ?? null) instanceof PDO) {
        e2e_scope_error($action, 'La acción E2E no posee una sesión autenticada válida.');
    }

    $db = $auth['db'];
    $body = request_body();

    if (in_array($action, ['e2e_cleanup', 'e2e_cleanup_scope'], true)) return;

    switch ($action) {
        case 'socios_guardar': {
            $id = e2e_positive_int($body['id'] ?? $body['id_socio'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_socio', 'socios', 'id_socio');
                if ($body !== [] && !e2e_body_has_marker($body)) {
                    e2e_scope_error($action, 'La edición del socio quitaría todas las marcas E2E.');
                }
                return;
            }
            if ($body === []) return;
            if (!e2e_body_has_marker($body)) e2e_scope_error($action, 'El alta de socio no contiene una marca PW E2E/PW EE.');
            return;
        }

        case 'socios_eliminar':
        case 'socios_eliminar_definitivo':
        case 'socios_reactivar':
            e2e_require_target_or_missing($db, $action, $body['id'] ?? null, 'e2e_socio', 'socios', 'id_socio');
            return;

        case 'familias_guardar': {
            $id = e2e_positive_int($body['id'] ?? $body['id_familia'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_family', 'familias', 'id_familia');
                if (array_key_exists('nombre', $body) && !e2e_marker_text($body['nombre'] ?? '')) {
                    e2e_scope_error($action, 'La edición de la familia quitaría su nombre E2E.');
                }
            } elseif ($body !== [] && !e2e_marker_text($body['nombre'] ?? '')) {
                e2e_scope_error($action, 'El alta de familia no contiene un nombre PW E2E/PW EE.');
            }
            if (is_array($body['integrantes'] ?? null)) {
                foreach ($body['integrantes'] as $member) {
                    if (!is_array($member)) continue;
                    $memberId = e2e_positive_int($member['id_socio'] ?? null);
                    if ($memberId !== null && !e2e_socio($db, $memberId)) {
                        e2e_scope_error($action, "El integrante {$memberId} no es un socio E2E.");
                    }
                }
            }
            return;
        }

        case 'familias_eliminar':
        case 'familias_eliminar_definitivo':
        case 'familias_reactivar':
            e2e_require_target_or_missing($db, $action, $body['id'] ?? null, 'e2e_family', 'familias', 'id_familia');
            return;

        case 'categorias_guardar': {
            $id = e2e_positive_int($body['id'] ?? $body['id_categoria'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_category', 'categorias', 'id_categoria');
                if (array_key_exists('nombre', $body) && !e2e_marker_text($body['nombre'] ?? '')) {
                    e2e_scope_error($action, 'La edición de la categoría quitaría su nombre E2E.');
                }
            } elseif ($body !== [] && !e2e_marker_text($body['nombre'] ?? '')) {
                e2e_scope_error($action, 'El alta de categoría no contiene un nombre PW E2E/PW EE.');
            }
            return;
        }

        case 'categorias_eliminar':
        case 'categorias_reactivar':
            e2e_require_target_or_missing($db, $action, $body['id'] ?? null, 'e2e_category', 'categorias', 'id_categoria');
            return;

        case 'descuentos_familiares_guardar': {
            $id = e2e_positive_int($body['id'] ?? $body['id_descuento_familiar'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_discount', 'descuentos_familiares', 'id_descuento_familiar');
                if (array_key_exists('descripcion', $body) && !e2e_marker_text($body['descripcion'] ?? '')) {
                    e2e_scope_error($action, 'La edición del descuento quitaría su descripción E2E.');
                }
            } elseif ($body !== [] && !e2e_marker_text($body['descripcion'] ?? '')) {
                e2e_scope_error($action, 'El descuento de prueba debe llevar una descripción PW E2E/PW EE.');
            }
            return;
        }

        case 'descuentos_familiares_eliminar':
            e2e_require_target_or_missing($db, $action, $body['id'] ?? null, 'e2e_discount', 'descuentos_familiares', 'id_descuento_familiar');
            return;

        case 'configuracion_lista_guardar': {
            $list = trim((string)($body['lista'] ?? ''));
            $id = e2e_positive_int($body['id'] ?? null);
            if ($id !== null) {
                $defs = [
                    'medios_pago' => ['table' => 'medios_pago', 'id' => 'id_medio_pago'],
                    'condiciones_iva' => ['table' => 'condiciones_iva', 'id' => 'id_condicion_iva'],
                ];
                if (isset($defs[$list])) {
                    $def = $defs[$list];
                    e2e_require_target_or_missing(
                        $db,
                        $action,
                        $id,
                        static fn(PDO $pdo, int $target): bool => e2e_catalog($pdo, $list, $target),
                        $def['table'],
                        $def['id']
                    );
                    if (array_key_exists('nombre', $body) && !e2e_marker_text($body['nombre'] ?? '')) {
                        e2e_scope_error($action, 'La edición del catálogo quitaría su nombre E2E.');
                    }
                }
            } elseif ($body !== [] && !e2e_marker_text($body['nombre'] ?? '')) {
                e2e_scope_error($action, 'El catálogo de prueba debe llevar un nombre PW E2E/PW EE.');
            }
            return;
        }

        case 'configuracion_lista_eliminar':
        case 'configuracion_lista_baja':
        case 'configuracion_lista_reactivar':
        case 'configuracion_lista_eliminar_definitivo': {
            $list = trim((string)($body['lista'] ?? ''));
            $id = e2e_positive_int($body['id'] ?? null);
            if ($id === null) return;
            $defs = [
                'medios_pago' => ['table' => 'medios_pago', 'id' => 'id_medio_pago'],
                'condiciones_iva' => ['table' => 'condiciones_iva', 'id' => 'id_condicion_iva'],
            ];
            if (!isset($defs[$list])) return;
            $def = $defs[$list];
            if (e2e_catalog($db, $list, $id)) return;
            if (!e2e_exists($db, "SELECT 1 FROM `{$def['table']}` WHERE `{$def['id']}` = ? LIMIT 1", [$id])) return;
            e2e_scope_error($action, "El elemento {$id} del catálogo {$list} no es E2E.");
        }

        case 'usuarios_guardar': {
            $id = e2e_positive_int($body['id'] ?? $body['id_usuario'] ?? null);
            $usernameIsE2E = preg_match('/^pw_e2e_/i', trim((string)($body['usuario'] ?? ''))) === 1;
            $emailIsE2E = str_contains(strtolower(trim((string)($body['email'] ?? ''))), '@example.test');
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_user', 'sis_usuarios', 'idUsuario');
                // Si la edición envía los campos identificadores, al menos uno debe
                // seguir permitiendo reconocer el registro como E2E incluso si una
                // validación funcional del módulo llegara a fallar.
                if ((array_key_exists('usuario', $body) || array_key_exists('email', $body))
                    && !$usernameIsE2E && !$emailIsE2E) {
                    e2e_scope_error($action, 'La edición del usuario quitaría todas las marcas E2E.');
                }
            } elseif ($body !== [] && !$usernameIsE2E && !$emailIsE2E) {
                e2e_scope_error($action, 'El usuario de prueba debe usar pw_e2e_ o un correo @example.test.');
            }
            return;
        }

        case 'usuarios_cambiar_estado':
        case 'usuarios_eliminar':
            e2e_require_target_or_missing($db, $action, $body['id'] ?? null, 'e2e_user', 'sis_usuarios', 'idUsuario');
            return;

        case 'contable_opcion_guardar': {
            $id = e2e_positive_int($body['id_opcion'] ?? $body['id'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_contable_option', 'contable_opciones', 'id_opcion');
                if (array_key_exists('nombre', $body) && !e2e_marker_text($body['nombre'] ?? '')) {
                    e2e_scope_error($action, 'La edición de la opción contable quitaría su nombre E2E.');
                }
            } elseif ($body !== [] && !e2e_marker_text($body['nombre'] ?? '')) {
                e2e_scope_error($action, 'La opción contable de prueba debe llevar un nombre PW E2E/PW EE.');
            }
            return;
        }

        case 'contable_opcion_cambiar_estado':
        case 'contable_opcion_eliminar':
            e2e_require_target_or_missing($db, $action, $body['id_opcion'] ?? null, 'e2e_contable_option', 'contable_opciones', 'id_opcion');
            return;

        case 'contable_ingreso_guardar': {
            $id = e2e_positive_int($body['id_ingreso'] ?? $body['id'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_income', 'contable_ingresos', 'id_ingreso');
                $identityFields = ['detalle', 'proveedor', 'categoria', 'concepto'];
                $touchesIdentity = count(array_intersect($identityFields, array_keys($body))) > 0;
                if ($touchesIdentity && !e2e_body_has_marker($body)) {
                    e2e_scope_error($action, 'La edición del ingreso quitaría sus marcas E2E.');
                }
            } elseif ($body !== [] && !e2e_body_has_marker($body)) {
                e2e_scope_error($action, 'El ingreso de prueba debe contener una marca PW E2E/PW EE.');
            }
            return;
        }

        case 'contable_ingreso_eliminar':
            e2e_require_target_or_missing($db, $action, $body['id_ingreso'] ?? $body['id'] ?? null, 'e2e_income', 'contable_ingresos', 'id_ingreso');
            return;

        case 'contable_egreso_guardar': {
            $id = e2e_positive_int($body['id_egreso'] ?? $body['id'] ?? null);
            if ($id !== null) {
                e2e_require_target_or_missing($db, $action, $id, 'e2e_expense', 'contable_egresos', 'id_egreso');
                $identityFields = ['detalle', 'proveedor', 'categoria', 'concepto', 'numero_comprobante'];
                $touchesIdentity = count(array_intersect($identityFields, array_keys($body))) > 0;
                if ($touchesIdentity && !e2e_body_has_marker($body)
                    && !str_starts_with(strtoupper(trim((string)($body['numero_comprobante'] ?? ''))), 'E2E-')) {
                    e2e_scope_error($action, 'La edición del egreso quitaría sus marcas E2E.');
                }
            } elseif ($body !== [] && !e2e_body_has_marker($body)) {
                e2e_scope_error($action, 'El egreso de prueba debe contener una marca PW E2E/PW EE/E2E-.');
            }
            return;
        }

        case 'contable_egreso_eliminar':
            e2e_require_target_or_missing($db, $action, $body['id_egreso'] ?? $body['id'] ?? null, 'e2e_expense', 'contable_egresos', 'id_egreso');
            return;

        case 'cuotas_registrar_pago':
        case 'cuotas_registrar_pagos':
        case 'cuotas_condonar_pago':
        case 'cuotas_registrar_cobro':
            if ($body === []) return;
            e2e_require_socio_ids($db, $action, $body);
            return;

        case 'cuotas_eliminar_pago':
            e2e_require_target_or_missing($db, $action, $body['id_pago'] ?? null, 'e2e_payment', 'pagos', 'id_pago');
            return;

        case 'cuotas_anular': {
            $legacyId = e2e_positive_int($body['id_pago'] ?? null);
            if ($legacyId !== null) {
                e2e_require_target_or_missing($db, $action, $legacyId, 'e2e_payment', 'pagos', 'id_pago');
                return;
            }
            if (!is_array($body['lineas'] ?? null)) return;
            foreach ($body['lineas'] as $line) {
                if (!is_array($line)) continue;
                $id = e2e_positive_int($line['id_linea'] ?? null);
                if ($id === null) continue;
                $type = strtoupper(trim((string)($line['tipo'] ?? '')));
                if ($type === 'CUOTA') {
                    e2e_require_target_or_missing($db, $action, $id, 'e2e_payment', 'pagos', 'id_pago');
                } elseif ($type === 'INSCRIPCION') {
                    e2e_require_target_or_missing($db, $action, $id, 'e2e_registration_payment', 'pagos_inscripciones', 'id_pago_inscripcion');
                }
            }
            return;
        }

        default:
            // Fail closed: si mañana aparece una nueva mutación y la suite E2E
            // intenta ejecutarla contra producción, primero debe declararse su
            // regla de aislamiento acá.
            e2e_scope_error($action, 'La acción POST todavía no está declarada como segura para Playwright.');
    }
}

<?php
declare(strict_types=1);

trait SociosGestion
{
    /**
     * Implementado por SociosConsultas al componerse ambos traits en Socios.
     * La declaración explícita evita que los analizadores estáticos interpreten
     * las llamadas a self::detalle() como un método inexistente.
     */
    abstract private static function detalle(PDO $db, int $id): ?array;

    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_socio']) && $body['id_socio'] !== ''
            ? positive_id($body['id_socio'], 'socio')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 120);
        $surname = required_text($body, 'apellido', 'apellido', 120);
        $dni = preg_replace('/[.\s-]+/', '', required_text($body, 'dni', 'DNI', 20)) ?? '';
        if (!preg_match('/^\d{6,9}$/', $dni)) {
            api_error('El DNI debe contener entre 6 y 9 dígitos.', 'VALIDATION_ERROR');
        }

        $birthDate = valid_date($body['fecha_nacimiento'] ?? '', 'nacimiento', false);
        if ($birthDate !== null && $birthDate > date('Y-m-d')) {
            api_error('La fecha de nacimiento no puede ser futura.', 'VALIDATION_ERROR');
        }
        $admissionDate = valid_date($body['fecha_ingreso'] ?? '', 'ingreso');
        if ($admissionDate > date('Y-m-d')) {
            api_error('La fecha de ingreso no puede ser futura.', 'VALIDATION_ERROR');
        }

        $sex = clean_text($body['sexo'] ?? 'NO_INFORMA', 20);
        if (!in_array($sex, ['MASCULINO', 'FEMENINO', 'OTRO', 'NO_INFORMA'], true)) {
            api_error('El sexo seleccionado no es válido.', 'VALIDATION_ERROR');
        }
        $address = optional_text($body['domicilio'] ?? null, 255);
        $phone = optional_text($body['telefono'] ?? null, 50, false);
        $email = optional_text($body['email'] ?? null, 190, false);
        if ($email !== null) {
            $email = strtolower($email);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                api_error('El email no tiene un formato válido.', 'VALIDATION_ERROR');
            }
        }
        $observations = optional_text($body['observaciones'] ?? null, 5000);
        $categoryIds = self::validarCategorias($db, $body['categoria_ids'] ?? [], $id);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $body, $id, $name, $surname, $dni, $birthDate, $sex, $address, $phone, $email, $admissionDate, $observations, $categoryIds): array {
                $locationId = self::resolverLocalidad($db, $auth, $body, $id);
                $duplicate = $db->prepare('SELECT id_socio FROM socios WHERE dni = ? AND id_socio <> ? LIMIT 1');
                $duplicate->execute([$dni, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe un socio con ese DNI.', 'DNI_DUPLICADO');

                if ($id === null) {
                    $insert = $db->prepare(
                        'INSERT INTO socios
                         (nombre, apellido, dni, fecha_nacimiento, sexo, domicilio, id_localidad, telefono, email, fecha_ingreso, observaciones, activo)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
                    );
                    $insert->execute([$name, $surname, $dni, $birthDate, $sex, $address, $locationId, $phone, $email, $admissionDate, $observations]);
                    $partnerId = (int)$db->lastInsertId();
                    $db->prepare(
                        'INSERT INTO socios_periodos_activos (id_socio, vigente_desde, vigente_hasta, motivo_baja)
                         VALUES (?, ?, NULL, NULL)'
                    )->execute([$partnerId, $admissionDate]);
                    self::sincronizarCategorias($db, $partnerId, $categoryIds, $admissionDate, true);
                    $after = self::detalle($db, $partnerId);
                    audit_change($db, $auth, 'SOCIOS', 'CREAR', 'socios', $partnerId, "Se creó el socio {$surname}, {$name}.", null, $after);
                    return $after ?? [];
                }

                $lock = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
                $lock->execute([$id]);
                $locked = $lock->fetch();
                if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
                $before = self::detalle($db, $id) ?? $locked;

                if ($locked['fecha_ingreso'] !== $admissionDate) {
                    $payments = $db->prepare(
                        'SELECT (SELECT COUNT(*) FROM pagos WHERE id_socio = ?) +
                                (SELECT COUNT(*) FROM pagos_inscripciones WHERE id_socio = ?)'
                    );
                    $payments->execute([$id, $id]);
                    if ((int)$payments->fetchColumn() > 0) {
                        api_error('No se puede modificar la fecha de ingreso porque el socio ya tiene pagos.', 'FECHA_INGRESO_BLOQUEADA');
                    }
                }

                $update = $db->prepare(
                    'UPDATE socios SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, sexo = ?, domicilio = ?,
                        id_localidad = ?, telefono = ?, email = ?, fecha_ingreso = ?, observaciones = ? WHERE id_socio = ?'
                );
                $update->execute([$name, $surname, $dni, $birthDate, $sex, $address, $locationId, $phone, $email, $admissionDate, $observations, $id]);
                if ($locked['fecha_ingreso'] !== $admissionDate) {
                    $db->prepare(
                        'UPDATE socios_periodos_activos SET vigente_desde = ?
                         WHERE id_socio = ? AND vigente_desde = ?'
                    )->execute([$admissionDate, $id, $locked['fecha_ingreso']]);
                    $db->prepare(
                        'UPDATE socio_categorias SET fecha_desde = ?
                         WHERE id_socio = ? AND fecha_desde = ?'
                    )->execute([$admissionDate, $id, $locked['fecha_ingreso']]);
                }
                self::sincronizarCategorias($db, $id, $categoryIds, $admissionDate, false);
                $after = self::detalle($db, $id);
                audit_change($db, $auth, 'SOCIOS', 'MODIFICAR', 'socios', $id, "Se modificó el socio {$surname}, {$name}.", $before, $after);
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                if (str_contains($error->getMessage(), 'uq_socio_categoria_activa')) {
                    api_error('El socio ya tiene esa categoría asignada como activa.', 'CATEGORIA_DUPLICADA', 409);
                }
                api_error('El DNI o alguno de los datos ingresados ya está registrado.', 'DNI_DUPLICADO');
            }
            throw $error;
        }

        return ['item' => $saved, 'creado' => $id === null];
    }

    private static function darBajaDatos(array $auth, int $id, string $date, string $reason): array
    {
        $db = $auth['db'];
        if ($date > date('Y-m-d')) {
            api_error('La fecha de baja no puede ser futura.', 'FECHA_BAJA_INVALIDA');
        }
        $saved = transaction($db, static function () use ($db, $auth, $id, $date, $reason): array {
            $statement = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if (!(bool)$locked['activo']) api_error('El socio ya se encuentra dado de baja.', 'ESTADO_SIN_CAMBIOS', 409);
            if ($date < $locked['fecha_ingreso']) {
                api_error('La fecha de baja no puede ser anterior a la fecha de ingreso.', 'FECHA_BAJA_INVALIDA');
            }
            $before = self::detalle($db, $id) ?? $locked;
            $period = $db->prepare(
                'SELECT id_periodo, vigente_desde FROM socios_periodos_activos
                 WHERE id_socio = ? AND vigente_hasta IS NULL FOR UPDATE'
            );
            $period->execute([$id]);
            $activePeriod = $period->fetch();
            if (!$activePeriod) api_error('El socio no tiene un período activo abierto. Ejecutá la migración SQL.', 'HISTORIAL_INCONSISTENTE', 409);
            if ($date < $activePeriod['vigente_desde']) {
                api_error('La fecha de baja no puede ser anterior a la última reactivación.', 'FECHA_BAJA_INVALIDA');
            }
            $db->prepare(
                'UPDATE socios_periodos_activos SET vigente_hasta = ?, motivo_baja = ? WHERE id_periodo = ?'
            )->execute([$date, $reason, $activePeriod['id_periodo']]);
            $db->prepare('UPDATE socios SET activo = 0, fecha_baja = ?, motivo_baja = ? WHERE id_socio = ?')->execute([$date, $reason, $id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'SOCIOS', 'DAR_BAJA', 'socios', $id, 'Se dio de baja al socio.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function reactivarDatos(array $auth, int $id): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id): array {
            $statement = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if ((bool)$locked['activo']) api_error('El socio ya se encuentra activo.', 'ESTADO_SIN_CAMBIOS', 409);
            $before = self::detalle($db, $id) ?? $locked;
            $today = date('Y-m-d');
            $openPeriod = $db->prepare(
                'SELECT id_periodo FROM socios_periodos_activos WHERE id_socio = ? AND vigente_hasta IS NULL FOR UPDATE'
            );
            $openPeriod->execute([$id]);
            if ($openPeriod->fetch()) api_error('El historial del socio ya tiene un período abierto.', 'HISTORIAL_INCONSISTENTE', 409);
            $db->prepare(
                'INSERT INTO socios_periodos_activos (id_socio, vigente_desde, vigente_hasta, motivo_baja)
                 VALUES (?, ?, NULL, NULL)'
            )->execute([$id, $today]);
            $db->prepare('UPDATE socios SET activo = 1, fecha_baja = NULL, motivo_baja = NULL WHERE id_socio = ?')->execute([$id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'SOCIOS', 'REACTIVAR', 'socios', $id, 'Se reactivó al socio.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function resolverLocalidad(PDO $db, array $auth, array $body, ?int $partnerId): int
    {
        if (!empty($body['localidad_nueva'])) {
            $name = clean_text($body['localidad_nueva'], 120);
            if ($name === '') api_error('Ingresá el nombre de la nueva localidad.', 'LOCALIDAD_INVALIDA');
            $existing = $db->prepare('SELECT id_localidad, activo FROM localidades WHERE nombre = ? LIMIT 1');
            $existing->execute([$name]);
            $row = $existing->fetch();
            if ($row) {
                if (!(bool)$row['activo']) api_error('La localidad existe pero está inactiva.', 'LOCALIDAD_INVALIDA');
                return (int)$row['id_localidad'];
            }
            try {
                $db->prepare('INSERT INTO localidades (nombre, activo) VALUES (?, 1)')->execute([$name]);
            } catch (Throwable $error) {
                if (!duplicate_key($error)) throw $error;
                $existing->execute([$name]);
                $row = $existing->fetch();
                if (!$row || !(bool)$row['activo']) api_error('La localidad existe pero está inactiva.', 'LOCALIDAD_INVALIDA');
                return (int)$row['id_localidad'];
            }
            $id = (int)$db->lastInsertId();
            audit_change($db, $auth, 'CONFIGURACION', 'CREAR_LOCALIDAD', 'localidades', $id, "Se creó la localidad {$name} desde Socios.", null, ['id_localidad' => $id, 'nombre' => $name]);
            return $id;
        }

        $id = positive_id($body['id_localidad'] ?? null, 'localidad');
        $statement = $db->prepare(
            'SELECT l.id_localidad
             FROM localidades l
             LEFT JOIN socios s ON s.id_socio = ? AND s.id_localidad = l.id_localidad
             WHERE l.id_localidad = ? AND (l.activo = 1 OR s.id_socio IS NOT NULL)'
        );
        $statement->execute([$partnerId ?? 0, $id]);
        if (!$statement->fetch()) {
            api_error('La localidad seleccionada no existe o está inactiva.', 'LOCALIDAD_INVALIDA');
        }
        return $id;
    }

    private static function validarCategorias(PDO $db, mixed $value, ?int $partnerId): array
    {
        $ids = id_list($value);
        if ($ids === []) return [];
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $db->prepare(
            "SELECT c.id_categoria
             FROM categorias c
             WHERE c.id_categoria IN ({$placeholders})
               AND (
                    c.activo = 1
                    OR EXISTS (
                        SELECT 1 FROM socio_categorias sc
                        WHERE sc.id_socio = ? AND sc.id_categoria = c.id_categoria AND sc.activo = 1
                    )
               )"
        );
        $statement->execute([...$ids, $partnerId ?? 0]);
        $valid = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
        sort($valid);
        $expected = $ids;
        sort($expected);
        if ($valid !== $expected) {
            api_error('Una categoría seleccionada no existe o está inactiva.', 'CATEGORIA_INACTIVA');
        }
        return $ids;
    }

    private static function sincronizarCategorias(PDO $db, int $partnerId, array $categoryIds, string $admissionDate, bool $isNew): void
    {
        $currentStatement = $db->prepare(
            'SELECT id_socio_categoria, id_categoria, activo, fecha_desde
             FROM socio_categorias WHERE id_socio = ? AND activo = 1 FOR UPDATE'
        );
        $currentStatement->execute([$partnerId]);
        $current = [];
        foreach ($currentStatement->fetchAll() as $row) $current[(int)$row['id_categoria']] = $row;
        $selected = array_fill_keys($categoryIds, true);
        $today = date('Y-m-d');
        $currentMonthStart = date('Y-m-01');
        $previousMonthEnd = (new DateTimeImmutable($currentMonthStart))
            ->modify('-1 day')
            ->format('Y-m-d');
        $currentMonthEnd = (new DateTimeImmutable($currentMonthStart))
            ->modify('last day of this month')
            ->format('Y-m-d');
        $paymentHistory = $db->prepare(
            'SELECT 1 FROM pagos WHERE id_socio = ? AND id_categoria = ? LIMIT 1'
        );
        $registrationHistory = $db->prepare(
            'SELECT 1 FROM pagos_inscripciones WHERE id_socio = ? AND id_categoria = ? LIMIT 1'
        );

        foreach ($current as $categoryId => $row) {
            if (!isset($selected[$categoryId])) {
                $paymentHistory->execute([$partnerId, $categoryId]);
                $hasHistory = (bool)$paymentHistory->fetchColumn();
                if (!$hasHistory) {
                    $registrationHistory->execute([$partnerId, $categoryId]);
                    $hasHistory = (bool)$registrationHistory->fetchColumn();
                }

                // Si se agregó y se quitó dentro del mismo mes sin registrar
                // nada, no existe una vigencia histórica real: se elimina la
                // asignación y desaparecen inmediatamente todas sus deudas.
                if ((string)$row['fecha_desde'] >= $currentMonthStart && !$hasHistory) {
                    $db->prepare('DELETE FROM socio_categorias WHERE id_socio_categoria = ?')
                        ->execute([$row['id_socio_categoria']]);
                    continue;
                }

                // Para una categoría con historia, la baja corta obligaciones
                // desde el mes actual. Se conserva únicamente hasta el cierre
                // del mes anterior. Si comenzó este mismo mes y ya tiene un
                // pago, se conserva ese mes histórico sin generar meses futuros.
                $until = (string)$row['fecha_desde'] <= $previousMonthEnd
                    ? $previousMonthEnd
                    : $currentMonthEnd;
                $db->prepare(
                    'UPDATE socio_categorias
                     SET activo = 0, fecha_hasta = ?, id_categoria_activa = NULL
                     WHERE id_socio_categoria = ?'
                )->execute([$until, $row['id_socio_categoria']]);
            }
        }
        foreach ($categoryIds as $categoryId) {
            if (isset($current[$categoryId])) continue;
            $from = $isNew ? $admissionDate : max($admissionDate, $today);
            $db->prepare('INSERT INTO socio_categorias (id_socio, id_categoria, fecha_desde, fecha_hasta, activo, id_categoria_activa) VALUES (?, ?, ?, NULL, 1, ?)')
                ->execute([$partnerId, $categoryId, $from, $categoryId]);
        }
    }
}

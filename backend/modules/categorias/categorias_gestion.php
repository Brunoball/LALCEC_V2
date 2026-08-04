<?php
declare(strict_types=1);

trait CategoriasGestion
{
    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_categoria']) && $body['id_categoria'] !== ''
            ? positive_id($body['id_categoria'], 'categoría')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 120);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $amount = decimal_amount($body['monto_actual'] ?? null, 'monto mensual');
        $effectiveDate = valid_date($body['vigente_desde'] ?? date('Y-m-d'), 'vigencia');
        if ($effectiveDate > date('Y-m-d')) {
            api_error('La fecha de vigencia no puede ser futura.', 'VIGENCIA_PRECIO_INVALIDA');
        }
        $reason = optional_text($body['motivo_precio'] ?? null, 255);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $name, $description, $amount, $effectiveDate, $reason): array {
                $duplicate = $db->prepare('SELECT id_categoria FROM categorias WHERE nombre = ? AND id_categoria <> ? LIMIT 1');
                $duplicate->execute([$name, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe otra categoría con ese nombre.', 'CATEGORIA_DUPLICADA');

                if ($id === null) {
                    $insert = $db->prepare('INSERT INTO categorias (nombre, descripcion, monto_actual, activo) VALUES (?, ?, ?, 1)');
                    $insert->execute([$name, $description, $amount]);
                    $categoryId = (int)$db->lastInsertId();
                    $db->prepare(
                        'INSERT INTO categorias_precios_historial
                         (id_categoria, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo)
                         VALUES (?, NULL, ?, ?, NULL, ?)'
                    )->execute([$categoryId, $amount, $effectiveDate, $reason ?? 'PRECIO INICIAL']);
                    $db->prepare(
                        'INSERT INTO categorias_periodos_activos (id_categoria, vigente_desde, vigente_hasta)
                         VALUES (?, ?, NULL)'
                    )->execute([$categoryId, $effectiveDate]);
                    $after = self::detalle($db, $categoryId);
                    audit_change($db, $auth, 'CATEGORIAS', 'CREAR', 'categorias', $categoryId, "Se creó la categoría {$name}.", null, $after);
                    return $after ?? [];
                }

                $lock = $db->prepare('SELECT * FROM categorias WHERE id_categoria = ? FOR UPDATE');
                $lock->execute([$id]);
                $locked = $lock->fetch();
                if (!$locked) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
                $before = self::detalle($db, $id) ?? $locked;
                $db->prepare('UPDATE categorias SET nombre = ?, descripcion = ? WHERE id_categoria = ?')->execute([$name, $description, $id]);

                if (number_format((float)$locked['monto_actual'], 2, '.', '') !== $amount) {
                    $lastStatement = $db->prepare(
                        'SELECT * FROM categorias_precios_historial
                         WHERE id_categoria = ? ORDER BY vigente_desde DESC, id_historial DESC LIMIT 1 FOR UPDATE'
                    );
                    $lastStatement->execute([$id]);
                    $last = $lastStatement->fetch();
                    if ($last && $effectiveDate < $last['vigente_desde']) {
                        api_error('La nueva vigencia no puede ser anterior al último precio registrado.', 'VIGENCIA_PRECIO_INVALIDA');
                    }
                    if ($last && $effectiveDate === $last['vigente_desde']) {
                        $db->prepare('UPDATE categorias_precios_historial SET monto_nuevo = ?, motivo = ? WHERE id_historial = ?')
                            ->execute([$amount, $reason ?? 'AJUSTE DEL MISMO DÍA', $last['id_historial']]);
                    } else {
                        if ($last) {
                            $dayBefore = (new DateTimeImmutable($effectiveDate))->modify('-1 day')->format('Y-m-d');
                            $db->prepare('UPDATE categorias_precios_historial SET vigente_hasta = ? WHERE id_historial = ?')
                                ->execute([$dayBefore, $last['id_historial']]);
                        }
                        $db->prepare(
                            'INSERT INTO categorias_precios_historial
                             (id_categoria, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo)
                             VALUES (?, ?, ?, ?, NULL, ?)'
                        )->execute([$id, $locked['monto_actual'], $amount, $effectiveDate, $reason ?? 'CAMBIO DE PRECIO']);
                    }
                    $db->prepare('UPDATE categorias SET monto_actual = ? WHERE id_categoria = ?')->execute([$amount, $id]);
                }

                $after = self::detalle($db, $id);
                audit_change($db, $auth, 'CATEGORIAS', 'MODIFICAR', 'categorias', $id, "Se modificó la categoría {$name}.", $before, $after);
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe una categoría con esos datos.', 'CATEGORIA_DUPLICADA');
            throw $error;
        }
        return ['item' => $saved, 'creada' => $id === null];
    }

    private static function cambiarEstadoDatos(array $auth, int $id, bool $active): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id, $active): array {
            $statement = $db->prepare('SELECT * FROM categorias WHERE id_categoria = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
            if ((bool)$locked['activo'] === $active) {
                api_error($active ? 'La categoría ya se encuentra activa.' : 'La categoría ya se encuentra dada de baja.', 'ESTADO_SIN_CAMBIOS', 409);
            }
            $before = self::detalle($db, $id) ?? $locked;
            $today = date('Y-m-d');
            if ($active) {
                $openPeriod = $db->prepare(
                    'SELECT id_periodo FROM categorias_periodos_activos
                     WHERE id_categoria = ? AND vigente_hasta IS NULL FOR UPDATE'
                );
                $openPeriod->execute([$id]);
                if ($openPeriod->fetch()) api_error('El historial de la categoría ya tiene un período abierto.', 'HISTORIAL_INCONSISTENTE', 409);
                $db->prepare(
                    'INSERT INTO categorias_periodos_activos (id_categoria, vigente_desde, vigente_hasta)
                     VALUES (?, ?, NULL)'
                )->execute([$id, $today]);
            } else {
                $openPeriod = $db->prepare(
                    'SELECT id_periodo, vigente_desde FROM categorias_periodos_activos
                     WHERE id_categoria = ? AND vigente_hasta IS NULL FOR UPDATE'
                );
                $openPeriod->execute([$id]);
                $period = $openPeriod->fetch();
                if (!$period) api_error('La categoría no tiene un período activo abierto. Ejecutá la migración SQL.', 'HISTORIAL_INCONSISTENTE', 409);
                $until = max((string)$period['vigente_desde'], $today);
                $db->prepare('UPDATE categorias_periodos_activos SET vigente_hasta = ? WHERE id_periodo = ?')
                    ->execute([$until, $period['id_periodo']]);
            }
            $db->prepare('UPDATE categorias SET activo = ? WHERE id_categoria = ?')->execute([$active ? 1 : 0, $id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'CATEGORIAS', $active ? 'REACTIVAR' : 'DAR_BAJA', 'categorias', $id, $active ? 'Se reactivó la categoría.' : 'Se dio de baja la categoría.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }
}

<?php
declare(strict_types=1);

trait ConfiguracionGestion
{
    private static function guardarParametrosDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $amount = decimal_amount($body['monto_inscripcion'] ?? null, 'monto de inscripción', 0.01);

        return transaction($db, static function () use ($db, $auth, $amount): array {
            $statement = $db->prepare(
                "SELECT id_modalidad_pago, monto_fijo
                 FROM modalidades_pago
                 WHERE codigo = 'INSCRIPCION'
                 LIMIT 1
                 FOR UPDATE"
            );
            $statement->execute();
            $row = $statement->fetch();
            if (!$row) {
                api_error(
                    'No existe la modalidad INSCRIPCION en la base del sistema.',
                    'MODALIDAD_INSCRIPCION_NO_CONFIGURADA',
                    500
                );
            }

            $before = [
                'monto_inscripcion' => number_format((float)($row['monto_fijo'] ?? 0), 2, '.', ''),
            ];
            $db->prepare('UPDATE modalidades_pago SET monto_fijo = ? WHERE id_modalidad_pago = ?')
                ->execute([$amount, (int)$row['id_modalidad_pago']]);
            $after = ['monto_inscripcion' => $amount];

            audit_change(
                $db,
                $auth,
                'CONFIGURACION',
                'MODIFICAR_MONTO_INSCRIPCION',
                'modalidades_pago',
                (int)$row['id_modalidad_pago'],
                'Se modificó el monto predeterminado de inscripción.',
                $before,
                $after
            );
            return ['parametros' => $after];
        });
    }

    private static function guardarItemDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $definition = configuracion_lista_definicion($body['lista'] ?? null);
        $idText = trim((string)($body['id'] ?? ''));
        $id = $idText === '' ? null : positive_id($idText, 'opción');
        $name = required_text(
            $body,
            'nombre',
            $definition['etiqueta'],
            (int)$definition['max_nombre']
        );
        $postalCode = $definition['lista'] === 'localidades'
            ? optional_text($body['codigo_postal'] ?? null, 20)
            : null;

        if ($definition['lista'] === 'medios_pago' && configuracion_es_medio_interno($name)) {
            api_error('CONDONACIÓN es un medio interno del sistema y no se puede administrar.', 'MEDIO_PAGO_RESERVADO');
        }

        try {
            return transaction($db, static function () use (
                $db,
                $auth,
                $definition,
                $id,
                $name,
                $postalCode
            ): array {
                $before = null;
                if ($id !== null) {
                    $before = configuracion_item($db, $definition, $id, true);
                    if (!$before) api_error('La opción que intentás editar no existe.', 'OPCION_NO_ENCONTRADA', 404);
                    if ($definition['lista'] === 'medios_pago' && configuracion_es_medio_interno((string)$before['nombre'])) {
                        api_error('El medio interno CONDONACIÓN no se puede modificar.', 'MEDIO_PAGO_RESERVADO');
                    }
                    self::validarNombreDuplicado($db, $definition, $name, $id);
                    self::actualizarItem($db, $definition, $id, $name, $postalCode);
                    $savedId = $id;
                    $action = 'MODIFICAR_' . $definition['entidad'];
                    $description = 'Se modificó una opción de configuración.';
                } else {
                    self::validarNombreDuplicado($db, $definition, $name, null);
                    $savedId = self::insertarItem($db, $definition, $name, $postalCode);
                    $action = 'CREAR_' . $definition['entidad'];
                    $description = 'Se creó una opción de configuración.';
                }

                $after = configuracion_item($db, $definition, $savedId);
                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    $action,
                    $definition['tabla'],
                    $savedId,
                    $description,
                    $before,
                    $after
                );

                return [
                    'creado' => $id === null,
                    'lista' => $definition['lista'],
                    'item' => $after,
                ];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('Ya existe una opción con ese nombre.', 'NOMBRE_DUPLICADO', 409);
            }
            throw $error;
        }
    }

    private static function cambiarEstadoItemDatos(array $auth, array $body, bool $active): array
    {
        $db = $auth['db'];
        $definition = configuracion_lista_definicion($body['lista'] ?? null);
        $id = positive_id($body['id'] ?? null, 'opción');

        return transaction($db, static function () use ($db, $auth, $definition, $id, $active): array {
            $before = configuracion_item($db, $definition, $id, true);
            if (!$before) api_error('La opción seleccionada no existe.', 'OPCION_NO_ENCONTRADA', 404);
            if ($definition['lista'] === 'medios_pago' && configuracion_es_medio_interno((string)$before['nombre'])) {
                api_error('El medio interno CONDONACIÓN no se puede eliminar ni reactivar.', 'MEDIO_PAGO_RESERVADO');
            }

            $usageCount = configuracion_cantidad_usos($db, $definition, $id);
            if ($active) {
                if ((bool)$before['activo']) {
                    api_error('La opción ya se encuentra activa.', 'ESTADO_SIN_CAMBIOS', 409);
                }
                self::actualizarEstado($db, $definition, $id, true);
                $after = configuracion_item($db, $definition, $id);
                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    'REACTIVAR_' . $definition['entidad'],
                    $definition['tabla'],
                    $id,
                    'Se reactivó una opción de configuración.',
                    $before,
                    $after
                );
                return [
                    'lista' => $definition['lista'],
                    'item' => $after,
                    'eliminado_definitivo' => false,
                    'desactivado' => false,
                ];
            }

            if ($definition['lista'] === 'medios_pago' && (bool)$before['activo']) {
                $statement = $db->prepare(
                    "SELECT COUNT(*)
                     FROM medios_pago
                     WHERE activo = 1
                       AND id_medio_pago <> ?
                       AND nombre <> 'CONDONACIÓN'"
                );
                $statement->execute([$id]);
                if ((int)$statement->fetchColumn() === 0) {
                    api_error(
                        'Debe quedar al menos un medio de pago activo para registrar movimientos.',
                        'ULTIMO_MEDIO_PAGO_ACTIVO',
                        409
                    );
                }
            }

            if ($usageCount === 0) {
                self::eliminarItemFisico($db, $definition, $id);
                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    'ELIMINAR_' . $definition['entidad'],
                    $definition['tabla'],
                    $id,
                    'Se eliminó definitivamente una opción de configuración sin uso.',
                    $before,
                    null
                );
                return [
                    'lista' => $definition['lista'],
                    'item' => null,
                    'eliminado_definitivo' => true,
                    'desactivado' => false,
                ];
            }

            if (!(bool)$before['activo']) {
                api_error(
                    'La opción ya está inactiva porque posee registros asociados.',
                    'ESTADO_SIN_CAMBIOS',
                    409
                );
            }

            self::actualizarEstado($db, $definition, $id, false);
            $after = configuracion_item($db, $definition, $id);
            audit_change(
                $db,
                $auth,
                'CONFIGURACION',
                'DESACTIVAR_' . $definition['entidad'],
                $definition['tabla'],
                $id,
                'Se desactivó una opción de configuración porque posee registros asociados.',
                $before,
                $after
            );
            return [
                'lista' => $definition['lista'],
                'item' => $after,
                'eliminado_definitivo' => false,
                'desactivado' => true,
            ];
        });
    }

    private static function validarNombreDuplicado(PDO $db, array $definition, string $name, ?int $excludeId): void
    {
        if ($definition['tabla'] === 'contable_opciones') {
            $sql = 'SELECT id_opcion, activo FROM contable_opciones WHERE tipo = ? AND nombre = ?';
            $params = [$definition['tipo'], $name];
            if ($excludeId !== null) {
                $sql .= ' AND id_opcion <> ?';
                $params[] = $excludeId;
            }
        } else {
            $sql = "SELECT {$definition['id_campo']} AS id, activo FROM {$definition['tabla']} WHERE nombre = ?";
            $params = [$name];
            if ($excludeId !== null) {
                $sql .= " AND {$definition['id_campo']} <> ?";
                $params[] = $excludeId;
            }
        }
        $sql .= ' LIMIT 1';
        $statement = $db->prepare($sql);
        $statement->execute($params);
        $existing = $statement->fetch();
        if ($existing) {
            api_error(
                (bool)$existing['activo']
                    ? 'Ya existe una opción activa con ese nombre.'
                    : 'Esa opción ya existe inactiva. Podés reactivarla desde la lista.',
                'NOMBRE_DUPLICADO',
                409
            );
        }
    }

    private static function actualizarItem(PDO $db, array $definition, int $id, string $name, ?string $postalCode): void
    {
        if ($definition['lista'] === 'medios_pago') {
            $db->prepare('UPDATE medios_pago SET nombre = ? WHERE id_medio_pago = ?')->execute([$name, $id]);
        } elseif ($definition['lista'] === 'localidades') {
            $db->prepare('UPDATE localidades SET nombre = ?, codigo_postal = ? WHERE id_localidad = ?')
                ->execute([$name, $postalCode, $id]);
        } else {
            $db->prepare('UPDATE contable_opciones SET nombre = ? WHERE id_opcion = ? AND tipo = ?')
                ->execute([$name, $id, $definition['tipo']]);
        }
    }

    private static function insertarItem(PDO $db, array $definition, string $name, ?string $postalCode): int
    {
        if ($definition['lista'] === 'medios_pago') {
            $db->prepare('INSERT INTO medios_pago (nombre, activo) VALUES (?, 1)')->execute([$name]);
        } elseif ($definition['lista'] === 'localidades') {
            $db->prepare('INSERT INTO localidades (nombre, codigo_postal, activo) VALUES (?, ?, 1)')
                ->execute([$name, $postalCode]);
        } else {
            $db->prepare('INSERT INTO contable_opciones (tipo, nombre, activo) VALUES (?, ?, 1)')
                ->execute([$definition['tipo'], $name]);
        }
        return (int)$db->lastInsertId();
    }

    private static function actualizarEstado(PDO $db, array $definition, int $id, bool $active): void
    {
        $value = $active ? 1 : 0;
        if ($definition['tabla'] === 'contable_opciones') {
            $db->prepare('UPDATE contable_opciones SET activo = ? WHERE id_opcion = ? AND tipo = ?')
                ->execute([$value, $id, $definition['tipo']]);
        } else {
            $db->prepare("UPDATE {$definition['tabla']} SET activo = ? WHERE {$definition['id_campo']} = ?")
                ->execute([$value, $id]);
        }
    }

    private static function eliminarItemFisico(PDO $db, array $definition, int $id): void
    {
        if ($definition['tabla'] === 'contable_opciones') {
            $db->prepare('DELETE FROM contable_opciones WHERE id_opcion = ? AND tipo = ?')
                ->execute([$id, $definition['tipo']]);
        } else {
            $db->prepare("DELETE FROM {$definition['tabla']} WHERE {$definition['id_campo']} = ?")
                ->execute([$id]);
        }
    }
}

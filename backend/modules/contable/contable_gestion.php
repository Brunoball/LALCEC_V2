<?php
declare(strict_types=1);

trait ContableGestion
{
    protected static function guardarOpcionDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $type = self::tipoOpcion($body['tipo'] ?? null);
        $name = required_text($body, 'nombre', 'nombre', 160);

        try {
            return transaction($db, static function () use ($db, $auth, $type, $name): array {
                $statement = $db->prepare('SELECT id_opcion, activo FROM contable_opciones WHERE tipo = ? AND nombre = ? LIMIT 1 FOR UPDATE');
                $statement->execute([$type, $name]);
                $existing = $statement->fetch();
                if ($existing) {
                    if ((bool)$existing['activo']) api_error('Esa opción ya existe.', 'OPCION_DUPLICADA', 409);
                    $id = (int)$existing['id_opcion'];
                    $db->prepare('UPDATE contable_opciones SET activo = 1 WHERE id_opcion = ?')->execute([$id]);
                    $action = 'REACTIVAR_OPCION';
                } else {
                    $db->prepare('INSERT INTO contable_opciones (tipo, nombre, activo) VALUES (?, ?, 1)')->execute([$type, $name]);
                    $id = (int)$db->lastInsertId();
                    $action = 'CREAR_OPCION';
                }
                $after = ['id_opcion' => $id, 'tipo' => $type, 'nombre' => $name, 'activo' => true];
                audit_change($db, $auth, 'CONTABLE', $action, 'contable_opciones', $id, 'Se agregó una opción al catálogo contable.', null, $after);
                return ['item' => $after];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Esa opción ya existe.', 'OPCION_DUPLICADA', 409);
            throw $error;
        }
    }

    protected static function guardarIngresoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = self::idOpcional($body['id_ingreso'] ?? null, 'ingreso');
        $date = valid_date($body['fecha'] ?? null, 'ingreso');
        $amount = decimal_amount($body['importe'] ?? null, 'importe', 0.01, 999999999999.99);
        $detail = optional_text($body['detalle'] ?? null, 500);
        $mean = self::medioPago($db, positive_id($body['id_medio_pago'] ?? null, 'medio de pago'));
        $provider = self::opcion($db, positive_id($body['id_proveedor'] ?? null, 'proveedor'), 'PROVEEDOR');
        $category = self::opcion($db, positive_id($body['id_categoria'] ?? null, 'categoría'), 'CATEGORIA_INGRESO');
        $concept = self::opcion($db, positive_id($body['id_concepto'] ?? null, 'concepto'), 'CONCEPTO_INGRESO');

        return transaction($db, static function () use ($db, $auth, $id, $date, $amount, $detail, $mean, $provider, $category, $concept): array {
            $before = null;
            if ($id !== null) {
                $statement = $db->prepare('SELECT * FROM contable_ingresos WHERE id_ingreso = ? AND estado = \'ACTIVO\' LIMIT 1 FOR UPDATE');
                $statement->execute([$id]);
                $before = $statement->fetch();
                if (!$before) api_error('El ingreso que intentás editar no existe.', 'INGRESO_NO_ENCONTRADO', 404);
                if ((string)($before['origen_modulo'] ?? 'MANUAL') !== 'MANUAL') {
                    api_error(
                        'Este ingreso fue generado automáticamente. Modificalo desde el módulo que lo originó.',
                        'INGRESO_AUTOMATICO_PROTEGIDO',
                        409
                    );
                }
                $db->prepare(
                    'UPDATE contable_ingresos SET fecha = ?, id_medio_pago = ?, id_proveedor = ?, id_categoria = ?, id_concepto = ?,
                     importe = ?, detalle = ?, medio_pago_snapshot = ?, proveedor_snapshot = ?, categoria_snapshot = ?, concepto_snapshot = ?,
                     id_usuario_master_modificacion = ? WHERE id_ingreso = ?'
                )->execute([
                    $date, $mean['id_medio_pago'], $provider['id_opcion'], $category['id_opcion'], $concept['id_opcion'],
                    $amount, $detail, $mean['nombre'], $provider['nombre'], $category['nombre'], $concept['nombre'],
                    $auth['id_usuario_master'], $id,
                ]);
                $savedId = $id;
                $action = 'MODIFICAR_INGRESO';
            } else {
                $db->prepare(
                    'INSERT INTO contable_ingresos
                     (fecha, id_medio_pago, id_proveedor, id_categoria, id_concepto, importe, detalle,
                      medio_pago_snapshot, proveedor_snapshot, categoria_snapshot, concepto_snapshot,
                      id_usuario_master_creacion, id_usuario_master_modificacion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $date, $mean['id_medio_pago'], $provider['id_opcion'], $category['id_opcion'], $concept['id_opcion'],
                    $amount, $detail, $mean['nombre'], $provider['nombre'], $category['nombre'], $concept['nombre'],
                    $auth['id_usuario_master'], $auth['id_usuario_master'],
                ]);
                $savedId = (int)$db->lastInsertId();
                $action = 'CREAR_INGRESO';
            }
            $statement = $db->prepare('SELECT * FROM contable_ingresos WHERE id_ingreso = ? LIMIT 1');
            $statement->execute([$savedId]);
            $after = $statement->fetch();
            audit_change($db, $auth, 'CONTABLE', $action, 'contable_ingresos', $savedId, 'Se registró o modificó un ingreso manual.', $before, $after);
            return ['id_ingreso' => $savedId];
        });
    }

    protected static function anularIngresoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_ingreso'] ?? null, 'ingreso');
        return transaction($db, static function () use ($db, $auth, $id): array {
            $statement = $db->prepare('SELECT * FROM contable_ingresos WHERE id_ingreso = ? AND estado = \'ACTIVO\' LIMIT 1 FOR UPDATE');
            $statement->execute([$id]);
            $before = $statement->fetch();
            if (!$before) api_error('El ingreso no existe o ya fue anulado.', 'INGRESO_NO_ENCONTRADO', 404);
            if ((string)($before['origen_modulo'] ?? 'MANUAL') !== 'MANUAL') {
                api_error(
                    'Este ingreso fue generado automáticamente. Anulalo desde el módulo que lo originó.',
                    'INGRESO_AUTOMATICO_PROTEGIDO',
                    409
                );
            }
            $db->prepare("UPDATE contable_ingresos SET estado = 'ANULADO', fecha_anulacion = NOW(), id_usuario_master_modificacion = ? WHERE id_ingreso = ?")
                ->execute([$auth['id_usuario_master'], $id]);
            audit_change($db, $auth, 'CONTABLE', 'ANULAR_INGRESO', 'contable_ingresos', $id, 'Se anuló un ingreso manual.', $before, ['estado' => 'ANULADO']);
            return ['id_ingreso' => $id];
        });
    }

    protected static function guardarEgresoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = self::idOpcional($body['id_egreso'] ?? null, 'egreso');
        $date = valid_date($body['fecha'] ?? null, 'egreso');
        $amount = decimal_amount($body['importe'] ?? null, 'importe', 0.01, 999999999999.99);
        $voucher = optional_text($body['numero_comprobante'] ?? null, 120);
        $detail = optional_text($body['detalle'] ?? null, 500);
        $removeFile = filter_var($body['eliminar_archivo'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $mean = self::medioPago($db, positive_id($body['id_medio_pago'] ?? null, 'medio de pago'));
        $provider = self::opcion($db, positive_id($body['id_proveedor'] ?? null, 'proveedor'), 'PROVEEDOR');
        $category = self::opcion($db, positive_id($body['id_categoria'] ?? null, 'categoría'), 'CATEGORIA_EGRESO');
        $concept = self::opcion($db, positive_id($body['id_concepto'] ?? null, 'concepto'), 'CONCEPTO_EGRESO');
        $newFile = self::guardarArchivoEgreso($auth);
        $oldFileToDelete = null;

        try {
            $result = transaction($db, static function () use (
                $db, $auth, $id, $date, $amount, $voucher, $detail, $removeFile,
                $mean, $provider, $category, $concept, $newFile, &$oldFileToDelete
            ): array {
                $before = null;
                $fileData = [
                    'archivo_nombre_original' => $newFile['archivo_nombre_original'] ?? null,
                    'archivo_nombre_guardado' => $newFile['archivo_nombre_guardado'] ?? null,
                    'archivo_mime' => $newFile['archivo_mime'] ?? null,
                    'archivo_tamanio' => $newFile['archivo_tamanio'] ?? null,
                    'archivo_path' => $newFile['archivo_path'] ?? null,
                ];

                if ($id !== null) {
                    $statement = $db->prepare('SELECT * FROM contable_egresos WHERE id_egreso = ? AND estado = \'ACTIVO\' LIMIT 1 FOR UPDATE');
                    $statement->execute([$id]);
                    $before = $statement->fetch();
                    if (!$before) api_error('El egreso que intentás editar no existe.', 'EGRESO_NO_ENCONTRADO', 404);
                    if ($newFile === null && !$removeFile) {
                        foreach (array_keys($fileData) as $field) $fileData[$field] = $before[$field];
                    }
                    if (($newFile !== null || $removeFile) && !empty($before['archivo_path'])) {
                        $oldFileToDelete = (string)$before['archivo_path'];
                    }
                    $db->prepare(
                        'UPDATE contable_egresos SET fecha = ?, id_medio_pago = ?, id_proveedor = ?, id_categoria = ?, id_concepto = ?,
                         numero_comprobante = ?, importe = ?, detalle = ?, medio_pago_snapshot = ?, proveedor_snapshot = ?, categoria_snapshot = ?,
                         concepto_snapshot = ?, archivo_nombre_original = ?, archivo_nombre_guardado = ?, archivo_mime = ?, archivo_tamanio = ?,
                         archivo_path = ?, id_usuario_master_modificacion = ? WHERE id_egreso = ?'
                    )->execute([
                        $date, $mean['id_medio_pago'], $provider['id_opcion'], $category['id_opcion'], $concept['id_opcion'],
                        $voucher, $amount, $detail, $mean['nombre'], $provider['nombre'], $category['nombre'], $concept['nombre'],
                        $fileData['archivo_nombre_original'], $fileData['archivo_nombre_guardado'], $fileData['archivo_mime'],
                        $fileData['archivo_tamanio'], $fileData['archivo_path'], $auth['id_usuario_master'], $id,
                    ]);
                    $savedId = $id;
                    $action = 'MODIFICAR_EGRESO';
                } else {
                    $db->prepare(
                        'INSERT INTO contable_egresos
                         (fecha, id_medio_pago, id_proveedor, id_categoria, id_concepto, numero_comprobante, importe, detalle,
                          medio_pago_snapshot, proveedor_snapshot, categoria_snapshot, concepto_snapshot,
                          archivo_nombre_original, archivo_nombre_guardado, archivo_mime, archivo_tamanio, archivo_path,
                          id_usuario_master_creacion, id_usuario_master_modificacion)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    )->execute([
                        $date, $mean['id_medio_pago'], $provider['id_opcion'], $category['id_opcion'], $concept['id_opcion'],
                        $voucher, $amount, $detail, $mean['nombre'], $provider['nombre'], $category['nombre'], $concept['nombre'],
                        $fileData['archivo_nombre_original'], $fileData['archivo_nombre_guardado'], $fileData['archivo_mime'],
                        $fileData['archivo_tamanio'], $fileData['archivo_path'], $auth['id_usuario_master'], $auth['id_usuario_master'],
                    ]);
                    $savedId = (int)$db->lastInsertId();
                    $action = 'CREAR_EGRESO';
                }
                $statement = $db->prepare('SELECT * FROM contable_egresos WHERE id_egreso = ? LIMIT 1');
                $statement->execute([$savedId]);
                $after = $statement->fetch();
                audit_change($db, $auth, 'CONTABLE', $action, 'contable_egresos', $savedId, 'Se registró o modificó un egreso.', $before, $after);
                return ['id_egreso' => $savedId];
            });
        } catch (Throwable $error) {
            if ($newFile && !empty($newFile['absolute_path']) && is_file($newFile['absolute_path'])) @unlink($newFile['absolute_path']);
            throw $error;
        }

        if ($oldFileToDelete) self::borrarArchivoFisico($auth, $oldFileToDelete);
        return $result;
    }

    protected static function anularEgresoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_egreso'] ?? null, 'egreso');
        return transaction($db, static function () use ($db, $auth, $id): array {
            $statement = $db->prepare('SELECT * FROM contable_egresos WHERE id_egreso = ? AND estado = \'ACTIVO\' LIMIT 1 FOR UPDATE');
            $statement->execute([$id]);
            $before = $statement->fetch();
            if (!$before) api_error('El egreso no existe o ya fue anulado.', 'EGRESO_NO_ENCONTRADO', 404);
            $db->prepare("UPDATE contable_egresos SET estado = 'ANULADO', fecha_anulacion = NOW(), id_usuario_master_modificacion = ? WHERE id_egreso = ?")
                ->execute([$auth['id_usuario_master'], $id]);
            audit_change($db, $auth, 'CONTABLE', 'ANULAR_EGRESO', 'contable_egresos', $id, 'Se anuló un egreso.', $before, ['estado' => 'ANULADO']);
            return ['id_egreso' => $id];
        });
    }
}

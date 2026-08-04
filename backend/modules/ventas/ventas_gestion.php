<?php
declare(strict_types=1);

trait VentasGestion
{
    protected static function guardarConfiguracionVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = self::idOpcionalVenta($body['id_configuracion'] ?? null, 'configuración');
        $name = required_text($body, 'nombre', 'nombre', 150);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $impact = self::booleanoVenta($body['impacta_contable'] ?? true);
        $manualPrice = self::booleanoVenta($body['permite_precio_manual'] ?? false);
        $requiresBuyer = self::booleanoVenta($body['solicita_comprador'] ?? false);
        $providerId = self::idOpcionalVenta($body['id_proveedor_contable'] ?? null, 'origen contable');
        $categoryId = self::idOpcionalVenta($body['id_categoria_contable'] ?? null, 'categoría contable');
        $conceptId = self::idOpcionalVenta($body['id_concepto_contable'] ?? null, 'concepto contable');
        if ($impact && ($providerId === null || $categoryId === null || $conceptId === null)) {
            api_error('Completá origen, categoría y concepto para generar ingresos contables.', 'IMPUTACION_CONTABLE_INCOMPLETA');
        }
        if ($providerId !== null) self::opcionVenta($db, $providerId, 'PROVEEDOR');
        if ($categoryId !== null) self::opcionVenta($db, $categoryId, 'CATEGORIA_INGRESO');
        if ($conceptId !== null) self::opcionVenta($db, $conceptId, 'CONCEPTO_INGRESO');

        try {
            return transaction($db, static function () use (
                $db, $auth, $id, $name, $description, $impact, $manualPrice,
                $requiresBuyer, $providerId, $categoryId, $conceptId
            ): array {
                $before = null;
                if ($id !== null) {
                    $before = self::configuracionVenta($db, $id, false, true);
                    $db->prepare(
                        'UPDATE ventas_configuraciones
                         SET nombre = ?, descripcion = ?, impacta_contable = ?,
                             id_proveedor_contable = ?, id_categoria_contable = ?, id_concepto_contable = ?,
                             permite_precio_manual = ?, solicita_comprador = ?, id_usuario_master_modificacion = ?
                         WHERE id_configuracion = ?'
                    )->execute([
                        $name, $description, $impact ? 1 : 0,
                        $providerId, $categoryId, $conceptId,
                        $manualPrice ? 1 : 0, $requiresBuyer ? 1 : 0,
                        $auth['id_usuario_master'], $id,
                    ]);
                    $savedId = $id;
                    $action = 'MODIFICAR_CONFIGURACION';
                } else {
                    $db->prepare(
                        'INSERT INTO ventas_configuraciones
                         (nombre, descripcion, impacta_contable,
                          id_proveedor_contable, id_categoria_contable, id_concepto_contable,
                          permite_precio_manual, solicita_comprador, activo,
                          id_usuario_master_creacion, id_usuario_master_modificacion)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
                    )->execute([
                        $name, $description, $impact ? 1 : 0,
                        $providerId, $categoryId, $conceptId,
                        $manualPrice ? 1 : 0, $requiresBuyer ? 1 : 0,
                        $auth['id_usuario_master'], $auth['id_usuario_master'],
                    ]);
                    $savedId = (int)$db->lastInsertId();
                    $action = 'CREAR_CONFIGURACION';
                }
                $after = self::configuracionVenta($db, $savedId);
                audit_change($db, $auth, 'VENTAS', $action, 'ventas_configuraciones', $savedId, 'Se guardó una configuración de venta.', $before, $after);
                return ['item' => $after];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe una configuración con ese nombre.', 'CONFIGURACION_DUPLICADA', 409);
            throw $error;
        }
    }

    protected static function cambiarEstadoConfiguracionVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_configuracion'] ?? null, 'configuración');
        $active = self::booleanoVenta($body['activo'] ?? false);
        return transaction($db, static function () use ($db, $auth, $id, $active): array {
            $before = self::configuracionVenta($db, $id, false, true);
            $db->prepare('UPDATE ventas_configuraciones SET activo = ?, id_usuario_master_modificacion = ? WHERE id_configuracion = ?')
                ->execute([$active ? 1 : 0, $auth['id_usuario_master'], $id]);
            $after = self::configuracionVenta($db, $id);
            audit_change($db, $auth, 'VENTAS', $active ? 'REACTIVAR_CONFIGURACION' : 'DESACTIVAR_CONFIGURACION', 'ventas_configuraciones', $id, 'Se modificó el estado de una configuración de venta.', $before, $after);
            return ['item' => $after];
        });
    }

    protected static function eliminarConfiguracionVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_configuracion'] ?? null, 'configuración');

        try {
            return transaction($db, static function () use ($db, $auth, $id): array {
                $before = self::configuracionVenta($db, $id, false, true);

                $statement = $db->prepare(
                    'SELECT COUNT(*)
                     FROM ventas_operaciones
                     WHERE id_configuracion = ?'
                );
                $statement->execute([$id]);
                $salesCount = (int)$statement->fetchColumn();

                if ($salesCount > 0) {
                    api_error(
                        'Esta configuración ya tiene ventas asociadas y no puede eliminarse. Podés darla de baja para conservar el historial.',
                        'CONFIGURACION_VENTA_EN_USO',
                        409,
                        ['ventas_asociadas' => $salesCount]
                    );
                }

                $db->prepare('DELETE FROM ventas_configuraciones WHERE id_configuracion = ?')
                    ->execute([$id]);

                audit_change(
                    $db,
                    $auth,
                    'VENTAS',
                    'ELIMINAR_CONFIGURACION',
                    'ventas_configuraciones',
                    $id,
                    'Se eliminó definitivamente una configuración de venta sin operaciones asociadas.',
                    $before,
                    null
                );

                return ['id_configuracion' => $id];
            });
        } catch (PDOException $error) {
            if ((string)$error->getCode() === '23000') {
                api_error(
                    'Esta configuración está vinculada con otros registros y no puede eliminarse. Podés darla de baja.',
                    'CONFIGURACION_VENTA_EN_USO',
                    409
                );
            }
            throw $error;
        }
    }

    protected static function guardarProductoVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = self::idOpcionalVenta($body['id_producto'] ?? null, 'producto');
        $code = optional_text($body['codigo'] ?? null, 60);
        $name = required_text($body, 'nombre', 'nombre', 160);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $price = decimal_amount($body['precio'] ?? null, 'precio', 0, 999999999999.99);
        $controlsStock = self::booleanoVenta($body['controla_stock'] ?? false);
        $stock = self::cantidadStock($body['stock_actual'] ?? 0, 'stock actual');
        $minimum = self::cantidadStock($body['stock_minimo'] ?? 0, 'stock mínimo');

        try {
            return transaction($db, static function () use (
                $db, $auth, $id, $code, $name, $description, $price, $controlsStock, $stock, $minimum
            ): array {
                $before = null;
                if ($id !== null) {
                    $statement = $db->prepare('SELECT * FROM ventas_productos WHERE id_producto = ? LIMIT 1 FOR UPDATE');
                    $statement->execute([$id]);
                    $before = $statement->fetch();
                    if (!$before) api_error('El producto seleccionado no existe.', 'PRODUCTO_NO_ENCONTRADO', 404);
                    $db->prepare(
                        'UPDATE ventas_productos
                         SET codigo = ?, nombre = ?, descripcion = ?, precio = ?, controla_stock = ?,
                             stock_actual = ?, stock_minimo = ?, id_usuario_master_modificacion = ?
                         WHERE id_producto = ?'
                    )->execute([
                        $code, $name, $description, $price, $controlsStock ? 1 : 0,
                        $stock, $minimum, $auth['id_usuario_master'], $id,
                    ]);
                    $savedId = $id;
                    $action = 'MODIFICAR_PRODUCTO';

                    if (abs((float)$before['stock_actual'] - (float)$stock) > 0.0005) {
                        $db->prepare(
                            'INSERT INTO ventas_stock_movimientos
                             (id_producto, id_venta, tipo, cantidad, stock_anterior, stock_nuevo, detalle, id_usuario_master)
                             VALUES (?, NULL, \'AJUSTE\', ?, ?, ?, ?, ?)'
                        )->execute([
                            $savedId,
                            number_format((float)$stock - (float)$before['stock_actual'], 3, '.', ''),
                            number_format((float)$before['stock_actual'], 3, '.', ''),
                            $stock,
                            'AJUSTE MANUAL DESDE PRODUCTOS',
                            $auth['id_usuario_master'],
                        ]);
                    }
                } else {
                    $db->prepare(
                        'INSERT INTO ventas_productos
                         (codigo, nombre, descripcion, precio, controla_stock, stock_actual, stock_minimo,
                          activo, id_usuario_master_creacion, id_usuario_master_modificacion)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
                    )->execute([
                        $code, $name, $description, $price, $controlsStock ? 1 : 0,
                        $stock, $minimum, $auth['id_usuario_master'], $auth['id_usuario_master'],
                    ]);
                    $savedId = (int)$db->lastInsertId();
                    $action = 'CREAR_PRODUCTO';
                    if ((float)$stock > 0) {
                        $db->prepare(
                            'INSERT INTO ventas_stock_movimientos
                             (id_producto, id_venta, tipo, cantidad, stock_anterior, stock_nuevo, detalle, id_usuario_master)
                             VALUES (?, NULL, \'AJUSTE\', ?, 0, ?, ?, ?)'
                        )->execute([$savedId, $stock, $stock, 'STOCK INICIAL', $auth['id_usuario_master']]);
                    }
                }
                $statement = $db->prepare(
                    'SELECT vp.*, (vp.controla_stock = 1 AND vp.stock_actual <= vp.stock_minimo) AS stock_bajo
                     FROM ventas_productos vp WHERE id_producto = ? LIMIT 1'
                );
                $statement->execute([$savedId]);
                $after = self::mapearProducto($statement->fetch());
                audit_change($db, $auth, 'VENTAS', $action, 'ventas_productos', $savedId, 'Se guardó un producto o servicio.', $before, $after);
                return ['item' => $after];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe un producto con ese código.', 'CODIGO_PRODUCTO_DUPLICADO', 409);
            throw $error;
        }
    }

    protected static function cantidadStock(mixed $value, string $label): string
    {
        if ($value === '' || $value === null || !is_numeric($value)) {
            api_error("El campo {$label} no es válido.", 'VALIDATION_ERROR');
        }
        $number = (float)$value;
        if ($number < 0 || $number > 99999999999.999) {
            api_error("El campo {$label} está fuera del rango permitido.", 'VALIDATION_ERROR');
        }
        return number_format($number, 3, '.', '');
    }

    protected static function cambiarEstadoProductoVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_producto'] ?? null, 'producto');
        $active = self::booleanoVenta($body['activo'] ?? false);
        return transaction($db, static function () use ($db, $auth, $id, $active): array {
            $statement = $db->prepare('SELECT * FROM ventas_productos WHERE id_producto = ? LIMIT 1 FOR UPDATE');
            $statement->execute([$id]);
            $before = $statement->fetch();
            if (!$before) api_error('El producto seleccionado no existe.', 'PRODUCTO_NO_ENCONTRADO', 404);
            $db->prepare('UPDATE ventas_productos SET activo = ?, id_usuario_master_modificacion = ? WHERE id_producto = ?')
                ->execute([$active ? 1 : 0, $auth['id_usuario_master'], $id]);
            $statement = $db->prepare(
                'SELECT vp.*, (vp.controla_stock = 1 AND vp.stock_actual <= vp.stock_minimo) AS stock_bajo
                 FROM ventas_productos vp WHERE id_producto = ? LIMIT 1'
            );
            $statement->execute([$id]);
            $after = self::mapearProducto($statement->fetch());
            audit_change($db, $auth, 'VENTAS', $active ? 'REACTIVAR_PRODUCTO' : 'DESACTIVAR_PRODUCTO', 'ventas_productos', $id, 'Se modificó el estado de un producto.', $before, $after);
            return ['item' => $after];
        });
    }

    protected static function guardarVentaDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = self::idOpcionalVenta($body['id_venta'] ?? null, 'venta');
        $configId = positive_id($body['id_configuracion'] ?? null, 'configuración');
        $date = valid_date($body['fecha'] ?? null, 'venta');
        $state = self::normalizarEstadoVenta($body['estado'] ?? 'CONFIRMADA');
        $buyerType = self::tipoComprador($body['comprador_tipo'] ?? 'ANONIMO');
        $observations = optional_text($body['observaciones'] ?? null, 700);
        $discount = decimal_amount($body['descuento'] ?? 0, 'descuento', 0, 999999999999.99);

        return transaction($db, static function () use (
            $db, $auth, $body, $id, $configId, $date, $state, $buyerType, $observations, $discount
        ): array {
            $before = null;
            $previousItems = [];
            if ($id !== null) {
                $before = self::ventaBloqueada($db, $id);
                $previousItems = self::itemsVenta($db, $id);
                if ((string)$before['estado'] === 'CONFIRMADA' && (bool)$before['impacto_stock']) {
                    self::moverStock($db, $auth, $id, $previousItems, 1, 'REVERSA', 'REVERSA POR EDICIÓN DE VENTA');
                }
            }

            $config = self::configuracionVenta($db, $configId, $id === null, true);
            $meanId = self::idOpcionalVenta($body['id_medio_pago'] ?? null, 'medio de pago');
            if ($meanId === null) api_error('Seleccioná un medio de pago.', 'MEDIO_PAGO_REQUERIDO');
            $mean = self::medioVenta($db, $meanId, $id === null);

            $buyer = self::normalizarComprador($db, $body, $buyerType);
            if ((bool)$config['solicita_comprador'] && $buyerType === 'ANONIMO') {
                api_error('Esta configuración requiere identificar al comprador.', 'COMPRADOR_REQUERIDO');
            }

            $normalized = self::normalizarItems($db, $body['items'] ?? null, (bool)$config['permite_precio_manual']);
            $discountCents = (int)round((float)$discount * 100);
            if ($discountCents >= $normalized['subtotal_centavos']) {
                api_error('El descuento debe ser menor al subtotal.', 'DESCUENTO_INVALIDO');
            }
            $total = number_format(($normalized['subtotal_centavos'] - $discountCents) / 100, 2, '.', '');
            $code = $id === null ? self::generarCodigoVenta() : (string)$before['codigo'];

            if ($id === null) {
                $db->prepare(
                    'INSERT INTO ventas_operaciones
                     (codigo, id_configuracion, fecha, estado, id_medio_pago, comprador_tipo, id_socio,
                      comprador_nombre_snapshot, comprador_documento_snapshot, comprador_contacto_snapshot,
                      subtotal, descuento, total, observaciones, impacto_stock,
                      id_usuario_master_creacion, id_usuario_master_modificacion,
                      fecha_confirmacion, fecha_anulacion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
                )->execute([
                    $code, $configId, $date, $state, $mean['id_medio_pago'], $buyerType, $buyer['id_socio'],
                    $buyer['nombre'], $buyer['documento'], $buyer['contacto'],
                    $normalized['subtotal'], $discount, $total, $observations,
                    $auth['id_usuario_master'], $auth['id_usuario_master'],
                    $state === 'CONFIRMADA' ? date('Y-m-d H:i:s') : null,
                    $state === 'ANULADA' ? date('Y-m-d H:i:s') : null,
                ]);
                $saleId = (int)$db->lastInsertId();
            } else {
                $saleId = $id;
                $db->prepare(
                    'UPDATE ventas_operaciones
                     SET id_configuracion = ?, fecha = ?, estado = ?, id_medio_pago = ?, comprador_tipo = ?,
                         id_socio = ?, comprador_nombre_snapshot = ?, comprador_documento_snapshot = ?,
                         comprador_contacto_snapshot = ?, subtotal = ?, descuento = ?, total = ?,
                         observaciones = ?, impacto_stock = 0, id_usuario_master_modificacion = ?,
                         fecha_confirmacion = ?, fecha_anulacion = ?
                     WHERE id_venta = ?'
                )->execute([
                    $configId, $date, $state, $mean['id_medio_pago'], $buyerType,
                    $buyer['id_socio'], $buyer['nombre'], $buyer['documento'], $buyer['contacto'],
                    $normalized['subtotal'], $discount, $total, $observations,
                    $auth['id_usuario_master'],
                    $state === 'CONFIRMADA' ? ($before['fecha_confirmacion'] ?: date('Y-m-d H:i:s')) : null,
                    $state === 'ANULADA' ? date('Y-m-d H:i:s') : null,
                    $saleId,
                ]);
                $db->prepare('DELETE FROM ventas_items WHERE id_venta = ?')->execute([$saleId]);
            }

            $insertItem = $db->prepare(
                'INSERT INTO ventas_items
                 (id_venta, id_producto, producto_codigo_snapshot, producto_nombre_snapshot,
                  controla_stock_snapshot, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($normalized['items'] as $line) {
                $insertItem->execute([
                    $saleId, $line['id_producto'], $line['producto_codigo_snapshot'],
                    $line['producto_nombre_snapshot'], $line['controla_stock'] ? 1 : 0, $line['cantidad'],
                    $line['precio_unitario'], $line['subtotal'],
                ]);
            }

            $stockImpact = false;
            if ($state === 'CONFIRMADA') {
                self::moverStock($db, $auth, $saleId, $normalized['items'], -1, 'VENTA', 'DESCUENTO POR VENTA CONFIRMADA');
                $stockImpact = true;
                $db->prepare('UPDATE ventas_operaciones SET impacto_stock = 1 WHERE id_venta = ?')->execute([$saleId]);
            }

            $sale = self::ventaBloqueada($db, $saleId);
            $incomeId = self::sincronizarContable($db, $auth, $saleId, $sale, $config, $mean);
            $db->prepare('UPDATE ventas_operaciones SET id_ingreso_contable = ? WHERE id_venta = ?')
                ->execute([$incomeId, $saleId]);

            $after = self::ventaBloqueada($db, $saleId);
            $after['items'] = self::itemsVenta($db, $saleId);
            $after['impacto_stock'] = $stockImpact;
            audit_change($db, $auth, 'VENTAS', $id === null ? 'CREAR_VENTA' : 'MODIFICAR_VENTA', 'ventas_operaciones', $saleId, 'Se registró o modificó una venta.', $before, $after);
            return ['id_venta' => $saleId, 'codigo' => $code, 'estado' => $state];
        });
    }

    protected static function normalizarComprador(PDO $db, array $body, string $type): array
    {
        if ($type === 'SOCIO') {
            $partner = self::socioVenta($db, positive_id($body['id_socio'] ?? null, 'socio'));
            return [
                'id_socio' => $partner['id_socio'],
                'nombre' => $partner['nombre_completo'],
                'documento' => $partner['dni'],
                'contacto' => $partner['contacto'] ?: null,
            ];
        }
        if ($type === 'EXTERNO') {
            return [
                'id_socio' => null,
                'nombre' => required_text($body, 'comprador_nombre', 'nombre del comprador', 240),
                'documento' => optional_text($body['comprador_documento'] ?? null, 40),
                'contacto' => optional_text($body['comprador_contacto'] ?? null, 190, false),
            ];
        }
        return ['id_socio' => null, 'nombre' => 'VENTA ANÓNIMA', 'documento' => null, 'contacto' => null];
    }

    protected static function eliminarVentaDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_venta'] ?? null, 'venta');

        return transaction($db, static function () use ($db, $auth, $id): array {
            $before = self::ventaBloqueada($db, $id);
            $items = self::itemsVenta($db, $id);
            $before['items'] = $items;

            if ((string)$before['estado'] === 'CONFIRMADA' && (bool)$before['impacto_stock']) {
                self::moverStock(
                    $db,
                    $auth,
                    $id,
                    $items,
                    1,
                    'REVERSA',
                    'REVERSA POR ELIMINACIÓN DE VENTA'
                );
            }

            $incomeStatement = $db->prepare(
                "SELECT id_ingreso, estado
                 FROM contable_ingresos
                 WHERE origen_modulo = 'VENTAS' AND id_referencia_origen = ?
                 LIMIT 1 FOR UPDATE"
            );
            $incomeStatement->execute([$id]);
            $income = $incomeStatement->fetch();
            if ($income) {
                $db->prepare(
                    "UPDATE contable_ingresos
                     SET estado = 'ANULADO', fecha_anulacion = COALESCE(fecha_anulacion, NOW()),
                         id_usuario_master_modificacion = ?
                     WHERE id_ingreso = ?"
                )->execute([$auth['id_usuario_master'], (int)$income['id_ingreso']]);
            }

            // Conserva el historial de movimientos de stock, pero libera la FK de la venta eliminada.
            $db->prepare('UPDATE ventas_stock_movimientos SET id_venta = NULL WHERE id_venta = ?')
                ->execute([$id]);
            $db->prepare('DELETE FROM ventas_items WHERE id_venta = ?')->execute([$id]);
            $db->prepare('DELETE FROM ventas_operaciones WHERE id_venta = ?')->execute([$id]);

            audit_change(
                $db,
                $auth,
                'VENTAS',
                'ELIMINAR_VENTA',
                'ventas_operaciones',
                $id,
                'Se eliminó definitivamente una venta y se revirtieron sus impactos.',
                $before,
                null
            );

            return [
                'id_venta' => $id,
                'codigo' => (string)$before['codigo'],
                'ingreso_contable_anulado' => $income ? (int)$income['id_ingreso'] : null,
            ];
        });
    }

    protected static function cambiarEstadoVenta(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = positive_id($body['id_venta'] ?? null, 'venta');
        $target = self::normalizarEstadoVenta($body['estado'] ?? null);
        return transaction($db, static function () use ($db, $auth, $id, $target): array {
            $before = self::ventaBloqueada($db, $id);
            $current = (string)$before['estado'];
            if ($current === $target) api_error('La venta ya tiene ese estado.', 'ESTADO_SIN_CAMBIOS', 409);
            $items = self::itemsVenta($db, $id);
            if ($current === 'CONFIRMADA' && (bool)$before['impacto_stock']) {
                self::moverStock($db, $auth, $id, $items, 1, 'REVERSA', 'REVERSA POR CAMBIO DE ESTADO');
            }
            $stockImpact = false;
            if ($target === 'CONFIRMADA') {
                self::moverStock($db, $auth, $id, $items, -1, 'VENTA', 'DESCUENTO POR CONFIRMACIÓN');
                $stockImpact = true;
            }
            $db->prepare(
                'UPDATE ventas_operaciones
                 SET estado = ?, impacto_stock = ?, id_usuario_master_modificacion = ?,
                     fecha_confirmacion = ?, fecha_anulacion = ?
                 WHERE id_venta = ?'
            )->execute([
                $target,
                $stockImpact ? 1 : 0,
                $auth['id_usuario_master'],
                $target === 'CONFIRMADA' ? date('Y-m-d H:i:s') : null,
                $target === 'ANULADA' ? date('Y-m-d H:i:s') : null,
                $id,
            ]);

            $sale = self::ventaBloqueada($db, $id);
            $config = self::configuracionVenta($db, (int)$sale['id_configuracion'], false, true);
            $mean = self::medioVenta($db, (int)$sale['id_medio_pago'], false);
            $incomeId = self::sincronizarContable($db, $auth, $id, $sale, $config, $mean);
            $db->prepare('UPDATE ventas_operaciones SET id_ingreso_contable = ? WHERE id_venta = ?')
                ->execute([$incomeId, $id]);
            $after = self::ventaBloqueada($db, $id);
            audit_change($db, $auth, 'VENTAS', 'CAMBIAR_ESTADO_VENTA', 'ventas_operaciones', $id, 'Se cambió el estado de una venta.', $before, $after);
            return ['id_venta' => $id, 'estado' => $target];
        });
    }
}

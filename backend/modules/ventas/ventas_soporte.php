<?php
declare(strict_types=1);

trait VentasSoporte
{
    private const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'ANULADA'];
    private const COMPRADORES = ['SOCIO', 'EXTERNO', 'ANONIMO'];

    protected static function idOpcionalVenta(mixed $value, string $label): ?int
    {
        $text = trim((string)$value);
        return $text === '' ? null : positive_id($text, $label);
    }

    protected static function booleanoVenta(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    protected static function normalizarEstadoVenta(mixed $value): string
    {
        $state = clean_text($value, 20);
        if (!in_array($state, self::ESTADOS, true)) {
            api_error('El estado de la venta no es válido.', 'ESTADO_VENTA_INVALIDO');
        }
        return $state;
    }

    protected static function tipoComprador(mixed $value): string
    {
        $type = clean_text($value, 20);
        if (!in_array($type, self::COMPRADORES, true)) {
            api_error('El tipo de comprador no es válido.', 'COMPRADOR_INVALIDO');
        }
        return $type;
    }

    protected static function configuracionVenta(PDO $db, int $id, bool $activeOnly = false, bool $lock = false): array
    {
        $sql = 'SELECT vc.*,
                       proveedor.nombre AS proveedor_nombre,
                       categoria.nombre AS categoria_nombre,
                       concepto.nombre AS concepto_nombre
                FROM ventas_configuraciones vc
                LEFT JOIN contable_opciones proveedor ON proveedor.id_opcion = vc.id_proveedor_contable
                LEFT JOIN contable_opciones categoria ON categoria.id_opcion = vc.id_categoria_contable
                LEFT JOIN contable_opciones concepto ON concepto.id_opcion = vc.id_concepto_contable
                WHERE vc.id_configuracion = ?';
        if ($activeOnly) $sql .= ' AND vc.activo = 1';
        $sql .= ' LIMIT 1';
        if ($lock) $sql .= ' FOR UPDATE';
        $statement = $db->prepare($sql);
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) api_error('La configuración de venta no existe o está inactiva.', 'CONFIGURACION_VENTA_INVALIDA', 409);
        return self::mapearConfiguracion($row);
    }

    protected static function medioVenta(PDO $db, int $id, bool $activeOnly = true): array
    {
        $sql = "SELECT id_medio_pago, nombre, activo
                FROM medios_pago
                WHERE id_medio_pago = ? AND nombre <> 'CONDONACIÓN'";
        if ($activeOnly) $sql .= ' AND activo = 1';
        $sql .= ' LIMIT 1';
        $statement = $db->prepare($sql);
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) api_error('El medio de pago seleccionado no está disponible.', 'MEDIO_PAGO_INVALIDO', 409);
        return [
            'id_medio_pago' => (int)$row['id_medio_pago'],
            'nombre' => (string)$row['nombre'],
            'activo' => (bool)$row['activo'],
        ];
    }

    protected static function opcionVenta(PDO $db, ?int $id, string $expectedType, bool $activeOnly = true): ?array
    {
        if ($id === null) return null;
        $sql = 'SELECT id_opcion, tipo, nombre, activo FROM contable_opciones WHERE id_opcion = ?';
        if ($activeOnly) $sql .= ' AND activo = 1';
        $sql .= ' LIMIT 1';
        $statement = $db->prepare($sql);
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row || (string)$row['tipo'] !== $expectedType) {
            api_error('La imputación contable seleccionada no está disponible.', 'OPCION_CONTABLE_INVALIDA', 409);
        }
        return [
            'id_opcion' => (int)$row['id_opcion'],
            'nombre' => (string)$row['nombre'],
            'tipo' => (string)$row['tipo'],
            'activo' => (bool)$row['activo'],
        ];
    }

    protected static function socioVenta(PDO $db, int $id): array
    {
        $statement = $db->prepare(
            'SELECT id_socio, nombre, apellido, dni, telefono, email, activo
             FROM socios WHERE id_socio = ? LIMIT 1'
        );
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) api_error('El socio seleccionado no existe.', 'SOCIO_NO_ENCONTRADO', 404);
        return [
            'id_socio' => (int)$row['id_socio'],
            'nombre_completo' => trim((string)$row['apellido'] . ', ' . (string)$row['nombre'], ' ,'),
            'dni' => (string)$row['dni'],
            'contacto' => (string)($row['telefono'] ?: $row['email'] ?: ''),
            'activo' => (bool)$row['activo'],
        ];
    }

    protected static function mapearConfiguracion(array $row): array
    {
        foreach ([
            'id_configuracion',
            'id_proveedor_contable',
            'id_categoria_contable',
            'id_concepto_contable',
        ] as $field) {
            $row[$field] = $row[$field] === null ? null : (int)$row[$field];
        }
        foreach (['impacta_contable', 'permite_precio_manual', 'solicita_comprador', 'activo'] as $field) {
            $row[$field] = (bool)$row[$field];
        }
        return $row;
    }

    protected static function mapearProducto(array $row): array
    {
        $row['id_producto'] = (int)$row['id_producto'];
        $row['precio'] = number_format((float)$row['precio'], 2, '.', '');
        $row['stock_actual'] = number_format((float)$row['stock_actual'], 3, '.', '');
        $row['stock_minimo'] = number_format((float)$row['stock_minimo'], 3, '.', '');
        $row['controla_stock'] = (bool)$row['controla_stock'];
        $row['activo'] = (bool)$row['activo'];
        if (array_key_exists('stock_bajo', $row)) $row['stock_bajo'] = (bool)$row['stock_bajo'];
        if (array_key_exists('cantidad_vendida', $row)) {
            $row['cantidad_vendida'] = number_format((float)$row['cantidad_vendida'], 3, '.', '');
        }
        return $row;
    }

    protected static function cantidadVenta(mixed $value): string
    {
        if ($value === '' || $value === null || !is_numeric($value)) {
            api_error('La cantidad de un producto no es válida.', 'CANTIDAD_INVALIDA');
        }
        $number = (float)$value;
        if ($number <= 0 || $number > 99999999999.999) {
            api_error('La cantidad de un producto está fuera del rango permitido.', 'CANTIDAD_INVALIDA');
        }
        return number_format($number, 3, '.', '');
    }

    protected static function normalizarItems(PDO $db, mixed $rawItems, bool $allowsManualPrice): array
    {
        if (!is_array($rawItems) || $rawItems === []) {
            api_error('La venta debe tener al menos un producto.', 'VENTA_SIN_PRODUCTOS');
        }

        $merged = [];
        foreach ($rawItems as $raw) {
            if (!is_array($raw)) continue;
            $productId = positive_id($raw['id_producto'] ?? null, 'producto');
            $quantity = self::cantidadVenta($raw['cantidad'] ?? null);
            $priceInput = $raw['precio_unitario'] ?? null;
            $key = $productId . '|' . ($allowsManualPrice ? trim((string)$priceInput) : 'CATALOGO');
            if (isset($merged[$key])) {
                $merged[$key]['cantidad'] = number_format(
                    (float)$merged[$key]['cantidad'] + (float)$quantity,
                    3,
                    '.',
                    ''
                );
            } else {
                $merged[$key] = [
                    'id_producto' => $productId,
                    'cantidad' => $quantity,
                    'precio_input' => $priceInput,
                ];
            }
        }
        if ($merged === []) api_error('La venta debe tener al menos un producto.', 'VENTA_SIN_PRODUCTOS');

        $ids = array_values(array_unique(array_map(
            static fn(array $item): int => $item['id_producto'],
            $merged
        )));
        sort($ids, SORT_NUMERIC);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $db->prepare(
            "SELECT * FROM ventas_productos
             WHERE id_producto IN ({$placeholders})
             ORDER BY id_producto
             FOR UPDATE"
        );
        $statement->execute($ids);
        $products = [];
        foreach ($statement->fetchAll() as $row) $products[(int)$row['id_producto']] = $row;

        $items = [];
        $subtotalCents = 0;
        foreach ($merged as $raw) {
            $product = $products[$raw['id_producto']] ?? null;
            if (!$product || !(bool)$product['activo']) {
                api_error('Uno de los productos ya no está disponible.', 'PRODUCTO_INACTIVO', 409);
            }
            $price = $allowsManualPrice
                ? decimal_amount($raw['precio_input'], 'precio unitario', 0, 999999999999.99)
                : number_format((float)$product['precio'], 2, '.', '');
            $lineCents = (int)round((float)$raw['cantidad'] * ((float)$price * 100), 0, PHP_ROUND_HALF_UP);
            $subtotalCents += $lineCents;
            $items[] = [
                'id_producto' => (int)$product['id_producto'],
                'producto_codigo_snapshot' => $product['codigo'],
                'producto_nombre_snapshot' => (string)$product['nombre'],
                'cantidad' => $raw['cantidad'],
                'precio_unitario' => $price,
                'subtotal' => number_format($lineCents / 100, 2, '.', ''),
                'controla_stock' => (bool)$product['controla_stock'],
            ];
        }
        if ($subtotalCents <= 0) {
            api_error('El total de la venta debe ser mayor a cero.', 'TOTAL_VENTA_INVALIDO');
        }
        return [
            'items' => $items,
            'subtotal_centavos' => $subtotalCents,
            'subtotal' => number_format($subtotalCents / 100, 2, '.', ''),
        ];
    }

    protected static function ventaBloqueada(PDO $db, int $id): array
    {
        $statement = $db->prepare('SELECT * FROM ventas_operaciones WHERE id_venta = ? LIMIT 1 FOR UPDATE');
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) api_error('La venta seleccionada no existe.', 'VENTA_NO_ENCONTRADA', 404);
        return $row;
    }

    protected static function itemsVenta(PDO $db, int $id): array
    {
        $statement = $db->prepare(
            'SELECT id_item, id_venta, id_producto, producto_codigo_snapshot,
                    producto_nombre_snapshot, controla_stock_snapshot, cantidad, precio_unitario, subtotal
             FROM ventas_items
             WHERE id_venta = ?
             ORDER BY id_item'
        );
        $statement->execute([$id]);
        return $statement->fetchAll();
    }

    protected static function moverStock(
        PDO $db,
        array $auth,
        int $saleId,
        array $items,
        int $direction,
        string $type,
        string $detail
    ): void {
        $quantities = [];
        foreach ($items as $item) {
            $controlsStock = array_key_exists('controla_stock_snapshot', $item)
                ? (bool)$item['controla_stock_snapshot']
                : (bool)($item['controla_stock'] ?? false);
            if (!$controlsStock) continue;
            $productId = (int)$item['id_producto'];
            $quantities[$productId] = ($quantities[$productId] ?? 0.0) + (float)$item['cantidad'];
        }
        ksort($quantities, SORT_NUMERIC);

        foreach ($quantities as $productId => $quantity) {
            $statement = $db->prepare(
                'SELECT id_producto, nombre, controla_stock, stock_actual
                 FROM ventas_productos
                 WHERE id_producto = ?
                 LIMIT 1 FOR UPDATE'
            );
            $statement->execute([$productId]);
            $product = $statement->fetch();
            if (!$product) api_error('Un producto de la venta ya no existe.', 'PRODUCTO_NO_ENCONTRADO', 409);
            $before = (float)$product['stock_actual'];
            $after = $before + ($direction * $quantity);
            if ($after < -0.0005) {
                api_error(
                    'No hay stock suficiente de ' . (string)$product['nombre'] . '.',
                    'STOCK_INSUFICIENTE',
                    409,
                    [
                        'id_producto' => $productId,
                        'disponible' => number_format($before, 3, '.', ''),
                        'requerido' => number_format($quantity, 3, '.', ''),
                    ]
                );
            }
            if ($after < 0) $after = 0;
            $db->prepare('UPDATE ventas_productos SET stock_actual = ?, id_usuario_master_modificacion = ? WHERE id_producto = ?')
                ->execute([number_format($after, 3, '.', ''), $auth['id_usuario_master'], $productId]);
            $db->prepare(
                'INSERT INTO ventas_stock_movimientos
                 (id_producto, id_venta, tipo, cantidad, stock_anterior, stock_nuevo, detalle, id_usuario_master)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $productId,
                $saleId,
                $type,
                number_format($direction * $quantity, 3, '.', ''),
                number_format($before, 3, '.', ''),
                number_format($after, 3, '.', ''),
                $detail,
                $auth['id_usuario_master'],
            ]);
        }
    }

    protected static function sincronizarContable(
        PDO $db,
        array $auth,
        int $saleId,
        array $sale,
        array $config,
        array $mean
    ): ?int {
        $statement = $db->prepare(
            "SELECT * FROM contable_ingresos
             WHERE origen_modulo = 'VENTAS' AND id_referencia_origen = ?
             LIMIT 1 FOR UPDATE"
        );
        $statement->execute([$saleId]);
        $income = $statement->fetch();
        $mustBeActive = (string)$sale['estado'] === 'CONFIRMADA' && (bool)$config['impacta_contable'];

        if (!$mustBeActive) {
            if ($income && (string)$income['estado'] === 'ACTIVO') {
                $db->prepare(
                    "UPDATE contable_ingresos
                     SET estado = 'ANULADO', fecha_anulacion = NOW(), id_usuario_master_modificacion = ?
                     WHERE id_ingreso = ?"
                )->execute([$auth['id_usuario_master'], (int)$income['id_ingreso']]);
            }
            return $income ? (int)$income['id_ingreso'] : null;
        }

        $provider = self::opcionVenta($db, (int)$config['id_proveedor_contable'], 'PROVEEDOR', false);
        $category = self::opcionVenta($db, (int)$config['id_categoria_contable'], 'CATEGORIA_INGRESO', false);
        $concept = self::opcionVenta($db, (int)$config['id_concepto_contable'], 'CONCEPTO_INGRESO', false);
        $buyer = trim((string)($sale['comprador_nombre_snapshot'] ?? ''));
        $detail = 'VENTA ' . (string)$sale['codigo'] . ' · ' . (string)$config['nombre'];
        if ($buyer !== '') $detail .= ' · ' . $buyer;
        if (!empty($sale['observaciones'])) $detail .= ' · ' . (string)$sale['observaciones'];
        $detail = clean_text($detail, 500, false);

        if ($income) {
            $incomeId = (int)$income['id_ingreso'];
            $db->prepare(
                "UPDATE contable_ingresos
                 SET fecha = ?, id_medio_pago = ?, id_proveedor = ?, id_categoria = ?, id_concepto = ?,
                     importe = ?, detalle = ?, medio_pago_snapshot = ?, proveedor_snapshot = ?,
                     categoria_snapshot = ?, concepto_snapshot = ?, estado = 'ACTIVO',
                     fecha_anulacion = NULL, id_usuario_master_modificacion = ?
                 WHERE id_ingreso = ?"
            )->execute([
                $sale['fecha'],
                $mean['id_medio_pago'],
                $provider['id_opcion'],
                $category['id_opcion'],
                $concept['id_opcion'],
                $sale['total'],
                $detail,
                $mean['nombre'],
                $provider['nombre'],
                $category['nombre'],
                $concept['nombre'],
                $auth['id_usuario_master'],
                $incomeId,
            ]);
        } else {
            $db->prepare(
                "INSERT INTO contable_ingresos
                 (fecha, id_medio_pago, id_proveedor, id_categoria, id_concepto, importe, detalle,
                  medio_pago_snapshot, proveedor_snapshot, categoria_snapshot, concepto_snapshot,
                  estado, origen_modulo, id_referencia_origen,
                  id_usuario_master_creacion, id_usuario_master_modificacion)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 'VENTAS', ?, ?, ?)"
            )->execute([
                $sale['fecha'],
                $mean['id_medio_pago'],
                $provider['id_opcion'],
                $category['id_opcion'],
                $concept['id_opcion'],
                $sale['total'],
                $detail,
                $mean['nombre'],
                $provider['nombre'],
                $category['nombre'],
                $concept['nombre'],
                $saleId,
                $auth['id_usuario_master'],
                $auth['id_usuario_master'],
            ]);
            $incomeId = (int)$db->lastInsertId();
        }

        return $incomeId;
    }

    protected static function generarCodigoVenta(): string
    {
        return 'VTA-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(4)));
    }
}

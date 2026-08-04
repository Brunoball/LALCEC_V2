<?php
declare(strict_types=1);

trait VentasConsultas
{
    protected static function resumenVentas(PDO $db): array
    {
        $start = date('Y-m-01');
        $end = (new DateTimeImmutable($start))->modify('+1 month')->format('Y-m-d');
        $statement = $db->prepare(
            "SELECT
                (SELECT COUNT(*) FROM ventas_configuraciones WHERE activo = 1) AS configuraciones_activas,
                (SELECT COUNT(*) FROM ventas_productos WHERE activo = 1) AS productos_activos,
                (SELECT COUNT(*) FROM ventas_productos
                 WHERE activo = 1 AND controla_stock = 1 AND stock_actual <= stock_minimo) AS productos_stock_bajo,
                (SELECT COUNT(*) FROM ventas_operaciones WHERE estado = 'PENDIENTE') AS ventas_pendientes,
                (SELECT COUNT(*) FROM ventas_operaciones
                 WHERE estado = 'CONFIRMADA' AND fecha >= ? AND fecha < ?) AS ventas_mes,
                (SELECT COALESCE(SUM(total), 0) FROM ventas_operaciones
                 WHERE estado = 'CONFIRMADA' AND fecha >= ? AND fecha < ?) AS total_mes"
        );
        $statement->execute([$start, $end, $start, $end]);
        $row = $statement->fetch() ?: [];
        foreach ([
            'configuraciones_activas',
            'productos_activos',
            'productos_stock_bajo',
            'ventas_pendientes',
            'ventas_mes',
        ] as $field) {
            $row[$field] = (int)($row[$field] ?? 0);
        }
        $row['total_mes'] = number_format((float)($row['total_mes'] ?? 0), 2, '.', '');
        return $row;
    }

    protected static function catalogosVentas(PDO $db): array
    {
        $configs = $db->query(
            'SELECT vc.*,
                    proveedor.nombre AS proveedor_nombre,
                    categoria.nombre AS categoria_nombre,
                    concepto.nombre AS concepto_nombre
             FROM ventas_configuraciones vc
             LEFT JOIN contable_opciones proveedor ON proveedor.id_opcion = vc.id_proveedor_contable
             LEFT JOIN contable_opciones categoria ON categoria.id_opcion = vc.id_categoria_contable
             LEFT JOIN contable_opciones concepto ON concepto.id_opcion = vc.id_concepto_contable
             ORDER BY vc.activo DESC, vc.nombre'
        )->fetchAll();
        foreach ($configs as &$config) $config = self::mapearConfiguracion($config);
        unset($config);

        $products = $db->query(
            'SELECT vp.*,
                    (vp.controla_stock = 1 AND vp.stock_actual <= vp.stock_minimo) AS stock_bajo
             FROM ventas_productos vp
             ORDER BY vp.activo DESC, vp.nombre'
        )->fetchAll();
        foreach ($products as &$product) $product = self::mapearProducto($product);
        unset($product);

        $means = $db->query(
            "SELECT id_medio_pago, nombre
             FROM medios_pago
             WHERE activo = 1 AND nombre <> 'CONDONACIÓN'
             ORDER BY nombre"
        )->fetchAll();
        foreach ($means as &$mean) $mean['id_medio_pago'] = (int)$mean['id_medio_pago'];
        unset($mean);

        $options = $db->query(
            "SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             WHERE activo = 1
               AND tipo IN ('PROVEEDOR', 'CATEGORIA_INGRESO', 'CONCEPTO_INGRESO')
             ORDER BY tipo, nombre"
        )->fetchAll();
        $grouped = ['PROVEEDOR' => [], 'CATEGORIA_INGRESO' => [], 'CONCEPTO_INGRESO' => []];
        foreach ($options as $option) {
            $grouped[(string)$option['tipo']][] = [
                'id_opcion' => (int)$option['id_opcion'],
                'nombre' => (string)$option['nombre'],
            ];
        }

        return [
            'resumen' => self::resumenVentas($db),
            'configuraciones' => $configs,
            'productos' => $products,
            'medios_pago' => $means,
            'opciones_contables' => $grouped,
        ];
    }

    protected static function buscarSociosVenta(PDO $db, mixed $rawSearch): array
    {
        $search = clean_text($rawSearch, 100, false);
        if ($search === '') return [];
        $term = '%' . $search . '%';
        $statement = $db->prepare(
            "SELECT id_socio, nombre, apellido, dni, telefono, email, activo
             FROM socios
             WHERE CONCAT(apellido, ' ', nombre) LIKE ? OR dni LIKE ?
             ORDER BY activo DESC, apellido, nombre
             LIMIT 30"
        );
        $statement->execute([$term, $term]);
        $items = $statement->fetchAll();
        foreach ($items as &$item) {
            $item['id_socio'] = (int)$item['id_socio'];
            $item['activo'] = (bool)$item['activo'];
            $item['nombre_completo'] = trim((string)$item['apellido'] . ', ' . (string)$item['nombre'], ' ,');
        }
        unset($item);
        return $items;
    }

    protected static function listarVentas(PDO $db, array $filters): array
    {
        $search = clean_text($filters['buscar'] ?? '', 160, false);
        $state = trim((string)($filters['estado'] ?? ''));
        $configId = self::idOpcionalVenta($filters['configuracion'] ?? null, 'configuración');
        $year = filter_var($filters['anio'] ?? date('Y'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => 2100]]);
        $monthRaw = trim((string)($filters['mes'] ?? ''));
        $month = $monthRaw === '' ? null : filter_var($monthRaw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
        if ($year === false || ($monthRaw !== '' && $month === false)) {
            api_error('El período seleccionado no es válido.', 'FILTRO_INVALIDO');
        }
        if ($state !== '' && !in_array($state, self::ESTADOS, true)) {
            api_error('El filtro de estado no es válido.', 'FILTRO_INVALIDO');
        }

        $where = ['v.fecha >= ?', 'v.fecha < ?'];
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01', (int)$year, $month ?: 1));
        $end = $month ? $start->modify('+1 month') : $start->modify('+1 year');
        $params = [$start->format('Y-m-d'), $end->format('Y-m-d')];
        if ($state !== '') {
            $where[] = 'v.estado = ?';
            $params[] = $state;
        }
        if ($configId !== null) {
            $where[] = 'v.id_configuracion = ?';
            $params[] = $configId;
        }
        if ($search !== '') {
            $where[] = '(v.codigo LIKE ? OR v.comprador_nombre_snapshot LIKE ? OR
                         v.comprador_documento_snapshot LIKE ? OR v.observaciones LIKE ? OR
                         EXISTS (SELECT 1 FROM ventas_items vi
                                 WHERE vi.id_venta = v.id_venta AND vi.producto_nombre_snapshot LIKE ?))';
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term, $term, $term);
        }

        $statement = $db->prepare(
            "SELECT v.*, vc.nombre AS configuracion_nombre, mp.nombre AS medio_pago_nombre
             FROM ventas_operaciones v
             INNER JOIN ventas_configuraciones vc ON vc.id_configuracion = v.id_configuracion
             INNER JOIN medios_pago mp ON mp.id_medio_pago = v.id_medio_pago
             WHERE " . implode(' AND ', $where) . "
             ORDER BY v.fecha DESC, v.created_at DESC, v.id_venta DESC
             LIMIT 500"
        );
        $statement->execute($params);
        $items = $statement->fetchAll();
        if ($items === []) return ['items' => [], 'resumen' => ['registros' => 0, 'total' => '0.00']];

        $ids = array_map(static fn(array $item): int => (int)$item['id_venta'], $items);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $db->prepare(
            "SELECT id_item, id_venta, id_producto, producto_codigo_snapshot,
                    producto_nombre_snapshot, controla_stock_snapshot, cantidad, precio_unitario, subtotal
             FROM ventas_items
             WHERE id_venta IN ({$placeholders})
             ORDER BY id_item"
        );
        $statement->execute($ids);
        $bySale = [];
        foreach ($statement->fetchAll() as $line) {
            $line['id_item'] = (int)$line['id_item'];
            $line['id_venta'] = (int)$line['id_venta'];
            $line['id_producto'] = (int)$line['id_producto'];
            $line['controla_stock_snapshot'] = (bool)$line['controla_stock_snapshot'];
            $line['cantidad'] = number_format((float)$line['cantidad'], 3, '.', '');
            $line['precio_unitario'] = number_format((float)$line['precio_unitario'], 2, '.', '');
            $line['subtotal'] = number_format((float)$line['subtotal'], 2, '.', '');
            $bySale[$line['id_venta']][] = $line;
        }

        $totalCents = 0;
        foreach ($items as &$item) {
            foreach (['id_venta', 'id_configuracion', 'id_medio_pago'] as $field) $item[$field] = (int)$item[$field];
            foreach (['id_socio', 'id_ingreso_contable'] as $field) {
                $item[$field] = $item[$field] === null ? null : (int)$item[$field];
            }
            foreach (['subtotal', 'descuento', 'total'] as $field) {
                $item[$field] = number_format((float)$item[$field], 2, '.', '');
            }
            $item['impacto_stock'] = (bool)$item['impacto_stock'];
            $item['items'] = $bySale[$item['id_venta']] ?? [];
            if ((string)$item['estado'] === 'CONFIRMADA') $totalCents += (int)round((float)$item['total'] * 100);
        }
        unset($item);

        return [
            'items' => $items,
            'resumen' => [
                'registros' => count($items),
                'total' => number_format($totalCents / 100, 2, '.', ''),
            ],
        ];
    }
}

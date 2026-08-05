<?php
declare(strict_types=1);

final class Cuotas
{
    private const TIPOS = ['PERSONA', 'EMPRESA'];
    private const ESTADOS = ['DEUDORES', 'PAGADOS'];

    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function catalogos(): never
    {
        $auth = auth_context();
        api_success(self::catalogosDatos($auth['db']));
    }

    public static function registrarPago(): never
    {
        $auth = require_admin();
        $item = self::registrarPagoDatos($auth, request_body());
        api_success(['item' => $item], 'Pago registrado correctamente.');
    }

    public static function eliminarPago(): never
    {
        $auth = require_admin();
        $item = self::eliminarPagoDatos($auth, request_body());
        api_success(['item' => $item], 'Pago eliminado correctamente. El período volvió a quedar como deuda.');
    }

    /** Alias conservado para clientes anteriores del frontend. */
    public static function registrarCobro(): never
    {
        self::registrarPago();
    }

    /** Alias conservado para clientes anteriores del frontend. */
    public static function anular(): never
    {
        self::eliminarPago();
    }

    private static function listarDatos(PDO $db, array $filters): array
    {
        $tipo = strtoupper(trim((string)($filters['tipo'] ?? 'PERSONA')));
        $estado = strtoupper(trim((string)($filters['estado'] ?? 'DEUDORES')));
        if (!in_array($tipo, self::TIPOS, true)) {
            api_error('El tipo de cuota solicitado no es válido.', 'FILTRO_INVALIDO');
        }
        if (!in_array($estado, self::ESTADOS, true)) {
            api_error('El estado de cuota solicitado no es válido.', 'FILTRO_INVALIDO');
        }

        $now = new DateTimeImmutable('today');
        $anio = self::validYear($filters['anio'] ?? $now->format('Y'));
        $mes = self::validMonth($filters['mes'] ?? $now->format('n'));
        $buscar = clean_text($filters['buscar'] ?? '', 120, false);
        $categoria = self::optionalPositiveId($filters['categoria'] ?? null);
        $periodEnd = (new DateTimeImmutable(sprintf('%04d-%02d-01', $anio, $mes)))
            ->modify('last day of this month')
            ->format('Y-m-d');

        $where = ['s.tipo_socio = ?'];
        $params = [$anio, $mes, $tipo];

        if ($estado === 'DEUDORES') {
            $where[] = "s.estado = 'ACTIVO'";
            $where[] = 's.id_categoria IS NOT NULL';
            $where[] = '(s.fecha_alta IS NULL OR s.fecha_alta <= ?)';
            $where[] = 'p.id_pago IS NULL';
            $params[] = $periodEnd;
        } else {
            $where[] = 'p.id_pago IS NOT NULL';
        }

        if ($categoria !== null) {
            $where[] = 's.id_categoria = ?';
            $params[] = $categoria;
        }

        if ($buscar !== '') {
            $where[] = "(
                COALESCE(sp.apellido, '') LIKE ? OR
                COALESCE(sp.nombre, '') LIKE ? OR
                COALESCE(sp.dni, '') LIKE ? OR
                COALESCE(se.razon_social, '') LIKE ? OR
                COALESCE(se.cuit, '') LIKE ?
            )";
            $term = '%' . $buscar . '%';
            array_push($params, $term, $term, $term, $term, $term);
        }

        // Mantener esta consulta simple es intencional. El cálculo histórico
        // del valor de la cuota se realiza en PHP con una segunda consulta,
        // evitando subconsultas correlacionadas dentro de un statement nativo.
        $statement = $db->prepare(
            "SELECT
                s.id_socio,
                s.tipo_socio,
                s.estado AS estado_socio,
                s.fecha_alta,
                s.id_categoria,
                s.id_medio_pago AS id_medio_pago_preferido,
                CASE
                    WHEN s.tipo_socio = 'EMPRESA' THEN se.razon_social
                    ELSE TRIM(CONCAT(COALESCE(sp.apellido, ''), ', ', COALESCE(sp.nombre, '')))
                END AS denominacion,
                CASE WHEN s.tipo_socio = 'EMPRESA' THEN se.cuit ELSE sp.dni END AS documento,
                c.nombre AS categoria,
                c.monto_cuota AS monto_actual,
                mp_preferido.nombre AS medio_pago_preferido,
                p.id_pago,
                p.anio,
                p.mes,
                p.fecha_pago,
                p.monto,
                p.id_medio_pago,
                mp.nombre AS medio_pago
             FROM socios s
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             LEFT JOIN categorias c ON c.id_categoria = s.id_categoria
             LEFT JOIN medios_pago mp_preferido ON mp_preferido.id_medio_pago = s.id_medio_pago
             LEFT JOIN pagos p
                    ON p.id_socio = s.id_socio
                   AND p.anio = ?
                   AND p.mes = ?
             LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
             WHERE " . implode(' AND ', $where) . "
             ORDER BY denominacion ASC, s.id_socio ASC"
        );
        $statement->execute($params);
        $rows = $statement->fetchAll();

        $categoryIds = [];
        foreach ($rows as $row) {
            if ($row['id_categoria'] !== null) {
                $categoryIds[(int)$row['id_categoria']] = true;
            }
        }
        $history = self::priceHistoryByCategory($db, array_keys($categoryIds));

        $items = [];
        foreach ($rows as $row) {
            $categoryId = $row['id_categoria'] === null ? null : (int)$row['id_categoria'];
            $row['monto_sugerido'] = $categoryId === null
                ? 0
                : self::priceForPeriod(
                    $history[$categoryId] ?? [],
                    (float)($row['monto_actual'] ?? 0),
                    $periodEnd
                );
            $items[] = self::castRow($row, $anio, $mes);
        }

        $totalAmount = 0.0;
        $withCategory = 0;
        foreach ($items as $item) {
            if ($item['id_categoria'] !== null) $withCategory++;
            $totalAmount += (float)($estado === 'PAGADOS' ? ($item['monto'] ?? 0) : $item['monto_sugerido']);
        }

        return array_merge([
            'items' => $items,
            'resumen' => [
                'total' => count($items),
                'importe' => number_format($totalAmount, 2, '.', ''),
                'con_categoria' => $withCategory,
                'sin_categoria' => count($items) - $withCategory,
            ],
            'periodo' => [
                'anio' => $anio,
                'mes' => $mes,
                'mes_nombre' => self::monthName($mes),
            ],
        ], self::catalogosDatos($db, $anio, $mes));
    }

    private static function catalogosDatos(PDO $db, ?int $year = null, ?int $month = null): array
    {
        $year ??= (int)date('Y');
        $month ??= (int)date('n');
        $periodEnd = (new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month)))
            ->modify('last day of this month')
            ->format('Y-m-d');

        $categories = $db->query(
            "SELECT id_categoria, nombre, monto_cuota, activo
             FROM categorias
             ORDER BY activo DESC, nombre ASC"
        )->fetchAll();
        foreach ($categories as &$category) {
            $category['id_categoria'] = (int)$category['id_categoria'];
            $category['monto_cuota'] = number_format((float)$category['monto_cuota'], 2, '.', '');
            $category['activo'] = (bool)$category['activo'];
        }
        unset($category);

        $media = $db->query(
            "SELECT id_medio_pago, nombre
             FROM medios_pago
             WHERE activo = 1
             ORDER BY nombre ASC"
        )->fetchAll();
        foreach ($media as &$medium) $medium['id_medio_pago'] = (int)$medium['id_medio_pago'];
        unset($medium);

        $partners = $db->query(
            "SELECT
                s.id_socio,
                s.tipo_socio,
                s.id_categoria,
                s.id_medio_pago,
                CASE
                    WHEN s.tipo_socio = 'EMPRESA' THEN se.razon_social
                    ELSE TRIM(CONCAT(COALESCE(sp.apellido, ''), ', ', COALESCE(sp.nombre, '')))
                END AS denominacion,
                CASE WHEN s.tipo_socio = 'EMPRESA' THEN se.cuit ELSE sp.dni END AS documento,
                c.nombre AS categoria,
                c.monto_cuota AS monto_actual
             FROM socios s
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             LEFT JOIN categorias c ON c.id_categoria = s.id_categoria
             WHERE s.estado = 'ACTIVO'
               AND s.id_categoria IS NOT NULL
             ORDER BY s.tipo_socio, denominacion"
        )->fetchAll();

        $partnerCategoryIds = [];
        foreach ($partners as $partner) {
            if ($partner['id_categoria'] !== null) {
                $partnerCategoryIds[(int)$partner['id_categoria']] = true;
            }
        }
        $partnerHistory = self::priceHistoryByCategory($db, array_keys($partnerCategoryIds));

        foreach ($partners as &$partner) {
            $partner['id_socio'] = (int)$partner['id_socio'];
            $partner['id_categoria'] = $partner['id_categoria'] === null ? null : (int)$partner['id_categoria'];
            $partner['id_medio_pago'] = $partner['id_medio_pago'] === null ? null : (int)$partner['id_medio_pago'];
            $partner['monto_sugerido'] = number_format(
                $partner['id_categoria'] === null
                    ? 0
                    : self::priceForPeriod(
                        $partnerHistory[$partner['id_categoria']] ?? [],
                        (float)($partner['monto_actual'] ?? 0),
                        $periodEnd
                    ),
                2,
                '.',
                ''
            );
            unset($partner['monto_actual']);
            $partner['denominacion'] = trim((string)$partner['denominacion']);
        }
        unset($partner);

        $firstPartnerYear = $db->query(
            "SELECT MIN(YEAR(fecha_alta))
             FROM socios
             WHERE fecha_alta IS NOT NULL"
        )->fetchColumn();
        $firstPaymentYear = $db->query('SELECT MIN(anio) FROM pagos')->fetchColumn();
        $currentYear = (int)date('Y');
        $yearCandidates = [$currentYear];
        if ($firstPartnerYear !== false && $firstPartnerYear !== null) $yearCandidates[] = (int)$firstPartnerYear;
        if ($firstPaymentYear !== false && $firstPaymentYear !== null) $yearCandidates[] = (int)$firstPaymentYear;
        $firstYear = max(2000, min($yearCandidates));
        $lastYear = $currentYear + 1;
        $years = [];
        for ($catalogYear = $lastYear; $catalogYear >= $firstYear; $catalogYear--) $years[] = $catalogYear;

        $months = [];
        for ($catalogMonth = 1; $catalogMonth <= 12; $catalogMonth++) {
            $months[] = ['id_mes' => $catalogMonth, 'nombre' => self::monthName($catalogMonth)];
        }

        return [
            'catalogos' => [
                'categorias' => $categories,
                'medios_pago' => $media,
                'socios' => array_values(array_filter($partners, static fn(array $item): bool => $item['tipo_socio'] === 'PERSONA')),
                'empresas' => array_values(array_filter($partners, static fn(array $item): bool => $item['tipo_socio'] === 'EMPRESA')),
                'anios' => $years,
                'meses' => $months,
            ],
        ];
    }

    private static function priceHistoryByCategory(PDO $db, array $categoryIds): array
    {
        if ($categoryIds === []) return [];
        $categoryIds = array_values(array_map('intval', $categoryIds));
        $placeholders = implode(',', array_fill(0, count($categoryIds), '?'));
        $statement = $db->prepare(
            "SELECT id_categoria, monto_anterior, monto_nuevo, fecha_cambio
             FROM categorias_historial_precios
             WHERE id_categoria IN ({$placeholders})
             ORDER BY id_categoria ASC, fecha_cambio DESC, id_historial_precio DESC"
        );
        $statement->execute($categoryIds);
        $history = [];
        foreach ($statement->fetchAll() as $row) {
            $history[(int)$row['id_categoria']][] = $row;
        }
        return $history;
    }

    private static function priceForPeriod(array $history, float $fallback, string $periodEnd): float
    {
        foreach ($history as $row) {
            if (substr((string)$row['fecha_cambio'], 0, 10) <= $periodEnd) {
                return (float)$row['monto_nuevo'];
            }
        }
        if ($history !== []) {
            $oldest = $history[count($history) - 1];
            return (float)$oldest['monto_anterior'];
        }
        return $fallback;
    }

    private static function registrarPagoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $partnerId = positive_id($body['id_socio'] ?? null, 'socio o empresa');
        $year = self::validYear($body['anio'] ?? null);
        $month = self::validMonth($body['mes'] ?? null);
        $paymentDate = valid_date($body['fecha_pago'] ?? null, 'pago');
        $amount = decimal_amount($body['monto'] ?? null, 'monto', 0.01);
        $mediumId = positive_id($body['id_medio_pago'] ?? null, 'medio de pago');

        $partnerStatement = $db->prepare(
            "SELECT
                s.id_socio, s.tipo_socio, s.estado, s.fecha_alta, s.id_categoria,
                COALESCE(se.razon_social, CONCAT(sp.apellido, ', ', sp.nombre)) AS denominacion,
                c.nombre AS categoria
             FROM socios s
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             LEFT JOIN categorias c ON c.id_categoria = s.id_categoria
             WHERE s.id_socio = ?
             LIMIT 1"
        );
        $partnerStatement->execute([$partnerId]);
        $partner = $partnerStatement->fetch();
        if (!$partner) api_error('El socio o empresa seleccionado no existe.', 'SOCIO_NO_ENCONTRADO', 404);
        if ($partner['estado'] !== 'ACTIVO') api_error('No se puede registrar una cuota a un socio o empresa inactiva.', 'SOCIO_INACTIVO', 409);
        if ($partner['id_categoria'] === null) {
            api_error('Asigná una categoría antes de registrar la cuota.', 'CATEGORIA_REQUERIDA', 409);
        }

        $periodEnd = (new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month)))
            ->modify('last day of this month')
            ->format('Y-m-d');
        if ($partner['fecha_alta'] !== null && (string)$partner['fecha_alta'] > $periodEnd) {
            api_error('El período seleccionado es anterior a la fecha de alta.', 'PERIODO_ANTERIOR_AL_ALTA', 409);
        }

        $mediumStatement = $db->prepare('SELECT id_medio_pago, nombre FROM medios_pago WHERE id_medio_pago = ? AND activo = 1');
        $mediumStatement->execute([$mediumId]);
        $medium = $mediumStatement->fetch();
        if (!$medium) api_error('El medio de pago seleccionado no existe o está inactivo.', 'MEDIO_PAGO_INVALIDO');

        try {
            $paymentId = transaction($db, static function () use (
                $db,
                $auth,
                $partnerId,
                $year,
                $month,
                $paymentDate,
                $amount,
                $mediumId,
                $partner,
                $medium
            ): int {
                $insert = $db->prepare(
                    'INSERT INTO pagos (id_socio, mes, anio, fecha_pago, monto, id_medio_pago) VALUES (?, ?, ?, ?, ?, ?)'
                );
                $insert->execute([$partnerId, $month, $year, $paymentDate, $amount, $mediumId]);
                $id = (int)$db->lastInsertId();
                audit_change(
                    $db,
                    $auth,
                    'CUOTAS',
                    'REGISTRAR_PAGO',
                    'pagos',
                    $id,
                    sprintf('Se registró la cuota de %s %d para %s.', self::monthName($month), $year, $partner['denominacion']),
                    null,
                    [
                        'id_pago' => $id,
                        'id_socio' => $partnerId,
                        'denominacion' => $partner['denominacion'],
                        'tipo_socio' => $partner['tipo_socio'],
                        'categoria' => $partner['categoria'],
                        'anio' => $year,
                        'mes' => $month,
                        'fecha_pago' => $paymentDate,
                        'monto' => $amount,
                        'id_medio_pago' => $mediumId,
                        'medio_pago' => $medium['nombre'],
                    ]
                );
                return $id;
            });
        } catch (PDOException $error) {
            if (duplicate_key($error)) {
                api_error('Ese período ya figura como pagado.', 'PAGO_YA_REGISTRADO', 409);
            }
            throw $error;
        }

        return self::paymentById($db, $paymentId);
    }

    private static function eliminarPagoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $paymentId = positive_id($body['id_pago'] ?? $body['id'] ?? null, 'pago');
        $payment = self::paymentById($db, $paymentId);

        transaction($db, static function () use ($db, $auth, $paymentId, $payment): void {
            $delete = $db->prepare('DELETE FROM pagos WHERE id_pago = ?');
            $delete->execute([$paymentId]);
            if ($delete->rowCount() !== 1) {
                api_error('El pago ya no existe.', 'PAGO_NO_ENCONTRADO', 404);
            }
            audit_change(
                $db,
                $auth,
                'CUOTAS',
                'ELIMINAR_PAGO',
                'pagos',
                $paymentId,
                sprintf('Se eliminó la cuota de %s %d de %s.', self::monthName((int)$payment['mes']), (int)$payment['anio'], $payment['denominacion']),
                $payment,
                null
            );
        });

        return $payment;
    }

    private static function paymentById(PDO $db, int $paymentId): array
    {
        $statement = $db->prepare(
            "SELECT
                p.id_pago, p.id_socio, p.mes, p.anio, p.fecha_pago, p.monto, p.id_medio_pago,
                s.tipo_socio,
                COALESCE(se.razon_social, CONCAT(sp.apellido, ', ', sp.nombre)) AS denominacion,
                CASE WHEN s.tipo_socio = 'EMPRESA' THEN se.cuit ELSE sp.dni END AS documento,
                c.nombre AS categoria,
                mp.nombre AS medio_pago
             FROM pagos p
             INNER JOIN socios s ON s.id_socio = p.id_socio
             LEFT JOIN socios_personas sp ON sp.id_socio = s.id_socio
             LEFT JOIN socios_empresas se ON se.id_socio = s.id_socio
             LEFT JOIN categorias c ON c.id_categoria = s.id_categoria
             LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
             WHERE p.id_pago = ?
             LIMIT 1"
        );
        $statement->execute([$paymentId]);
        $row = $statement->fetch();
        if (!$row) api_error('El pago solicitado no existe.', 'PAGO_NO_ENCONTRADO', 404);
        return self::castRow($row, (int)$row['anio'], (int)$row['mes']);
    }

    private static function castRow(array $row, int $year, int $month): array
    {
        return [
            'id_pago' => isset($row['id_pago']) && $row['id_pago'] !== null ? (int)$row['id_pago'] : null,
            'id_socio' => (int)$row['id_socio'],
            'tipo_socio' => (string)$row['tipo_socio'],
            'estado_socio' => (string)($row['estado_socio'] ?? 'ACTIVO'),
            'denominacion' => trim((string)($row['denominacion'] ?? '')),
            'documento' => $row['documento'] === null ? null : (string)$row['documento'],
            'id_categoria' => isset($row['id_categoria']) && $row['id_categoria'] !== null ? (int)$row['id_categoria'] : null,
            'categoria' => $row['categoria'] === null ? null : (string)$row['categoria'],
            'fecha_alta' => $row['fecha_alta'] ?? null,
            'id_medio_pago_preferido' => isset($row['id_medio_pago_preferido']) && $row['id_medio_pago_preferido'] !== null
                ? (int)$row['id_medio_pago_preferido']
                : null,
            'medio_pago_preferido' => $row['medio_pago_preferido'] ?? null,
            'anio' => isset($row['anio']) && $row['anio'] !== null ? (int)$row['anio'] : $year,
            'mes' => isset($row['mes']) && $row['mes'] !== null ? (int)$row['mes'] : $month,
            'mes_nombre' => self::monthName(isset($row['mes']) && $row['mes'] !== null ? (int)$row['mes'] : $month),
            'periodo' => self::monthName(isset($row['mes']) && $row['mes'] !== null ? (int)$row['mes'] : $month) . ' ' . (isset($row['anio']) && $row['anio'] !== null ? (int)$row['anio'] : $year),
            'fecha_pago' => $row['fecha_pago'] ?? null,
            'monto_sugerido' => number_format((float)($row['monto_sugerido'] ?? 0), 2, '.', ''),
            'monto' => $row['monto'] === null ? null : number_format((float)$row['monto'], 2, '.', ''),
            'id_medio_pago' => isset($row['id_medio_pago']) && $row['id_medio_pago'] !== null ? (int)$row['id_medio_pago'] : null,
            'medio_pago' => $row['medio_pago'] ?? null,
        ];
    }

    private static function validYear(mixed $value): int
    {
        $year = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => 2100]]);
        if ($year === false) api_error('El año seleccionado no es válido.', 'VALIDATION_ERROR');
        return (int)$year;
    }

    private static function validMonth(mixed $value): int
    {
        $month = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
        if ($month === false) api_error('El mes seleccionado no es válido.', 'VALIDATION_ERROR');
        return (int)$month;
    }

    private static function optionalPositiveId(mixed $value): ?int
    {
        if ($value === null || $value === '') return null;
        return positive_id($value, 'categoría');
    }

    private static function monthName(int $month): string
    {
        return [
            1 => 'ENERO', 2 => 'FEBRERO', 3 => 'MARZO', 4 => 'ABRIL',
            5 => 'MAYO', 6 => 'JUNIO', 7 => 'JULIO', 8 => 'AGOSTO',
            9 => 'SEPTIEMBRE', 10 => 'OCTUBRE', 11 => 'NOVIEMBRE', 12 => 'DICIEMBRE',
        ][$month] ?? 'MES';
    }
}

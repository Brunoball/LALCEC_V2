<?php
declare(strict_types=1);

require_once __DIR__ . '/../contable/contable_schema.php';

final class Dashboard
{
    public static function resumen(): never
    {
        $auth = auth_context();
        $db = $auth['db'];
        ensure_contable_schema($db);
        api_success(['resumen' => self::resumenDatos($db)]);
    }

    private static function resumenDatos(PDO $db): array
    {
        $today = new DateTimeImmutable('today');
        $monthStart = $today->modify('first day of this month');
        $monthEnd = $monthStart->modify('+1 month');
        $seriesStart = $monthStart->modify('-5 months');

        $activePartners = self::count($db, 'SELECT COUNT(*) FROM socios WHERE activo = 1');
        $inactivePartners = self::count($db, 'SELECT COUNT(*) FROM socios WHERE activo = 0');
        $newPartners = self::count(
            $db,
            'SELECT COUNT(*) FROM socios WHERE fecha_ingreso >= ? AND fecha_ingreso < ?',
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $activeFamilies = self::count($db, 'SELECT COUNT(*) FROM familias WHERE activo = 1');
        $partnersWithoutFamily = self::count(
            $db,
            'SELECT COUNT(*)
             FROM socios s
             WHERE s.activo = 1
               AND NOT EXISTS (
                   SELECT 1
                   FROM familia_socios fs
                   INNER JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
                   WHERE fs.id_socio = s.id_socio
               )'
        );
        $partnersWithCategory = self::count(
            $db,
            'SELECT COUNT(DISTINCT s.id_socio)
             FROM socios s
             INNER JOIN socio_categorias sc ON sc.id_socio = s.id_socio AND sc.activo = 1
             INNER JOIN categorias c ON c.id_categoria = sc.id_categoria AND c.activo = 1
             WHERE s.activo = 1'
        );
        $activeCategories = self::count($db, 'SELECT COUNT(*) FROM categorias WHERE activo = 1');
        $categoriesWithPartners = self::count(
            $db,
            'SELECT COUNT(DISTINCT c.id_categoria)
             FROM categorias c
             INNER JOIN socio_categorias sc ON sc.id_categoria = c.id_categoria AND sc.activo = 1
             INNER JOIN socios s ON s.id_socio = sc.id_socio AND s.activo = 1
             WHERE c.activo = 1'
        );

        $partnerIncome = self::sumCents(
            $db,
            "SELECT COALESCE(SUM(monto), 0) FROM pagos
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?",
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        ) + self::sumCents(
            $db,
            "SELECT COALESCE(SUM(monto), 0) FROM pagos_inscripciones
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?",
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $otherIncome = self::sumCents(
            $db,
            "SELECT COALESCE(SUM(importe), 0) FROM contable_ingresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?",
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $expenses = self::sumCents(
            $db,
            "SELECT COALESCE(SUM(importe), 0) FROM contable_egresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?",
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $income = $partnerIncome + $otherIncome;

        $paymentOperations = self::count(
            $db,
            "SELECT COUNT(DISTINCT operacion)
             FROM (
                 SELECT COALESCE(NULLIF(codigo_operacion, ''), CONCAT('PAGO-', id_pago)) AS operacion
                 FROM pagos
                 WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?

                 UNION ALL

                 SELECT COALESCE(NULLIF(codigo_operacion, ''), CONCAT('INSCRIPCION-', id_pago_inscripcion)) AS operacion
                 FROM pagos_inscripciones
                 WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             ) operaciones",
            [
                $monthStart->format('Y-m-d'),
                $monthEnd->format('Y-m-d'),
                $monthStart->format('Y-m-d'),
                $monthEnd->format('Y-m-d'),
            ]
        );

        $configuration = self::configurationStatus($db);

        return [
            'periodo' => [
                'fecha' => $today->format('Y-m-d'),
                'anio' => (int)$today->format('Y'),
                'mes' => (int)$today->format('n'),
                'mes_nombre' => self::monthName((int)$today->format('n')),
            ],
            'socios' => [
                'activos' => $activePartners,
                'inactivos' => $inactivePartners,
                'altas_mes' => $newPartners,
                'con_familia' => max(0, $activePartners - $partnersWithoutFamily),
                'sin_familia' => $partnersWithoutFamily,
                'con_categoria' => $partnersWithCategory,
            ],
            'familias' => ['activas' => $activeFamilies],
            'categorias' => [
                'activas' => $activeCategories,
                'con_socios' => $categoriesWithPartners,
                'sin_socios' => max(0, $activeCategories - $categoriesWithPartners),
            ],
            'contable' => [
                'ingresos_socios_mes' => self::money($partnerIncome),
                'otros_ingresos_mes' => self::money($otherIncome),
                'ingresos_mes' => self::money($income),
                'egresos_mes' => self::money($expenses),
                'saldo_mes' => self::money($income - $expenses),
                'operaciones_cobro_mes' => $paymentOperations,
            ],
            'estado' => [
                'socios_con_familia' => self::percentage($activePartners - $partnersWithoutFamily, $activePartners),
                'socios_con_categoria' => self::percentage($partnersWithCategory, $activePartners),
                'categorias_con_socios' => self::percentage($categoriesWithPartners, $activeCategories),
                'configuracion_contable' => $configuration['porcentaje'],
                'configuracion_completa' => $configuration['completa'],
                'configuracion_pendientes' => $configuration['pendientes'],
            ],
            'serie' => self::monthlySeries($db, $seriesStart, $monthEnd),
            'movimientos_recientes' => self::recentMovements($db),
        ];
    }

    private static function count(PDO $db, string $sql, array $params = []): int
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return (int)$statement->fetchColumn();
    }

    private static function sumCents(PDO $db, string $sql, array $params = []): int
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return (int)round((float)$statement->fetchColumn() * 100, 0, PHP_ROUND_HALF_UP);
    }

    private static function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    private static function percentage(int $part, int $total): int
    {
        if ($total <= 0) return 0;
        return max(0, min(100, (int)round(($part / $total) * 100)));
    }

    private static function configurationStatus(PDO $db): array
    {
        $requiredTypes = [
            'PROVEEDOR' => 'Proveedores/personas',
            'CATEGORIA_INGRESO' => 'Categorías de ingresos',
            'CONCEPTO_INGRESO' => 'Conceptos de ingresos',
            'CATEGORIA_EGRESO' => 'Categorías de egresos',
            'CONCEPTO_EGRESO' => 'Conceptos de egresos',
        ];
        $counts = array_fill_keys(array_keys($requiredTypes), 0);
        $rows = $db->query(
            'SELECT tipo, COUNT(*) AS cantidad
             FROM contable_opciones
             WHERE activo = 1
             GROUP BY tipo'
        )->fetchAll();
        foreach ($rows as $row) {
            $type = (string)$row['tipo'];
            if (array_key_exists($type, $counts)) $counts[$type] = (int)$row['cantidad'];
        }

        $completed = 0;
        $pending = [];
        foreach ($requiredTypes as $type => $label) {
            if ($counts[$type] > 0) $completed++;
            else $pending[] = $label;
        }

        $paymentMethods = self::count(
            $db,
            "SELECT COUNT(*) FROM medios_pago WHERE activo = 1 AND nombre <> 'CONDONACIÓN'"
        );
        if ($paymentMethods > 0) $completed++;
        else $pending[] = 'Medios de pago';

        $total = count($requiredTypes) + 1;
        return [
            'porcentaje' => self::percentage($completed, $total),
            'completa' => $completed === $total,
            'pendientes' => $pending,
        ];
    }

    private static function monthlySeries(PDO $db, DateTimeImmutable $start, DateTimeImmutable $end): array
    {
        $statement = $db->prepare(
            "SELECT DATE_FORMAT(fecha, '%Y-%m') AS periodo,
                    SUM(ingresos_socios) AS ingresos_socios,
                    SUM(otros_ingresos) AS otros_ingresos,
                    SUM(egresos) AS egresos
             FROM (
                 SELECT fecha_pago AS fecha, monto AS ingresos_socios, 0 AS otros_ingresos, 0 AS egresos
                 FROM pagos WHERE estado = 'PAGADO'
                 UNION ALL
                 SELECT fecha_pago AS fecha, monto AS ingresos_socios, 0 AS otros_ingresos, 0 AS egresos
                 FROM pagos_inscripciones WHERE estado = 'PAGADO'
                 UNION ALL
                 SELECT fecha, 0 AS ingresos_socios, importe AS otros_ingresos, 0 AS egresos
                 FROM contable_ingresos WHERE estado = 'ACTIVO'
                 UNION ALL
                 SELECT fecha, 0 AS ingresos_socios, 0 AS otros_ingresos, importe AS egresos
                 FROM contable_egresos WHERE estado = 'ACTIVO'
             ) movimientos
             WHERE fecha >= ? AND fecha < ?
             GROUP BY DATE_FORMAT(fecha, '%Y-%m')"
        );
        $statement->execute([$start->format('Y-m-d'), $end->format('Y-m-d')]);
        $rowsByPeriod = [];
        foreach ($statement->fetchAll() as $row) $rowsByPeriod[(string)$row['periodo']] = $row;

        $series = [];
        for ($cursor = $start; $cursor < $end; $cursor = $cursor->modify('+1 month')) {
            $key = $cursor->format('Y-m');
            $row = $rowsByPeriod[$key] ?? [];
            $partner = (int)round((float)($row['ingresos_socios'] ?? 0) * 100, 0, PHP_ROUND_HALF_UP);
            $other = (int)round((float)($row['otros_ingresos'] ?? 0) * 100, 0, PHP_ROUND_HALF_UP);
            $expense = (int)round((float)($row['egresos'] ?? 0) * 100, 0, PHP_ROUND_HALF_UP);
            $totalIncome = $partner + $other;
            $series[] = [
                'periodo' => $key,
                'mes' => (int)$cursor->format('n'),
                'anio' => (int)$cursor->format('Y'),
                'etiqueta' => self::monthShortName((int)$cursor->format('n')),
                'ingresos' => self::money($totalIncome),
                'egresos' => self::money($expense),
                'resultado' => self::money($totalIncome - $expense),
            ];
        }
        return $series;
    }

    private static function recentMovements(PDO $db): array
    {
        $rows = $db->query(
            "SELECT tipo, fecha, creado, titulo, detalle, importe
             FROM (
                 SELECT 'INGRESO_SOCIOS' AS tipo,
                        MAX(cobros.fecha) AS fecha,
                        MAX(cobros.creado) AS creado,
                        CASE
                            WHEN SUM(cobros.es_cuota) > 0 AND SUM(cobros.es_inscripcion) > 0
                                THEN 'CUOTAS E INSCRIPCIONES'
                            WHEN SUM(cobros.es_cuota) > 0
                                THEN 'CUOTAS DE SOCIOS'
                            ELSE 'INSCRIPCIONES'
                        END AS titulo,
                        CONCAT(COUNT(*), IF(COUNT(*) = 1, ' imputación', ' imputaciones')) AS detalle,
                        SUM(cobros.importe) AS importe
                 FROM (
                     SELECT
                         COALESCE(NULLIF(p.codigo_operacion, ''), CONCAT('PAGO-', p.id_pago)) AS operacion,
                         p.fecha_pago AS fecha,
                         p.created_at AS creado,
                         p.monto AS importe,
                         1 AS es_cuota,
                         0 AS es_inscripcion
                     FROM pagos p
                     WHERE p.estado = 'PAGADO'

                     UNION ALL

                     SELECT
                         COALESCE(NULLIF(pi.codigo_operacion, ''), CONCAT('INSCRIPCION-', pi.id_pago_inscripcion)) AS operacion,
                         pi.fecha_pago AS fecha,
                         pi.created_at AS creado,
                         pi.monto AS importe,
                         0 AS es_cuota,
                         1 AS es_inscripcion
                     FROM pagos_inscripciones pi
                     WHERE pi.estado = 'PAGADO'
                 ) cobros
                 GROUP BY cobros.operacion

                 UNION ALL

                 SELECT 'OTRO_INGRESO' AS tipo,
                        ci.fecha,
                        ci.created_at AS creado,
                        ci.categoria_snapshot AS titulo,
                        CONCAT(ci.proveedor_snapshot, IF(ci.detalle IS NULL OR ci.detalle = '', '', CONCAT(' · ', ci.detalle))) AS detalle,
                        ci.importe
                 FROM contable_ingresos ci
                 WHERE ci.estado = 'ACTIVO'

                 UNION ALL

                 SELECT 'EGRESO' AS tipo,
                        ce.fecha,
                        ce.created_at AS creado,
                        ce.categoria_snapshot AS titulo,
                        CONCAT(ce.proveedor_snapshot, IF(ce.detalle IS NULL OR ce.detalle = '', '', CONCAT(' · ', ce.detalle))) AS detalle,
                        ce.importe
                 FROM contable_egresos ce
                 WHERE ce.estado = 'ACTIVO'
             ) movimientos
             ORDER BY fecha DESC, creado DESC
             LIMIT 8"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['tipo'] = (string)$row['tipo'];
            $row['fecha'] = (string)$row['fecha'];
            $row['titulo'] = (string)$row['titulo'];
            $row['detalle'] = (string)$row['detalle'];
            $row['importe'] = number_format((float)$row['importe'], 2, '.', '');
        }
        unset($row);
        return $rows;
    }

    private static function monthName(int $month): string
    {
        return [
            1 => 'ENERO', 2 => 'FEBRERO', 3 => 'MARZO', 4 => 'ABRIL',
            5 => 'MAYO', 6 => 'JUNIO', 7 => 'JULIO', 8 => 'AGOSTO',
            9 => 'SEPTIEMBRE', 10 => 'OCTUBRE', 11 => 'NOVIEMBRE', 12 => 'DICIEMBRE',
        ][$month] ?? '';
    }

    private static function monthShortName(int $month): string
    {
        return [
            1 => 'ENE', 2 => 'FEB', 3 => 'MAR', 4 => 'ABR', 5 => 'MAY', 6 => 'JUN',
            7 => 'JUL', 8 => 'AGO', 9 => 'SEP', 10 => 'OCT', 11 => 'NOV', 12 => 'DIC',
        ][$month] ?? '';
    }
}

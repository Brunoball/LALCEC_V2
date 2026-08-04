<?php
declare(strict_types=1);

final class Dashboard
{
    public static function resumen(): never
    {
        $auth = auth_context();
        api_success(['resumen' => self::resumenDatos($auth['db'])]);
    }

    private static function resumenDatos(PDO $db): array
    {
        $today = new DateTimeImmutable('today');
        $monthStart = $today->modify('first day of this month');
        $monthEnd = $monthStart->modify('+1 month');
        $seriesStart = $monthStart->modify('-5 months');

        $activePartners = self::count($db, "SELECT COUNT(*) FROM socios WHERE estado = 'ACTIVO'");
        $inactivePartners = self::count($db, "SELECT COUNT(*) FROM socios WHERE estado = 'INACTIVO'");
        $newPartners = self::count(
            $db,
            'SELECT COUNT(*) FROM socios WHERE fecha_alta >= ? AND fecha_alta < ?',
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $activeFamilies = self::count($db, 'SELECT COUNT(*) FROM familias WHERE activo = 1');
        $withoutFamily = self::count(
            $db,
            "SELECT COUNT(*)
             FROM socios s
             WHERE s.tipo_socio = 'PERSONA' AND s.estado = 'ACTIVO'
               AND NOT EXISTS (
                    SELECT 1
                    FROM familias_socios fs
                    INNER JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
                    WHERE fs.id_socio = s.id_socio AND fs.fecha_desvinculacion IS NULL
               )"
        );
        $activePeople = self::count(
            $db,
            "SELECT COUNT(*) FROM socios WHERE tipo_socio = 'PERSONA' AND estado = 'ACTIVO'"
        );
        $withCategory = self::count(
            $db,
            "SELECT COUNT(*) FROM socios WHERE estado = 'ACTIVO' AND id_categoria IS NOT NULL"
        );
        $activeCategories = self::count($db, 'SELECT COUNT(*) FROM categorias WHERE activo = 1');
        $categoriesWithPartners = self::count(
            $db,
            "SELECT COUNT(DISTINCT c.id_categoria)
             FROM categorias c
             INNER JOIN socios s ON s.id_categoria = c.id_categoria AND s.estado = 'ACTIVO'
             WHERE c.activo = 1"
        );

        $income = self::sum(
            $db,
            'SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE fecha_pago >= ? AND fecha_pago < ?',
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );
        $paymentOperations = self::count(
            $db,
            'SELECT COUNT(*) FROM pagos WHERE fecha_pago >= ? AND fecha_pago < ?',
            [$monthStart->format('Y-m-d'), $monthEnd->format('Y-m-d')]
        );

        $configurationChecks = [
            self::count($db, 'SELECT COUNT(*) FROM categorias WHERE activo = 1') > 0,
            self::count($db, 'SELECT COUNT(*) FROM medios_pago WHERE activo = 1') > 0,
            self::count($db, 'SELECT COUNT(*) FROM condiciones_iva WHERE activo = 1') > 0,
        ];
        $completed = count(array_filter($configurationChecks));
        $configurationPercent = (int)round(($completed / count($configurationChecks)) * 100);
        $configurationPending = [];
        if (!$configurationChecks[0]) $configurationPending[] = 'Categorías';
        if (!$configurationChecks[1]) $configurationPending[] = 'Medios de pago';
        if (!$configurationChecks[2]) $configurationPending[] = 'Condiciones de IVA';

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
                'con_familia' => max(0, $activePeople - $withoutFamily),
                'sin_familia' => $withoutFamily,
                'con_categoria' => $withCategory,
            ],
            'familias' => ['activas' => $activeFamilies],
            'categorias' => [
                'activas' => $activeCategories,
                'con_socios' => $categoriesWithPartners,
                'sin_socios' => max(0, $activeCategories - $categoriesWithPartners),
            ],
            'contable' => [
                'ingresos_socios_mes' => self::money($income),
                'otros_ingresos_mes' => '0.00',
                'ingresos_mes' => self::money($income),
                'egresos_mes' => '0.00',
                'saldo_mes' => self::money($income),
                'operaciones_cobro_mes' => $paymentOperations,
            ],
            'estado' => [
                'socios_con_familia' => self::percentage($activePeople - $withoutFamily, $activePeople),
                'socios_con_categoria' => self::percentage($withCategory, $activePartners),
                'categorias_con_socios' => self::percentage($categoriesWithPartners, $activeCategories),
                'configuracion_contable' => $configurationPercent,
                'configuracion_completa' => $configurationPercent === 100,
                'configuracion_pendientes' => $configurationPending,
            ],
            'serie' => self::monthlySeries($db, $seriesStart, $monthEnd),
            'movimientos_recientes' => [],
        ];
    }

    private static function monthlySeries(PDO $db, DateTimeImmutable $start, DateTimeImmutable $end): array
    {
        $statement = $db->prepare(
            "SELECT YEAR(fecha_pago) AS anio, MONTH(fecha_pago) AS mes, COALESCE(SUM(monto), 0) AS ingresos
             FROM pagos
             WHERE fecha_pago >= ? AND fecha_pago < ?
             GROUP BY YEAR(fecha_pago), MONTH(fecha_pago)"
        );
        $statement->execute([$start->format('Y-m-d'), $end->format('Y-m-d')]);
        $indexed = [];
        foreach ($statement->fetchAll() as $row) {
            $key = sprintf('%04d-%02d', (int)$row['anio'], (int)$row['mes']);
            $indexed[$key] = (float)$row['ingresos'];
        }

        $series = [];
        for ($cursor = $start; $cursor < $end; $cursor = $cursor->modify('+1 month')) {
            $key = $cursor->format('Y-m');
            $month = (int)$cursor->format('n');
            $series[] = [
                'periodo' => $key,
                'anio' => (int)$cursor->format('Y'),
                'mes' => $month,
                'etiqueta' => substr(self::monthName($month), 0, 3),
                'ingresos' => self::money($indexed[$key] ?? 0),
                'egresos' => '0.00',
            ];
        }
        return $series;
    }

    private static function count(PDO $db, string $sql, array $params = []): int
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return (int)$statement->fetchColumn();
    }

    private static function sum(PDO $db, string $sql, array $params = []): float
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return (float)$statement->fetchColumn();
    }

    private static function money(float $value): string
    {
        return number_format($value, 2, '.', '');
    }

    private static function percentage(int $part, int $total): int
    {
        if ($total <= 0) return 0;
        return max(0, min(100, (int)round(($part / $total) * 100)));
    }

    private static function monthName(int $month): string
    {
        return [
            1 => 'ENERO', 2 => 'FEBRERO', 3 => 'MARZO', 4 => 'ABRIL',
            5 => 'MAYO', 6 => 'JUNIO', 7 => 'JULIO', 8 => 'AGOSTO',
            9 => 'SEPTIEMBRE', 10 => 'OCTUBRE', 11 => 'NOVIEMBRE', 12 => 'DICIEMBRE',
        ][$month] ?? '';
    }
}

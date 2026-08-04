<?php
declare(strict_types=1);

trait ContableConsultas
{
    /*
     * Contrato de helpers provistos por ContableSoporte.
     * Estas declaraciones no duplican lógica: permiten que PHP/Intelephense
     * conozcan los métodos disponibles al componer ambos traits en Contable.
     */
    abstract protected static function filtroAnio(mixed $value): int;
    abstract protected static function filtroMes(mixed $value, bool $required = true): ?int;
    abstract protected static function textoBusqueda(mixed $value): string;
    abstract protected static function idOpcional(mixed $value, string $label): ?int;
    abstract protected static function rangoAnio(int $year): array;
    abstract protected static function rangoMes(int $year, int $month): array;
    abstract protected static function centavos(mixed $value): int;
    abstract protected static function importeDesdeCentavos(int $cents): string;
    abstract protected static function nombreMes(int $month): string;

    protected static function resumenDatos(PDO $db, int $year, int $selectedMonth): array
    {
        [$yearStart, $yearEnd] = self::rangoAnio($year);
        $partnerByMonth = array_fill(1, 12, 0);
        $otherByMonth = array_fill(1, 12, 0);
        $expensesByMonth = array_fill(1, 12, 0);

        self::acumularTotalesMensuales(
            $db,
            "SELECT MONTH(fecha_pago) AS mes, SUM(monto) AS total
             FROM pagos
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY MONTH(fecha_pago)",
            [$yearStart, $yearEnd],
            $partnerByMonth
        );
        self::acumularTotalesMensuales(
            $db,
            "SELECT MONTH(fecha_pago) AS mes, SUM(monto) AS total
             FROM pagos_inscripciones
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY MONTH(fecha_pago)",
            [$yearStart, $yearEnd],
            $partnerByMonth
        );
        self::acumularTotalesMensuales(
            $db,
            "SELECT MONTH(fecha) AS mes, SUM(importe) AS total
             FROM contable_ingresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?
             GROUP BY MONTH(fecha)",
            [$yearStart, $yearEnd],
            $otherByMonth
        );
        self::acumularTotalesMensuales(
            $db,
            "SELECT MONTH(fecha) AS mes, SUM(importe) AS total
             FROM contable_egresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?
             GROUP BY MONTH(fecha)",
            [$yearStart, $yearEnd],
            $expensesByMonth
        );

        $months = [];
        $totalPartner = 0;
        $totalOther = 0;
        $totalExpenses = 0;
        foreach (range(1, 12) as $month) {
            $partner = $partnerByMonth[$month];
            $other = $otherByMonth[$month];
            $expenses = $expensesByMonth[$month];
            $income = $partner + $other;
            $months[] = [
                'mes' => $month,
                'nombre' => self::nombreMes($month),
                'ingresos_socios' => self::importeDesdeCentavos($partner),
                'otros_ingresos' => self::importeDesdeCentavos($other),
                'ingresos' => self::importeDesdeCentavos($income),
                'egresos' => self::importeDesdeCentavos($expenses),
                'resultado' => self::importeDesdeCentavos($income - $expenses),
            ];
            $totalPartner += $partner;
            $totalOther += $other;
            $totalExpenses += $expenses;
        }

        $income = $totalPartner + $totalOther;
        return [
            'anio' => $year,
            'mes_seleccionado' => $selectedMonth,
            'totales' => [
                'ingresos_socios' => self::importeDesdeCentavos($totalPartner),
                'otros_ingresos' => self::importeDesdeCentavos($totalOther),
                'ingresos' => self::importeDesdeCentavos($income),
                'egresos' => self::importeDesdeCentavos($totalExpenses),
                'resultado' => self::importeDesdeCentavos($income - $totalExpenses),
            ],
            'meses' => $months,
            'detalle_mes' => [
                'categorias_ingresos' => self::resumenCategoriasIngresos($db, $year, $selectedMonth),
                'categorias_egresos' => self::resumenCategoriasEgresos($db, $year, $selectedMonth),
                'medios' => self::resumenMedios($db, $year, $selectedMonth),
            ],
        ];
    }

    private static function acumularTotalesMensuales(PDO $db, string $sql, array $params, array &$target): void
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        foreach ($statement->fetchAll() as $row) {
            $month = (int)($row['mes'] ?? 0);
            if ($month >= 1 && $month <= 12) {
                $target[$month] += self::centavos($row['total'] ?? 0);
            }
        }
    }

    private static function resumenCategoriasIngresos(PDO $db, int $year, int $month): array
    {
        [$monthStart, $monthEnd] = self::rangoMes($year, $month);
        $totals = [];

        self::acumularAgrupacion(
            $db,
            "SELECT COALESCE(NULLIF(categoria_nombre_snapshot, ''), 'CUOTAS DE SOCIOS') AS nombre, SUM(monto) AS total
             FROM pagos
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY COALESCE(NULLIF(categoria_nombre_snapshot, ''), 'CUOTAS DE SOCIOS')",
            [$monthStart, $monthEnd],
            $totals
        );
        self::acumularAgrupacion(
            $db,
            "SELECT COALESCE(NULLIF(categoria_nombre_snapshot, ''), 'INSCRIPCIONES') AS nombre, SUM(monto) AS total
             FROM pagos_inscripciones
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY COALESCE(NULLIF(categoria_nombre_snapshot, ''), 'INSCRIPCIONES')",
            [$monthStart, $monthEnd],
            $totals
        );
        self::acumularAgrupacion(
            $db,
            "SELECT categoria_snapshot AS nombre, SUM(importe) AS total
             FROM contable_ingresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?
             GROUP BY categoria_snapshot",
            [$monthStart, $monthEnd],
            $totals
        );

        return self::agruparRespuesta($totals);
    }

    private static function resumenCategoriasEgresos(PDO $db, int $year, int $month): array
    {
        [$monthStart, $monthEnd] = self::rangoMes($year, $month);
        $totals = [];
        self::acumularAgrupacion(
            $db,
            "SELECT categoria_snapshot AS nombre, SUM(importe) AS total
             FROM contable_egresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?
             GROUP BY categoria_snapshot",
            [$monthStart, $monthEnd],
            $totals
        );
        return self::agruparRespuesta($totals);
    }

    private static function resumenMedios(PDO $db, int $year, int $month): array
    {
        [$monthStart, $monthEnd] = self::rangoMes($year, $month);
        $totals = [];

        self::acumularAgrupacion(
            $db,
            "SELECT COALESCE(NULLIF(medio_pago_nombre_snapshot, ''), 'SIN MEDIO') AS nombre, SUM(monto) AS total
             FROM pagos
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY COALESCE(NULLIF(medio_pago_nombre_snapshot, ''), 'SIN MEDIO')",
            [$monthStart, $monthEnd],
            $totals
        );
        self::acumularAgrupacion(
            $db,
            "SELECT COALESCE(NULLIF(medio_pago_nombre_snapshot, ''), 'SIN MEDIO') AS nombre, SUM(monto) AS total
             FROM pagos_inscripciones
             WHERE estado = 'PAGADO' AND fecha_pago >= ? AND fecha_pago < ?
             GROUP BY COALESCE(NULLIF(medio_pago_nombre_snapshot, ''), 'SIN MEDIO')",
            [$monthStart, $monthEnd],
            $totals
        );
        self::acumularAgrupacion(
            $db,
            "SELECT medio_pago_snapshot AS nombre, SUM(importe) AS total
             FROM contable_ingresos
             WHERE estado = 'ACTIVO' AND fecha >= ? AND fecha < ?
             GROUP BY medio_pago_snapshot",
            [$monthStart, $monthEnd],
            $totals
        );

        return self::agruparRespuesta($totals);
    }

    private static function acumularAgrupacion(PDO $db, string $sql, array $params, array &$target): void
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        foreach ($statement->fetchAll() as $row) {
            $name = trim((string)($row['nombre'] ?? '')) ?: 'SIN ESPECIFICAR';
            $target[$name] = ($target[$name] ?? 0) + self::centavos($row['total'] ?? 0);
        }
    }

    private static function agruparRespuesta(array $totals): array
    {
        arsort($totals, SORT_NUMERIC);
        $result = [];
        foreach ($totals as $name => $cents) {
            $result[] = ['nombre' => $name, 'total' => self::importeDesdeCentavos($cents)];
        }
        return $result;
    }

    protected static function listarIngresosSociosDatos(PDO $db, array $filters): array
    {
        $year = self::filtroAnio($filters['anio'] ?? null);
        $month = self::filtroMes($filters['mes'] ?? null);
        $search = self::textoBusqueda($filters['buscar'] ?? '');
        $categoryId = self::idOpcional($filters['categoria'] ?? null, 'categoría');
        $paymentMethodId = self::idOpcional($filters['medio'] ?? null, 'medio de pago');
        [$monthStart, $monthEnd] = self::rangoMes($year, $month);

        $items = array_merge(
            self::listarCuotasCobradas($db, $monthStart, $monthEnd, $categoryId, $paymentMethodId),
            self::listarInscripcionesCobradas($db, $monthStart, $monthEnd, $categoryId, $paymentMethodId)
        );

        if ($search !== '') {
            $needle = function_exists('mb_strtoupper')
                ? mb_strtoupper($search, 'UTF-8')
                : strtoupper($search);
            $items = array_values(array_filter($items, static function (array $item) use ($needle): bool {
                $haystack = implode(' ', [
                    $item['socio'] ?? '', $item['dni'] ?? '', $item['categoria'] ?? '',
                    $item['modalidad'] ?? '', $item['periodo'] ?? '', $item['medio'] ?? '',
                ]);
                $haystack = function_exists('mb_strtoupper')
                    ? mb_strtoupper($haystack, 'UTF-8')
                    : strtoupper($haystack);
                return str_contains($haystack, $needle);
            }));
        }

        usort($items, static function (array $left, array $right): int {
            $dateComparison = strcmp((string)$right['fecha'], (string)$left['fecha']);
            if ($dateComparison !== 0) return $dateComparison;
            $createdComparison = strcmp((string)$right['created_at'], (string)$left['created_at']);
            if ($createdComparison !== 0) return $createdComparison;
            $partnerComparison = strcmp((string)$left['socio'], (string)$right['socio']);
            if ($partnerComparison !== 0) return $partnerComparison;
            $categoryComparison = strcmp((string)$left['categoria'], (string)$right['categoria']);
            if ($categoryComparison !== 0) return $categoryComparison;
            return ((int)($left['mes_pagado'] ?? 0)) <=> ((int)($right['mes_pagado'] ?? 0));
        });

        $total = 0;
        $categories = [];
        foreach ($items as &$item) {
            foreach (['id_registro', 'id_socio', 'id_categoria', 'id_medio_pago', 'anio'] as $field) {
                $item[$field] = (int)$item[$field];
            }
            $item['mes_pagado'] = $item['mes_pagado'] === null ? null : (int)$item['mes_pagado'];
            $itemCents = self::centavos($item['monto']);
            $item['monto'] = self::importeDesdeCentavos($itemCents);
            $total += $itemCents;
            $category = (string)$item['categoria'];
            $categories[$category] ??= ['nombre' => $category, 'registros' => 0, 'total' => 0];
            $categories[$category]['registros']++;
            $categories[$category]['total'] += $itemCents;
        }
        unset($item);
        foreach ($categories as &$category) $category['total'] = self::importeDesdeCentavos($category['total']);
        unset($category);

        return [
            'items' => $items,
            'resumen' => [
                'total' => self::importeDesdeCentavos($total),
                'registros' => count($items),
                'categorias' => array_values($categories),
            ],
            'filtros' => ['anio' => $year, 'mes' => $month],
        ];
    }

    private static function listarCuotasCobradas(
        PDO $db,
        string $start,
        string $end,
        ?int $categoryId,
        ?int $paymentMethodId
    ): array {
        $where = ["p.estado = 'PAGADO'", 'p.fecha_pago >= ?', 'p.fecha_pago < ?'];
        $params = [$start, $end];
        if ($categoryId !== null) {
            $where[] = 'p.id_categoria = ?';
            $params[] = $categoryId;
        }
        if ($paymentMethodId !== null) {
            $where[] = 'p.id_medio_pago = ?';
            $params[] = $paymentMethodId;
        }

        $statement = $db->prepare(
            "SELECT CONCAT('CUOTA-', p.id_pago) AS clave,
                    'CUOTA' AS origen,
                    p.id_pago AS id_registro,
                    p.codigo_operacion,
                    p.fecha_pago AS fecha,
                    p.created_at,
                    p.id_socio,
                    p.id_categoria,
                    p.id_medio_pago,
                    COALESCE(NULLIF(p.socio_nombre_snapshot, ''), CONCAT(COALESCE(s.apellido, ''), ', ', COALESCE(s.nombre, ''))) AS socio,
                    COALESCE(NULLIF(p.socio_dni_snapshot, ''), s.dni, '') AS dni,
                    COALESCE(NULLIF(p.categoria_nombre_snapshot, ''), c.nombre, 'SIN CATEGORÍA') AS categoria,
                    COALESCE(NULLIF(p.medio_pago_nombre_snapshot, ''), mp.nombre, 'SIN MEDIO') AS medio,
                    COALESCE(modalidad_pago.codigo, 'MENSUAL') AS modalidad_codigo,
                    COALESCE(modalidad_pago.nombre, 'MENSUAL') AS modalidad,
                    CONCAT(COALESCE(m.nombre, CONCAT('MES ', p.id_mes)), ' / ', p.anio) AS periodo,
                    p.anio,
                    p.id_mes AS mes_pagado,
                    p.monto
             FROM pagos p
             LEFT JOIN socios s ON s.id_socio = p.id_socio
             LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
             LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
             LEFT JOIN modalidades_pago AS modalidad_pago ON modalidad_pago.id_modalidad_pago = p.id_modalidad_pago
             LEFT JOIN meses m ON m.id_mes = p.id_mes
             WHERE " . implode(' AND ', $where)
        );
        $statement->execute($params);
        return $statement->fetchAll();
    }

    private static function listarInscripcionesCobradas(
        PDO $db,
        string $start,
        string $end,
        ?int $categoryId,
        ?int $paymentMethodId
    ): array {
        $where = ["pi.estado = 'PAGADO'", 'pi.fecha_pago >= ?', 'pi.fecha_pago < ?'];
        $params = [$start, $end];
        if ($categoryId !== null) {
            $where[] = 'pi.id_categoria = ?';
            $params[] = $categoryId;
        }
        if ($paymentMethodId !== null) {
            $where[] = 'pi.id_medio_pago = ?';
            $params[] = $paymentMethodId;
        }

        $statement = $db->prepare(
            "SELECT CONCAT('INSCRIPCION-', pi.id_pago_inscripcion) AS clave,
                    'INSCRIPCION' AS origen,
                    pi.id_pago_inscripcion AS id_registro,
                    pi.codigo_operacion,
                    pi.fecha_pago AS fecha,
                    pi.created_at,
                    pi.id_socio,
                    pi.id_categoria,
                    pi.id_medio_pago,
                    COALESCE(NULLIF(pi.socio_nombre_snapshot, ''), CONCAT(COALESCE(s.apellido, ''), ', ', COALESCE(s.nombre, ''))) AS socio,
                    COALESCE(NULLIF(pi.socio_dni_snapshot, ''), s.dni, '') AS dni,
                    COALESCE(NULLIF(pi.categoria_nombre_snapshot, ''), c.nombre, 'SIN CATEGORÍA') AS categoria,
                    COALESCE(NULLIF(pi.medio_pago_nombre_snapshot, ''), mp.nombre, 'SIN MEDIO') AS medio,
                    'INSCRIPCION' AS modalidad_codigo,
                    'INSCRIPCIÓN' AS modalidad,
                    CONCAT('INSCRIPCIÓN / ', pi.anio) AS periodo,
                    pi.anio,
                    NULL AS mes_pagado,
                    pi.monto
             FROM pagos_inscripciones pi
             LEFT JOIN socios s ON s.id_socio = pi.id_socio
             LEFT JOIN categorias c ON c.id_categoria = pi.id_categoria
             LEFT JOIN medios_pago mp ON mp.id_medio_pago = pi.id_medio_pago
             WHERE " . implode(' AND ', $where)
        );
        $statement->execute($params);
        return $statement->fetchAll();
    }

    protected static function listarIngresosDatos(PDO $db, array $filters): array
    {
        return self::listarMovimientoManual($db, 'ingreso', $filters);
    }

    protected static function listarEgresosDatos(PDO $db, array $filters): array
    {
        return self::listarMovimientoManual($db, 'egreso', $filters);
    }

    private static function listarMovimientoManual(PDO $db, string $kind, array $filters): array
    {
        $isIncome = $kind === 'ingreso';
        $table = $isIncome ? 'contable_ingresos' : 'contable_egresos';
        $idField = $isIncome ? 'id_ingreso' : 'id_egreso';
        $year = self::filtroAnio($filters['anio'] ?? null);
        $month = self::filtroMes($filters['mes'] ?? null);
        $search = self::textoBusqueda($filters['buscar'] ?? '');
        $categoryId = self::idOpcional($filters['categoria'] ?? null, 'categoría');
        $paymentMethodId = self::idOpcional($filters['medio'] ?? null, 'medio de pago');

        [$monthStart, $monthEnd] = self::rangoMes($year, $month);
        $where = ["m.estado = 'ACTIVO'", 'm.fecha >= ?', 'm.fecha < ?'];
        $params = [$monthStart, $monthEnd];
        if ($search !== '') {
            $where[] = '(m.proveedor_snapshot LIKE ? OR m.categoria_snapshot LIKE ? OR m.concepto_snapshot LIKE ? OR m.detalle LIKE ? OR m.medio_pago_snapshot LIKE ?' . ($isIncome ? ')' : ' OR m.numero_comprobante LIKE ?)');
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term, $term, $term);
            if (!$isIncome) $params[] = $term;
        }
        if ($categoryId !== null) {
            $where[] = 'm.id_categoria = ?';
            $params[] = $categoryId;
        }
        if ($paymentMethodId !== null) {
            $where[] = 'm.id_medio_pago = ?';
            $params[] = $paymentMethodId;
        }

        $extra = $isIncome
            ? ', m.origen_modulo, m.id_referencia_origen'
            : ', m.numero_comprobante, m.archivo_nombre_original, m.archivo_mime, m.archivo_tamanio, (m.archivo_path IS NOT NULL) AS tiene_archivo';
        $statement = $db->prepare(
            "SELECT m.{$idField}, m.fecha, m.id_medio_pago, m.id_proveedor, m.id_categoria, m.id_concepto,
                    m.importe, m.detalle, m.medio_pago_snapshot AS medio,
                    m.proveedor_snapshot AS proveedor, m.categoria_snapshot AS categoria,
                    m.concepto_snapshot AS concepto {$extra}
             FROM {$table} m
             WHERE " . implode(' AND ', $where) . "
             ORDER BY m.fecha DESC, m.created_at DESC, m.{$idField} DESC"
        );
        $statement->execute($params);
        $items = $statement->fetchAll();
        $total = 0;
        $categories = [];
        foreach ($items as &$item) {
            $item[$idField] = (int)$item[$idField];
            foreach (['id_medio_pago', 'id_proveedor', 'id_categoria', 'id_concepto'] as $field) {
                $item[$field] = (int)$item[$field];
            }
            $itemCents = self::centavos($item['importe']);
            $item['importe'] = self::importeDesdeCentavos($itemCents);
            if (!$isIncome) {
                $item['tiene_archivo'] = (bool)$item['tiene_archivo'];
                $item['archivo_tamanio'] = $item['archivo_tamanio'] === null ? null : (int)$item['archivo_tamanio'];
            } else {
                $item['origen_modulo'] = (string)($item['origen_modulo'] ?? 'MANUAL');
                $item['id_referencia_origen'] = $item['id_referencia_origen'] === null
                    ? null
                    : (int)$item['id_referencia_origen'];
            }
            $total += $itemCents;
            $category = (string)$item['categoria'];
            $categories[$category] ??= ['nombre' => $category, 'registros' => 0, 'total' => 0];
            $categories[$category]['registros']++;
            $categories[$category]['total'] += $itemCents;
        }
        unset($item);
        foreach ($categories as &$category) $category['total'] = self::importeDesdeCentavos($category['total']);
        unset($category);

        return [
            'items' => $items,
            'resumen' => [
                'total' => self::importeDesdeCentavos($total),
                'registros' => count($items),
                'categorias' => array_values($categories),
            ],
            'filtros' => ['anio' => $year, 'mes' => $month],
        ];
    }
}

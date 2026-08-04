<?php
declare(strict_types=1);

trait SociosConsultas
{
    private static function listarDatos(PDO $db, array $filters): array
    {
        $where = [];
        $params = [];
        $search = clean_text($filters['buscar'] ?? '', 150, false);
        if ($search !== '') {
            $where[] = '(s.nombre LIKE :buscar_nombre OR s.apellido LIKE :buscar_apellido OR s.dni LIKE :buscar_dni OR s.telefono LIKE :buscar_telefono)';
            $term = '%' . $search . '%';
            $params['buscar_nombre'] = $term;
            $params['buscar_apellido'] = $term;
            $params['buscar_dni'] = $term;
            $params['buscar_telefono'] = $term;
        }

        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }
        if ($status === 'activo') $where[] = 's.activo = 1';
        if ($status === 'inactivo') $where[] = 's.activo = 0';

        if (($category = (int)($filters['categoria'] ?? 0)) > 0) {
            $where[] = 'EXISTS (SELECT 1 FROM socio_categorias scf WHERE scf.id_socio = s.id_socio AND scf.id_categoria = :categoria AND scf.activo = 1)';
            $params['categoria'] = $category;
        }
        if (($location = (int)($filters['localidad'] ?? 0)) > 0) {
            $where[] = 's.id_localidad = :localidad';
            $params['localidad'] = $location;
        }
        if (($family = (int)($filters['familia'] ?? 0)) > 0) {
            $where[] = 'f.id_familia = :familia';
            $params['familia'] = $family;
        }
        if (trim((string)($filters['familia'] ?? '')) === 'sin_familia') {
            $where[] = 'f.id_familia IS NULL';
        }

        $from = trim((string)($filters['ingreso_desde'] ?? ''));
        $to = trim((string)($filters['ingreso_hasta'] ?? ''));
        if ($from !== '') {
            $from = valid_date($from, 'ingreso desde');
            $where[] = 's.fecha_ingreso >= :desde';
            $params['desde'] = $from;
        }
        if ($to !== '') {
            $to = valid_date($to, 'ingreso hasta');
            $where[] = 's.fecha_ingreso <= :hasta';
            $params['hasta'] = $to;
        }
        if ($from !== '' && $to !== '' && $from > $to) {
            api_error('La fecha desde no puede ser posterior a la fecha hasta.', 'FILTRO_INVALIDO');
        }

        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare(self::baseQuery($sqlWhere) . ' ORDER BY s.activo DESC, s.apellido ASC, s.nombre ASC');
        $statement->execute($params);
        $items = [];
        foreach ($statement->fetchAll() as $row) $items[] = self::cast($row);

        $summary = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(s.activo = 1) AS activos,
                    SUM(s.activo = 0) AS inactivos,
                    SUM(s.activo = 1 AND f.id_familia IS NULL) AS sin_familia,
                    SUM(s.activo = 1 AND s.fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS altas_recientes
             FROM socios s
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1'
        )->fetch();
        $families = (int)$db->query('SELECT COUNT(*) FROM familias WHERE activo = 1')->fetchColumn();

        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activos' => (int)($summary['activos'] ?? 0),
                'inactivos' => (int)($summary['inactivos'] ?? 0),
                'sin_familia' => (int)($summary['sin_familia'] ?? 0),
                'altas_recientes' => (int)($summary['altas_recientes'] ?? 0),
                'familias' => $families,
            ],
            'catalogos' => self::catalogos($db),
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $item = self::detalle($db, $id);
        if (!$item) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
        return ['item' => $item, 'catalogos' => self::catalogos($db)];
    }

    private static function catalogos(PDO $db): array
    {
        $locations = $db->query(
            'SELECT id_localidad, nombre, codigo_postal FROM localidades WHERE activo = 1 ORDER BY nombre'
        )->fetchAll();
        $categories = $db->query(
            'SELECT id_categoria, nombre, monto_actual, activo FROM categorias ORDER BY activo DESC, nombre'
        )->fetchAll();
        $families = $db->query(
            'SELECT id_familia, nombre FROM familias WHERE activo = 1 ORDER BY nombre'
        )->fetchAll();
        foreach ($locations as &$row) $row['id_localidad'] = (int)$row['id_localidad'];
        foreach ($categories as &$row) {
            $row['id_categoria'] = (int)$row['id_categoria'];
            $row['activo'] = (bool)$row['activo'];
        }
        foreach ($families as &$row) $row['id_familia'] = (int)$row['id_familia'];
        unset($row);
        return ['localidades' => $locations, 'categorias' => $categories, 'familias' => $families];
    }

    private static function baseQuery(string $extraWhere = ''): string
    {
        return "SELECT
                    s.id_socio, s.nombre, s.apellido, s.dni, s.fecha_nacimiento, s.sexo,
                    s.domicilio, s.id_localidad, l.nombre AS localidad, s.telefono, s.email,
                    s.fecha_ingreso, s.observaciones, s.activo, s.fecha_baja, s.motivo_baja,
                    s.created_at, s.updated_at,
                    f.id_familia, f.nombre AS familia,
                    GROUP_CONCAT(DISTINCT CASE WHEN sc.activo = 1 THEN c.id_categoria END ORDER BY c.nombre SEPARATOR ',') AS categoria_ids,
                    GROUP_CONCAT(DISTINCT CASE WHEN sc.activo = 1 THEN c.nombre END ORDER BY c.nombre SEPARATOR ' · ') AS categorias
                FROM socios s
                INNER JOIN localidades l ON l.id_localidad = s.id_localidad
                LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
                LEFT JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
                LEFT JOIN socio_categorias sc ON sc.id_socio = s.id_socio
                LEFT JOIN categorias c ON c.id_categoria = sc.id_categoria
                {$extraWhere}
                GROUP BY s.id_socio, l.id_localidad, f.id_familia";
    }

    private static function cast(array $row): array
    {
        $row['id_socio'] = (int)$row['id_socio'];
        $row['id_localidad'] = (int)$row['id_localidad'];
        $row['id_familia'] = $row['id_familia'] === null ? null : (int)$row['id_familia'];
        $row['activo'] = (bool)$row['activo'];
        $row['categoria_ids'] = $row['categoria_ids'] === null || $row['categoria_ids'] === ''
            ? []
            : array_map('intval', explode(',', (string)$row['categoria_ids']));
        return $row;
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare(self::baseQuery('WHERE s.id_socio = ?'));
        $statement->execute([$id]);
        $row = $statement->fetch();
        return $row ? self::cast($row) : null;
    }

    private static function historialDatos(PDO $db, int $id): array
    {
        $socio = self::detalle($db, $id);
        if (!$socio) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);

        $stmt = $db->prepare(
            'SELECT id_periodo, vigente_desde, vigente_hasta, motivo_baja, created_at
             FROM socios_periodos_activos
             WHERE id_socio = ?
             ORDER BY vigente_desde DESC, id_periodo DESC'
        );
        $stmt->execute([$id]);
        $periodos = $stmt->fetchAll();
        foreach ($periodos as &$periodo) $periodo['id_periodo'] = (int)$periodo['id_periodo'];
        unset($periodo);

        $stmt = $db->prepare(
            'SELECT sc.id_socio_categoria, sc.id_categoria, c.nombre AS categoria,
                    sc.fecha_desde, sc.fecha_hasta, sc.activo
             FROM socio_categorias sc
             INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
             WHERE sc.id_socio = ?
             ORDER BY sc.fecha_desde DESC, sc.id_socio_categoria DESC'
        );
        $stmt->execute([$id]);
        $asignaciones = $stmt->fetchAll();
        foreach ($asignaciones as &$asignacion) {
            $asignacion['id_socio_categoria'] = (int)$asignacion['id_socio_categoria'];
            $asignacion['id_categoria'] = (int)$asignacion['id_categoria'];
            $asignacion['activo'] = (bool)$asignacion['activo'];
        }
        unset($asignacion);

        // La ficha usa exactamente los mismos períodos válidos que Cuotas:
        // asignación del socio + actividad del socio + actividad de la categoría.
        $periodosCategoria = [];
        $categoriaIds = array_values(array_unique(array_map(
            static fn(array $item): int => (int)$item['id_categoria'],
            $asignaciones
        )));
        if ($categoriaIds !== []) {
            $placeholders = implode(',', array_fill(0, count($categoriaIds), '?'));
            $stmt = $db->prepare(
                "SELECT id_periodo, id_categoria, vigente_desde, vigente_hasta
                 FROM categorias_periodos_activos
                 WHERE id_categoria IN ({$placeholders})
                 ORDER BY id_categoria, vigente_desde, id_periodo"
            );
            $stmt->execute($categoriaIds);
            foreach ($stmt->fetchAll() as $periodoCategoria) {
                $categoryId = (int)$periodoCategoria['id_categoria'];
                $periodoCategoria['id_periodo'] = (int)$periodoCategoria['id_periodo'];
                $periodoCategoria['id_categoria'] = $categoryId;
                $periodosCategoria[$categoryId][] = $periodoCategoria;
            }
        }

        $stmt = $db->prepare(
            "SELECT p.id_pago, p.id_categoria, COALESCE(p.categoria_nombre_snapshot, c.nombre) AS categoria,
                    p.anio, p.id_mes, m.nombre AS mes, p.monto, p.fecha_pago, p.estado,
                    COALESCE(p.medio_pago_nombre_snapshot, mp.nombre) AS medio_pago
             FROM pagos p
             INNER JOIN meses m ON m.id_mes = p.id_mes
             INNER JOIN categorias c ON c.id_categoria = p.id_categoria
             INNER JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
             WHERE p.id_socio = ?
             ORDER BY p.anio DESC, m.numero_mes DESC, p.id_pago DESC"
        );
        $stmt->execute([$id]);
        $pagos = $stmt->fetchAll();
        $pagados = [];
        foreach ($pagos as &$pago) {
            $pago['id_pago'] = (int)$pago['id_pago'];
            $pago['id_categoria'] = (int)$pago['id_categoria'];
            $pago['anio'] = (int)$pago['anio'];
            $pago['id_mes'] = (int)$pago['id_mes'];
            $pago['monto'] = (float)$pago['monto'];
            if (in_array($pago['estado'], ['PAGADO', 'CONDONADO'], true)) {
                $pagados[$pago['id_categoria'] . ':' . $pago['anio'] . ':' . $pago['id_mes']] = true;
            }
        }
        unset($pago);

        $stmt = $db->prepare(
            "SELECT pi.id_pago_inscripcion, pi.id_categoria,
                    COALESCE(pi.categoria_nombre_snapshot, c.nombre) AS categoria,
                    pi.anio, pi.descripcion, pi.monto, pi.fecha_pago, pi.estado,
                    COALESCE(pi.medio_pago_nombre_snapshot, mp.nombre) AS medio_pago
             FROM pagos_inscripciones pi
             INNER JOIN categorias c ON c.id_categoria = pi.id_categoria
             INNER JOIN medios_pago mp ON mp.id_medio_pago = pi.id_medio_pago
             WHERE pi.id_socio = ?
             ORDER BY pi.anio DESC, pi.fecha_pago DESC, pi.id_pago_inscripcion DESC"
        );
        $stmt->execute([$id]);
        $inscripciones = $stmt->fetchAll();
        foreach ($inscripciones as &$inscripcion) {
            $inscripcion['id_pago_inscripcion'] = (int)$inscripcion['id_pago_inscripcion'];
            $inscripcion['id_categoria'] = (int)$inscripcion['id_categoria'];
            $inscripcion['anio'] = (int)$inscripcion['anio'];
            $inscripcion['monto'] = (float)$inscripcion['monto'];
        }
        unset($inscripcion);

        $hoy = new DateTimeImmutable('today');
        $pendientes = [];
        foreach ($asignaciones as $asignacion) {
            $inicioAsignacion = new DateTimeImmutable($asignacion['fecha_desde']);
            $finAsignacion = $asignacion['fecha_hasta'] ? new DateTimeImmutable($asignacion['fecha_hasta']) : $hoy;
            if ($finAsignacion > $hoy) $finAsignacion = $hoy;

            foreach ($periodos as $periodo) {
                $inicioSocio = new DateTimeImmutable($periodo['vigente_desde']);
                $finSocio = $periodo['vigente_hasta'] ? new DateTimeImmutable($periodo['vigente_hasta']) : $hoy;
                if ($finSocio > $hoy) $finSocio = $hoy;

                foreach ($periodosCategoria[(int)$asignacion['id_categoria']] ?? [] as $periodoCategoria) {
                    $inicioCategoria = new DateTimeImmutable($periodoCategoria['vigente_desde']);
                    $finCategoria = $periodoCategoria['vigente_hasta']
                        ? new DateTimeImmutable($periodoCategoria['vigente_hasta'])
                        : $hoy;
                    if ($finCategoria > $hoy) $finCategoria = $hoy;

                    $inicio = $inicioAsignacion;
                    if ($inicioSocio > $inicio) $inicio = $inicioSocio;
                    if ($inicioCategoria > $inicio) $inicio = $inicioCategoria;

                    $fin = $finAsignacion;
                    if ($finSocio < $fin) $fin = $finSocio;
                    if ($finCategoria < $fin) $fin = $finCategoria;
                    if ($inicio > $fin) continue;

                    $cursor = $inicio->modify('first day of this month');
                    $limite = $fin->modify('first day of this month');
                    while ($cursor <= $limite) {
                        $anio = (int)$cursor->format('Y');
                        $mes = (int)$cursor->format('n');
                        $clave = $asignacion['id_categoria'] . ':' . $anio . ':' . $mes;
                        if (!isset($pagados[$clave])) {
                            $pendientes[$clave] = [
                                'id_categoria' => $asignacion['id_categoria'],
                                'categoria' => $asignacion['categoria'],
                                'anio' => $anio,
                                'id_mes' => $mes,
                                'mes' => ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'][$mes - 1],
                            ];
                        }
                        $cursor = $cursor->modify('+1 month');
                    }
                }
            }
        }

        $pendientes = array_values($pendientes);
        usort($pendientes, static fn(array $a, array $b): int => [$b['anio'], $b['id_mes'], $b['categoria']] <=> [$a['anio'], $a['id_mes'], $a['categoria']]);

        $pagosVigentes = array_values(array_filter($pagos, static fn(array $p): bool => in_array($p['estado'], ['PAGADO', 'CONDONADO'], true)));
        return [
            'socio' => $socio,
            'resumen' => [
                'estado_cuenta' => count($pendientes) === 0 ? 'AL_DIA' : 'CON_DEUDA',
                'cuotas_pendientes' => count($pendientes),
                'cuotas_pagadas' => count($pagosVigentes),
                'periodos_activos' => count($periodos),
                'activo_actualmente' => (bool)$socio['activo'],
            ],
            'periodos' => $periodos,
            'categorias' => $asignaciones,
            'pagos' => $pagos,
            'pendientes' => $pendientes,
            'inscripciones' => $inscripciones,
        ];
    }

}

<?php
declare(strict_types=1);

trait CategoriasConsultas
{
    private static function listarDatos(PDO $db, array $filters): array
    {
        $search = clean_text($filters['buscar'] ?? '', 120, false);
        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }

        $where = [];
        $params = [];
        if ($search !== '') {
            $where[] = '(c.nombre LIKE :buscar_nombre OR c.descripcion LIKE :buscar_descripcion)';
            $term = '%' . $search . '%';
            $params['buscar_nombre'] = $term;
            $params['buscar_descripcion'] = $term;
        }
        if ($status === 'activo') $where[] = 'c.activo = 1';
        if ($status === 'inactivo') $where[] = 'c.activo = 0';
        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

        $statement = $db->prepare(
            "SELECT c.id_categoria, c.nombre, c.descripcion, c.monto_actual, c.activo,
                    c.created_at, c.updated_at,
                    COUNT(DISTINCT CASE WHEN sc.activo = 1 AND s.activo = 1 THEN sc.id_socio END) AS cantidad_socios
             FROM categorias c
             LEFT JOIN socio_categorias sc ON sc.id_categoria = c.id_categoria
             LEFT JOIN socios s ON s.id_socio = sc.id_socio
             {$sqlWhere}
             GROUP BY c.id_categoria
             ORDER BY c.activo DESC, c.nombre ASC"
        );
        $statement->execute($params);
        $items = $statement->fetchAll();
        foreach ($items as &$item) {
            $item['id_categoria'] = (int)$item['id_categoria'];
            $item['cantidad_socios'] = (int)$item['cantidad_socios'];
            $item['activo'] = (bool)$item['activo'];
        }
        unset($item);

        $summary = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(activo = 1) AS activas,
                    SUM(activo = 0) AS inactivas,
                    COALESCE(AVG(CASE WHEN activo = 1 THEN monto_actual END), 0) AS promedio
             FROM categorias'
        )->fetch();
        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activas' => (int)($summary['activas'] ?? 0),
                'inactivas' => (int)($summary['inactivas'] ?? 0),
                'promedio' => (string)($summary['promedio'] ?? '0.00'),
            ],
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $category = self::detalle($db, $id);
        if (!$category) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
        return ['item' => $category];
    }

    private static function historialDatos(PDO $db, int $id): array
    {
        if (!self::detalle($db, $id)) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
        $statement = $db->prepare(
            'SELECT id_historial, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo, created_at
             FROM categorias_precios_historial WHERE id_categoria = ?
             ORDER BY vigente_desde DESC, id_historial DESC'
        );
        $statement->execute([$id]);
        return ['items' => $statement->fetchAll()];
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare(
            'SELECT c.*,
                    COUNT(DISTINCT CASE WHEN sc.activo = 1 AND s.activo = 1 THEN sc.id_socio END) AS cantidad_socios
             FROM categorias c
             LEFT JOIN socio_categorias sc ON sc.id_categoria = c.id_categoria
             LEFT JOIN socios s ON s.id_socio = sc.id_socio
             WHERE c.id_categoria = ?
             GROUP BY c.id_categoria'
        );
        $statement->execute([$id]);
        $category = $statement->fetch();
        if (!$category) return null;
        $category['id_categoria'] = (int)$category['id_categoria'];
        $category['cantidad_socios'] = (int)$category['cantidad_socios'];
        $category['activo'] = (bool)$category['activo'];
        return $category;
    }
}

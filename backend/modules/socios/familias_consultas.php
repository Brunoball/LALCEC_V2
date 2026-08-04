<?php
declare(strict_types=1);

trait FamiliasConsultas
{
    private static function listarDatos(PDO $db, array $filters): array
    {
        $where = [];
        $params = [];
        $search = clean_text($filters['buscar'] ?? '', 150, false);
        if ($search !== '') {
            $where[] = '(f.nombre LIKE :buscar_familia OR f.descripcion LIKE :buscar_descripcion OR EXISTS (
                SELECT 1 FROM familia_socios fss INNER JOIN socios ss ON ss.id_socio = fss.id_socio
                WHERE fss.id_familia = f.id_familia AND (ss.nombre LIKE :buscar_socio_nombre OR ss.apellido LIKE :buscar_socio_apellido OR ss.dni LIKE :buscar_socio_dni)
            ))';
            $term = '%' . $search . '%';
            $params['buscar_familia'] = $term;
            $params['buscar_descripcion'] = $term;
            $params['buscar_socio_nombre'] = $term;
            $params['buscar_socio_apellido'] = $term;
            $params['buscar_socio_dni'] = $term;
        }

        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }
        if ($status === 'activo') $where[] = 'f.activo = 1';
        if ($status === 'inactivo') $where[] = 'f.activo = 0';

        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare("SELECT f.* FROM familias f {$sqlWhere} ORDER BY f.activo DESC, f.nombre ASC");
        $statement->execute($params);
        $items = self::hidratar($db, $statement->fetchAll());

        $summary = $db->query(
            'SELECT COUNT(*) AS total, SUM(activo = 1) AS activas, SUM(activo = 0) AS inactivas FROM familias'
        )->fetch();
        $members = (int)$db->query(
            'SELECT COUNT(*) FROM familia_socios fs
             INNER JOIN familias f ON f.id_familia = fs.id_familia
             INNER JOIN socios s ON s.id_socio = fs.id_socio
             WHERE f.activo = 1 AND s.activo = 1'
        )->fetchColumn();

        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activas' => (int)($summary['activas'] ?? 0),
                'inactivas' => (int)($summary['inactivas'] ?? 0),
                'integrantes' => $members,
            ],
            'catalogos' => ['socios' => self::sociosCatalogo($db)],
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $item = self::detalle($db, $id);
        if (!$item) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
        return ['item' => $item, 'catalogos' => ['socios' => self::sociosCatalogo($db)]];
    }

    private static function sociosCatalogo(PDO $db): array
    {
        $rows = $db->query(
            'SELECT s.id_socio, s.apellido, s.nombre, s.dni, s.activo, fs.id_familia,
                    f.nombre AS familia, f.activo AS familia_activa
             FROM socios s
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia
             ORDER BY s.activo DESC, s.apellido, s.nombre'
        )->fetchAll();
        foreach ($rows as &$row) {
            $row['id_socio'] = (int)$row['id_socio'];
            $row['id_familia'] = $row['id_familia'] === null ? null : (int)$row['id_familia'];
            $row['activo'] = (bool)$row['activo'];
            $row['familia_activa'] = $row['familia_activa'] === null ? null : (bool)$row['familia_activa'];
        }
        unset($row);
        return $rows;
    }

    private static function hidratar(PDO $db, array $families): array
    {
        if ($families === []) return [];
        $indexed = [];
        foreach ($families as $family) {
            $family['id_familia'] = (int)$family['id_familia'];
            $family['activo'] = (bool)$family['activo'];
            $family['integrantes'] = [];
            $indexed[$family['id_familia']] = $family;
        }

        $ids = array_keys($indexed);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $members = $db->prepare(
            "SELECT fs.id_familia, s.id_socio, s.nombre, s.apellido, s.dni, s.activo
             FROM familia_socios fs INNER JOIN socios s ON s.id_socio = fs.id_socio
             WHERE fs.id_familia IN ({$placeholders}) ORDER BY fs.id_familia, s.apellido, s.nombre"
        );
        $members->execute($ids);
        foreach ($members->fetchAll() as $member) {
            $familyId = (int)$member['id_familia'];
            unset($member['id_familia']);
            $member['id_socio'] = (int)$member['id_socio'];
            $member['activo'] = (bool)$member['activo'];
            $indexed[$familyId]['integrantes'][] = $member;
        }

        foreach ($indexed as &$family) {
            $family['integrante_ids'] = array_map(static fn(array $member): int => $member['id_socio'], $family['integrantes']);
            $family['cantidad_integrantes'] = count($family['integrantes']);
        }
        unset($family);
        return array_values($indexed);
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare('SELECT * FROM familias WHERE id_familia = ?');
        $statement->execute([$id]);
        $family = $statement->fetch();
        if (!$family) return null;
        return self::hidratar($db, [$family])[0] ?? null;
    }
}

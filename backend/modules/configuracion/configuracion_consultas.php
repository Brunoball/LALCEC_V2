<?php
declare(strict_types=1);

trait ConfiguracionConsultas
{
    private static function obtenerDatos(PDO $db): array
    {
        $lists = [];
        $summary = [];
        $contableActive = 0;

        foreach (configuracion_listas_definiciones() as $key => $definition) {
            $items = self::listarConfiguracion($db, $definition);
            $lists[$key] = $items;
            $activeCount = count(array_filter(
                $items,
                static fn(array $item): bool => (bool)$item['activo']
            ));
            $summary[$key . '_activos'] = $activeCount;
            if (str_starts_with($key, 'contable_')) $contableActive += $activeCount;
        }

        $summary['contable_listas_activas'] = $contableActive;
        return [
            'parametros' => [
                'monto_inscripcion' => self::montoInscripcionConfigurado($db),
            ],
            'listas' => $lists,
            'resumen' => $summary,
        ];
    }

    private static function montoInscripcionConfigurado(PDO $db): string
    {
        $statement = $db->prepare(
            "SELECT monto_fijo
             FROM modalidades_pago
             WHERE codigo = 'INSCRIPCION'
             LIMIT 1"
        );
        $statement->execute();
        $value = $statement->fetchColumn();
        if ($value === false) {
            api_error(
                'No existe la modalidad INSCRIPCION en la base del sistema.',
                'MODALIDAD_INSCRIPCION_NO_CONFIGURADA',
                500
            );
        }
        return number_format((float)($value ?? 0), 2, '.', '');
    }

    private static function listarConfiguracion(PDO $db, array $definition): array
    {
        if ($definition['tabla'] === 'medios_pago') {
            $rows = $db->query(
                "SELECT id_medio_pago, nombre, activo
                 FROM medios_pago
                 WHERE nombre <> 'CONDONACIÓN'
                 ORDER BY activo DESC, nombre"
            )->fetchAll();
        } elseif ($definition['tabla'] === 'localidades') {
            $rows = $db->query(
                'SELECT id_localidad, nombre, codigo_postal, activo
                 FROM localidades
                 ORDER BY activo DESC, nombre'
            )->fetchAll();
        } else {
            $statement = $db->prepare(
                'SELECT id_opcion, tipo, nombre, activo
                 FROM contable_opciones
                 WHERE tipo = ?
                 ORDER BY activo DESC, nombre'
            );
            $statement->execute([$definition['tipo']]);
            $rows = $statement->fetchAll();
        }

        foreach ($rows as &$row) {
            $id = (int)$row[$definition['id_campo']];
            $row[$definition['id_campo']] = $id;
            $row['activo'] = (bool)$row['activo'];
            $row['cantidad_usos'] = configuracion_cantidad_usos($db, $definition, $id);
        }
        unset($row);
        return $rows;
    }
}

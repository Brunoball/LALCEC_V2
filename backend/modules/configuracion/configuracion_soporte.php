<?php
declare(strict_types=1);

function configuracion_listas_definiciones(): array
{
    return [
        'medios_pago' => [
            'lista' => 'medios_pago',
            'tabla' => 'medios_pago',
            'id_campo' => 'id_medio_pago',
            'tipo' => null,
            'etiqueta' => 'medio de pago',
            'max_nombre' => 100,
            'entidad' => 'MEDIO_PAGO',
        ],
        'localidades' => [
            'lista' => 'localidades',
            'tabla' => 'localidades',
            'id_campo' => 'id_localidad',
            'tipo' => null,
            'etiqueta' => 'localidad',
            'max_nombre' => 120,
            'entidad' => 'LOCALIDAD',
        ],
        'contable_proveedores' => [
            'lista' => 'contable_proveedores',
            'tabla' => 'contable_opciones',
            'id_campo' => 'id_opcion',
            'tipo' => 'PROVEEDOR',
            'etiqueta' => 'persona o proveedor',
            'max_nombre' => 160,
            'entidad' => 'PROVEEDOR_CONTABLE',
        ],
        'contable_categorias_ingreso' => [
            'lista' => 'contable_categorias_ingreso',
            'tabla' => 'contable_opciones',
            'id_campo' => 'id_opcion',
            'tipo' => 'CATEGORIA_INGRESO',
            'etiqueta' => 'categoría de ingreso',
            'max_nombre' => 160,
            'entidad' => 'CATEGORIA_INGRESO',
        ],
        'contable_conceptos_ingreso' => [
            'lista' => 'contable_conceptos_ingreso',
            'tabla' => 'contable_opciones',
            'id_campo' => 'id_opcion',
            'tipo' => 'CONCEPTO_INGRESO',
            'etiqueta' => 'descripción de ingreso',
            'max_nombre' => 160,
            'entidad' => 'CONCEPTO_INGRESO',
        ],
        'contable_categorias_egreso' => [
            'lista' => 'contable_categorias_egreso',
            'tabla' => 'contable_opciones',
            'id_campo' => 'id_opcion',
            'tipo' => 'CATEGORIA_EGRESO',
            'etiqueta' => 'categoría de egreso',
            'max_nombre' => 160,
            'entidad' => 'CATEGORIA_EGRESO',
        ],
        'contable_conceptos_egreso' => [
            'lista' => 'contable_conceptos_egreso',
            'tabla' => 'contable_opciones',
            'id_campo' => 'id_opcion',
            'tipo' => 'CONCEPTO_EGRESO',
            'etiqueta' => 'descripción de egreso',
            'max_nombre' => 160,
            'entidad' => 'CONCEPTO_EGRESO',
        ],
    ];
}

function configuracion_lista_definicion(mixed $value): array
{
    $key = strtolower(trim((string)$value));
    $definitions = configuracion_listas_definiciones();
    if (!isset($definitions[$key])) {
        api_error('La lista solicitada no es válida.', 'LISTA_CONFIGURACION_INVALIDA');
    }
    return $definitions[$key];
}

function configuracion_es_medio_interno(string $name): bool
{
    $upper = function_exists('mb_strtoupper')
        ? mb_strtoupper(trim($name), 'UTF-8')
        : strtoupper(trim($name));
    $normalized = strtr($upper, [
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U',
    ]);
    return $normalized === 'CONDONACION';
}

function configuracion_item(PDO $db, array $definition, int $id, bool $lock = false): ?array
{
    $suffix = $lock ? ' FOR UPDATE' : '';
    if ($definition['tabla'] === 'medios_pago') {
        $statement = $db->prepare(
            'SELECT id_medio_pago, nombre, activo FROM medios_pago WHERE id_medio_pago = ?' . $suffix
        );
        $statement->execute([$id]);
    } elseif ($definition['tabla'] === 'localidades') {
        $statement = $db->prepare(
            'SELECT id_localidad, nombre, codigo_postal, activo FROM localidades WHERE id_localidad = ?' . $suffix
        );
        $statement->execute([$id]);
    } else {
        $statement = $db->prepare(
            'SELECT id_opcion, tipo, nombre, activo
             FROM contable_opciones
             WHERE id_opcion = ? AND tipo = ?' . $suffix
        );
        $statement->execute([$id, $definition['tipo']]);
    }

    $row = $statement->fetch();
    if (!$row) return null;
    $row[$definition['id_campo']] = (int)$row[$definition['id_campo']];
    $row['activo'] = (bool)$row['activo'];
    return $row;
}

function configuracion_cantidad_usos(PDO $db, array $definition, int $id): int
{
    switch ($definition['lista']) {
        case 'medios_pago':
            $statement = $db->prepare(
                'SELECT
                    (SELECT COUNT(*) FROM pagos WHERE id_medio_pago = ?)
                    + (SELECT COUNT(*) FROM pagos_inscripciones WHERE id_medio_pago = ?)
                    + (SELECT COUNT(*) FROM contable_ingresos WHERE id_medio_pago = ?)
                    + (SELECT COUNT(*) FROM contable_egresos WHERE id_medio_pago = ?)'
            );
            $statement->execute([$id, $id, $id, $id]);
            return (int)$statement->fetchColumn();

        case 'localidades':
            $statement = $db->prepare('SELECT COUNT(*) FROM socios WHERE id_localidad = ?');
            $statement->execute([$id]);
            return (int)$statement->fetchColumn();

        case 'contable_proveedores':
            $statement = $db->prepare(
                'SELECT
                    (SELECT COUNT(*) FROM contable_ingresos WHERE id_proveedor = ?)
                    + (SELECT COUNT(*) FROM contable_egresos WHERE id_proveedor = ?)'
            );
            $statement->execute([$id, $id]);
            return (int)$statement->fetchColumn();

        case 'contable_categorias_ingreso':
            $statement = $db->prepare('SELECT COUNT(*) FROM contable_ingresos WHERE id_categoria = ?');
            $statement->execute([$id]);
            return (int)$statement->fetchColumn();

        case 'contable_conceptos_ingreso':
            $statement = $db->prepare('SELECT COUNT(*) FROM contable_ingresos WHERE id_concepto = ?');
            $statement->execute([$id]);
            return (int)$statement->fetchColumn();

        case 'contable_categorias_egreso':
            $statement = $db->prepare('SELECT COUNT(*) FROM contable_egresos WHERE id_categoria = ?');
            $statement->execute([$id]);
            return (int)$statement->fetchColumn();

        case 'contable_conceptos_egreso':
            $statement = $db->prepare('SELECT COUNT(*) FROM contable_egresos WHERE id_concepto = ?');
            $statement->execute([$id]);
            return (int)$statement->fetchColumn();
    }

    return 0;
}
